import { ChatDeepSeek } from '@langchain/deepseek';
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { createModelAdapter } from './adapter.js';
import { enforceLangSmithTracingOff } from '../config/secrets.js';
import { ModelAdapterResultSchema, SAFE_PROVIDER_ERROR_CATEGORIES } from '../runtime/state.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { RUNTIME_LIMITS } from '../runtime/limits.js';

const MODEL_NAME = 'deepseek-flash';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const SAFE_PROVIDER_CATEGORY_SET = new Set(SAFE_PROVIDER_ERROR_CATEGORIES);
const MAX_API_KEY_LENGTH = 4096;
const ALLOWED_TOOL_NAME_SET = new Set([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

assertServerOnlyRuntime();
enforceLangSmithTracingOff();

function failureResult(providerErrorCategory) {
  return ModelAdapterResultSchema.parse({
    content: null,
    toolCalls: [],
    finishReason: 'unknown',
    providerErrorCategory,
  });
}

function isValidApiKey(apiKey) {
  if (
    typeof apiKey !== 'string'
    || apiKey.length === 0
    || apiKey.length > MAX_API_KEY_LENGTH
    || apiKey.trim() !== apiKey
  ) {
    return false;
  }

  for (const character of apiKey) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return false;
  }
  return true;
}

function safeRead(object, key) {
  try {
    if (!object || typeof object !== 'object') return undefined;
    return object[key];
  } catch {
    return undefined;
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function readOwnDataFields(value, expectedFields) {
  if (!isPlainRecord(value)) throw new TypeError('Unsupported model transcript message.');
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError('Unsupported model transcript message.');
  }

  const fields = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!expectedFields.has(key) || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Unsupported model transcript message.');
    }
    fields[key] = descriptor.value;
  }
  return fields;
}

function readOwnDataValue(value, key) {
  if (!isPlainRecord(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function parseToolCallArguments(argumentsText) {
  if (typeof argumentsText !== 'string') {
    throw new TypeError('Unsupported model tool call.');
  }

  let args;
  try {
    args = JSON.parse(argumentsText);
  } catch {
    throw new TypeError('Unsupported model tool call.');
  }
  if (!isPlainRecord(args)) throw new TypeError('Unsupported model tool call.');
  return args;
}

/**
 * Convert the bounded internal transcript to LangChain messages. Provider tool
 * arguments are JSON text in this internal DTO; they are parsed only to build
 * the LangChain AIMessage after the graph has validated and executed each call.
 * Tool responses must match a preceding assistant call ID and name.
 */
function toLangChainMessages(messages) {
  if (!Array.isArray(messages) || messages.length > RUNTIME_LIMITS.maxGraphSteps) {
    throw new TypeError('Unsupported model transcript.');
  }

  const converted = [];
  const pendingToolCalls = new Map();
  const seenToolCallIds = new Set();

  for (const message of messages) {
    const role = readOwnDataValue(message, 'role');
    const allowedFields = role === 'assistant'
      ? new Set(['role', 'content', 'toolCalls'])
      : role === 'tool'
        ? new Set(['role', 'content', 'toolCallId', 'toolName'])
        : new Set(['role', 'content']);
    const fields = readOwnDataFields(message, allowedFields);

    if (typeof fields.content !== 'string') {
      throw new TypeError('Unsupported model transcript message.');
    }

    if (fields.role === 'system') {
      converted.push(new SystemMessage(fields.content));
      continue;
    }
    if (fields.role === 'user') {
      converted.push(new HumanMessage(fields.content));
      continue;
    }
    if (fields.role === 'assistant') {
      if (!Object.hasOwn(fields, 'toolCalls')) {
        converted.push(new AIMessage(fields.content));
        continue;
      }
      if (!Array.isArray(fields.toolCalls) || fields.toolCalls.length === 0) {
        throw new TypeError('Unsupported model transcript message.');
      }

      const toolCalls = fields.toolCalls.map((call) => {
        const callFields = readOwnDataFields(call, new Set(['id', 'name', 'arguments']));
        if (
          typeof callFields.id !== 'string'
          || callFields.id.length === 0
          || typeof callFields.name !== 'string'
          || !ALLOWED_TOOL_NAME_SET.has(callFields.name)
          || seenToolCallIds.has(callFields.id)
        ) {
          throw new TypeError('Unsupported model transcript tool call.');
        }

        const args = parseToolCallArguments(callFields.arguments);
        seenToolCallIds.add(callFields.id);
        pendingToolCalls.set(callFields.id, callFields.name);
        return {
          id: callFields.id,
          name: callFields.name,
          args,
          type: 'tool_call',
        };
      });

      converted.push(new AIMessage({ content: fields.content, tool_calls: toolCalls }));
      continue;
    }
    if (fields.role === 'tool') {
      const toolCallId = fields.toolCallId;
      const toolName = fields.toolName;
      if (
        typeof toolCallId !== 'string'
        || typeof toolName !== 'string'
        || !ALLOWED_TOOL_NAME_SET.has(toolName)
        || pendingToolCalls.get(toolCallId) !== toolName
      ) {
        throw new TypeError('Unsupported model transcript tool result.');
      }

      pendingToolCalls.delete(toolCallId);
      converted.push(new ToolMessage({
        content: fields.content,
        tool_call_id: toolCallId,
        name: toolName,
      }));
      continue;
    }

    throw new TypeError('Unsupported model transcript role.');
  }

  if (pendingToolCalls.size > 0) {
    throw new TypeError('Model transcript has an unresolved tool call.');
  }

  return converted;
}

function classifyProviderError(error, signal) {
  if (signal?.aborted) return 'cancelled';

  const explicitCategory = safeRead(error, 'providerErrorCategory');
  if (SAFE_PROVIDER_CATEGORY_SET.has(explicitCategory)) return explicitCategory;

  const name = safeRead(error, 'name');
  if (name === 'TimeoutError' || name === 'APIConnectionTimeoutError') return 'timeout';
  if (name === 'AbortError') return 'cancelled';
  if (name === 'SyntaxError' || name === 'TypeError' || name === 'InvalidResponseError') {
    return 'unsupported_response';
  }

  const status = safeRead(error, 'status') ?? safeRead(safeRead(error, 'response'), 'status');
  if (Number.isInteger(status) && status >= 100 && status <= 599) {
    if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
      return 'transient';
    }
    if (status >= 400) return 'permanent';
  }

  if (name === 'APIConnectionError' || name === 'InternalServerError' || name === 'RateLimitError') {
    return 'transient';
  }

  return 'unknown';
}

function normalizeFinishReason(rawReason) {
  if (
    rawReason === 'stop'
    || rawReason === 'length'
    || rawReason === 'tool_calls'
    || rawReason === 'content_filter'
  ) {
    return rawReason;
  }
  return 'unknown';
}

function normalizeToolCall(call) {
  const id = safeRead(call, 'id');
  const name = safeRead(call, 'name');
  const args = safeRead(call, 'args');

  if (typeof id !== 'string' || id.length === 0 || typeof name !== 'string' || name.length === 0) {
    throw new TypeError('Unsupported provider tool call.');
  }

  let argumentsText;
  if (typeof args === 'string') {
    argumentsText = args;
  } else {
    try {
      argumentsText = JSON.stringify(args);
    } catch {
      throw new TypeError('Unsupported provider tool arguments.');
    }
  }

  if (typeof argumentsText !== 'string') {
    throw new TypeError('Unsupported provider tool arguments.');
  }

  return { id, name, arguments: argumentsText };
}

function normalizeUsage(message) {
  const responseMetadata = safeRead(message, 'response_metadata');
  const tokenUsage = safeRead(responseMetadata, 'tokenUsage');
  const usageMetadata = safeRead(message, 'usage_metadata');
  const candidates = {
    inputTokens: safeRead(tokenUsage, 'promptTokens') ?? safeRead(usageMetadata, 'input_tokens'),
    outputTokens: safeRead(tokenUsage, 'completionTokens') ?? safeRead(usageMetadata, 'output_tokens'),
    totalTokens: safeRead(tokenUsage, 'totalTokens') ?? safeRead(usageMetadata, 'total_tokens'),
  };
  const usage = {};

  for (const [key, value] of Object.entries(candidates)) {
    if (Number.isSafeInteger(value) && value >= 0) usage[key] = value;
  }

  return Object.keys(usage).length === 0 ? undefined : usage;
}

function normalizeMessage(message, signal) {
  if (!message || typeof message !== 'object') return failureResult('unsupported_response');

  const content = safeRead(message, 'content');
  if (content !== null && typeof content !== 'string') return failureResult('unsupported_response');

  const validToolCalls = safeRead(message, 'tool_calls') ?? [];
  const invalidToolCalls = safeRead(message, 'invalid_tool_calls') ?? [];
  if (!Array.isArray(validToolCalls) || !Array.isArray(invalidToolCalls)) {
    return failureResult('unsupported_response');
  }

  let toolCalls;
  try {
    toolCalls = [...validToolCalls, ...invalidToolCalls].map(normalizeToolCall);
  } catch {
    return failureResult('unsupported_response');
  }

  const responseMetadata = safeRead(message, 'response_metadata');
  const rawFinishReason = safeRead(responseMetadata, 'finish_reason')
    ?? safeRead(responseMetadata, 'finishReason');
  const finishReason = normalizeFinishReason(rawFinishReason);

  if (rawFinishReason === 'insufficient_system_resource') return failureResult('transient');
  if (rawFinishReason === 'aborted') {
    return failureResult(signal?.aborted ? 'cancelled' : 'unsupported_response');
  }

  if (
    finishReason === 'unknown'
    || (content === null && toolCalls.length === 0)
    || (typeof content === 'string' && content.trim().length === 0 && toolCalls.length === 0)
  ) {
    return failureResult(signal?.aborted ? 'cancelled' : 'unsupported_response');
  }

  const normalized = {
    content,
    toolCalls,
    finishReason,
  };
  const usage = normalizeUsage(message);
  if (usage) normalized.usage = usage;

  const parsed = ModelAdapterResultSchema.safeParse(normalized);
  return parsed.success ? parsed.data : failureResult('unsupported_response');
}

/**
 * Create the server-only DeepSeek adapter. The API key must be injected by
 * server configuration; this module never reads the environment for it.
 */
export function createDeepSeekModelAdapter({ apiKey, fetchImpl } = {}) {
  assertServerOnlyRuntime();
  enforceLangSmithTracingOff();

  let model;
  let configurationValid = isValidApiKey(apiKey)
    && (fetchImpl === undefined || typeof fetchImpl === 'function');

  if (configurationValid) {
    try {
      const configuration = {
        baseURL: DEEPSEEK_BASE_URL,
        maxRetries: 0,
      };
      if (fetchImpl !== undefined) configuration.fetch = fetchImpl;

      model = new ChatDeepSeek({
        apiKey,
        model: MODEL_NAME,
        streaming: false,
        disableStreaming: true,
        timeout: RUNTIME_LIMITS.modelTimeoutMs,
        maxTokens: RUNTIME_LIMITS.maxOutputTokens,
        maxRetries: 0,
        modelKwargs: {
          thinking: { type: 'disabled' },
          stream: false,
        },
        configuration,
      });
    } catch {
      configurationValid = false;
    }
  }

  const invoke = async ({ messages, tools, signal }) => {
    if (!configurationValid || !model) return failureResult('configuration');

    try {
      const langChainMessages = toLangChainMessages(messages);
      const runnable = tools.length > 0 ? model.bindTools(tools) : model;
      const response = await runnable.invoke(langChainMessages, {
        signal,
        maxTokens: RUNTIME_LIMITS.maxOutputTokens,
        maxRetries: 0,
      });
      return normalizeMessage(response, signal);
    } catch (error) {
      return failureResult(classifyProviderError(error, signal));
    }
  };

  return createModelAdapter({ invoke });
}
