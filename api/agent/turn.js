import { createClient } from '@supabase/supabase-js';
import { getDeepSeekApiKey, getHierarchyCursorSecret } from '../../server/agent/config/secrets.js';
import { createSafeErrorResponse, httpStatusForOutcome, SAFE_ERROR_CODES } from '../../server/agent/http/errors.js';
import { createDeepSeekModelAdapter } from '../../server/agent/model/deepseek.js';
import { composeAgentResponse } from '../../server/agent/runtime/response.js';
import { RUNTIME_LIMITS, assertResponseBodyWithinLimit } from '../../server/agent/runtime/limits.js';
import { createAgentTurnRunner } from '../../server/agent/runtime/turn.js';
import {
  AgentTurnRequestSchema,
  TerminalOutcomeSchema,
  TrustedTurnContextReferenceSchema,
  createTerminalOutcomeDTO,
  createTrustedTurnContext,
} from '../../server/agent/runtime/state.js';
import { PRODUCTION_ACCESS_GATE, productionCapabilityPolicy } from '../../server/agent/runtime/capabilities.js';
import { createToolExecutor } from '../../server/agent/tools/execute.js';
import { createAgentToolRegistry } from '../../server/agent/tools/registry.js';
import { assertServerOnlyRuntime } from '../../server/agent/runtime/server-only.js';
import { createDomainReadTools } from '../../server/domain/read/index.js';
import { createReadRepository } from '../../server/domain/read/repository.js';
import { createSupabaseWriteRepository } from '../../server/domain/write/supabase-repository.js';
import { createWriteCapabilityRegistry } from '../../server/agent/tools/write-capabilities.js';
import { createSupabaseRecurrenceRepository } from '../../server/domain/recurrence/supabase-repository.js';
import { createRecurrenceCapabilities } from '../../server/agent/tools/recurrence-capabilities.js';

assertServerOnlyRuntime();

const JSON_CONTENT_TYPE = 'application/json';
const FALLBACK_TEXT = 'The turn could not be completed.';
const FALLBACK_ANSWER = Object.freeze({
  text: FALLBACK_TEXT,
  evidence: Object.freeze([]),
  inference: Object.freeze([FALLBACK_TEXT]),
  missingEvidence: Object.freeze([]),
  uncompletedActions: Object.freeze([]),
});

export const config = Object.freeze({
  api: Object.freeze({ bodyParser: false }),
});

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function safeErrorResponse(code, correlationId) {
  const result = createSafeErrorResponse(code, correlationId);
  return jsonResponse(result.status, result.body);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function supportsJsonContentType(headers) {
  let contentType;
  try {
    contentType = headers.get('content-type');
  } catch {
    return false;
  }
  if (typeof contentType !== 'string' || contentType.length === 0) return false;

  const [mediaType, ...parameters] = contentType.split(';').map((part) => part.trim());
  if (mediaType.toLowerCase() !== JSON_CONTENT_TYPE) return false;

  for (const parameter of parameters) {
    if (!parameter.toLowerCase().startsWith('charset=')) continue;
    const charset = parameter.slice(parameter.indexOf('=') + 1).trim().replace(/^"|"$/g, '');
    if (charset.toLowerCase() !== 'utf-8') return false;
  }

  return true;
}

function contentLengthExceedsLimit(headers) {
  try {
    const value = headers.get('content-length');
    if (value === null || !/^\d+$/.test(value.trim())) return false;
    return Number(value) > RUNTIME_LIMITS.maxRequestBytes;
  } catch {
    return false;
  }
}

async function readBoundedBody(request) {
  if (contentLengthExceedsLimit(request.headers)) {
    try {
      void request.body?.cancel().catch(() => {});
    } catch {
      // Reject the oversized body without waiting for the stream to drain.
    }
    return { ok: false, errorCode: SAFE_ERROR_CODES.PAYLOAD_TOO_LARGE };
  }

  let reader;
  try {
    if (request.body === null) return { ok: true, bytes: new Uint8Array() };
    reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        return { ok: false, errorCode: SAFE_ERROR_CODES.INVALID_REQUEST };
      }

      totalBytes += value.byteLength;
      if (totalBytes > RUNTIME_LIMITS.maxRequestBytes) {
        void reader.cancel().catch(() => {});
        return { ok: false, errorCode: SAFE_ERROR_CODES.PAYLOAD_TOO_LARGE };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, bytes };
  } catch {
    if (request.signal?.aborted) return { ok: false, cancelled: true };
    return { ok: false, errorCode: SAFE_ERROR_CODES.INVALID_REQUEST };
  } finally {
    try {
      reader?.releaseLock();
    } catch {
      // The request body reader may already have been cancelled or released.
    }
  }
}

async function parseRequest(request) {
  if (!request || !request.headers || typeof request.headers.get !== 'function') {
    return { ok: false, errorCode: SAFE_ERROR_CODES.INVALID_REQUEST };
  }
  if (!supportsJsonContentType(request.headers)) {
    return { ok: false, errorCode: SAFE_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE };
  }

  const body = await readBoundedBody(request);
  if (!body.ok) return body;

  let value;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body.bytes);
    value = JSON.parse(decoded);
  } catch {
    return { ok: false, errorCode: SAFE_ERROR_CODES.INVALID_REQUEST };
  }

  const parsed = AgentTurnRequestSchema.safeParse(value);
  if (!parsed.success) return { ok: false, errorCode: SAFE_ERROR_CODES.INVALID_REQUEST };
  return { ok: true, request: parsed.data };
}

function policyAllowsProvider(decision) {
  try {
    return isObject(decision)
      && decision.accessDecision === 'allow'
      && decision.disclosureDecision === 'allow'
      && decision.mayInvokeProvider === true;
  } catch {
    return false;
  }
}

function readOwnDataRecord(value, allowedKeys) {
  if (!isObject(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      return null;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Object.getOwnPropertyNames(value);
    if (names.some((name) => !allowedKeys.includes(name))) return null;
    for (const name of names) {
      const descriptor = descriptors[name];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
    }
    return descriptors;
  } catch {
    return null;
  }
}

function normalizeAnswer(answer) {
  const descriptors = readOwnDataRecord(answer, [
    'text',
    'evidence',
    'inference',
    'missingEvidence',
    'uncompletedActions',
  ]);
  if (!descriptors) throw new TypeError('Invalid terminal answer.');

  const text = descriptors.text?.value;
  const evidence = descriptors.evidence?.value;
  const missingEvidence = descriptors.missingEvidence?.value;
  const uncompletedActions = descriptors.uncompletedActions?.value;

  if (typeof text !== 'string'
    || !Array.isArray(evidence)
    || !Array.isArray(missingEvidence)
    || !Array.isArray(uncompletedActions)) {
    throw new TypeError('Invalid terminal answer.');
  }

  return composeAgentResponse({
    text,
    toolResults: evidence,
    missingEvidence,
    uncompletedActions,
  });
}

function isMatchingRuntimeContext(value, expected) {
  const parsed = TrustedTurnContextReferenceSchema.safeParse(value);
  if (!parsed.success) return false;
  return parsed.data.requestId === expected.requestId
    && parsed.data.turnId === expected.turnId
    && parsed.data.correlationId === expected.correlationId
    && parsed.data.graphVersion === expected.graphVersion;
}

function serializeBounded(status, body, request, trustedContext) {
  let serialized;
  try {
    serialized = JSON.stringify(body);
    assertResponseBodyWithinLimit(serialized);
  } catch {
    const dto = createTerminalOutcomeDTO({
      request,
      trustedContext,
      outcome: 'failed',
    });
    const boundedFailure = { ...dto, answer: FALLBACK_ANSWER };
    const fallback = JSON.stringify(boundedFailure);
    if (Buffer.byteLength(fallback, 'utf8') <= RUNTIME_LIMITS.maxResponseBytes) {
      return jsonResponse(httpStatusForOutcome('failed'), boundedFailure);
    }

    const smallError = createSafeErrorResponse(SAFE_ERROR_CODES.INTERNAL_ERROR, trustedContext.correlationId);
    return jsonResponse(smallError.status, smallError.body);
  }

  return jsonResponse(status, body);
}

function terminalResponse({ request, trustedContext, outcome, answer }) {
  const parsedOutcome = TerminalOutcomeSchema.safeParse(outcome);
  const safeOutcome = parsedOutcome.success ? parsedOutcome.data : 'failed';
  const safeAnswer = parsedOutcome.success ? answer : FALLBACK_ANSWER;
  const dto = createTerminalOutcomeDTO({ request, trustedContext, outcome: safeOutcome });
  return serializeBounded(httpStatusForOutcome(safeOutcome), {
    ...dto,
    answer: safeAnswer,
  }, request, trustedContext);
}

function failedTerminalResponse(request, trustedContext) {
  return terminalResponse({
    request,
    trustedContext,
    outcome: 'failed',
    answer: FALLBACK_ANSWER,
  });
}

/** Internal route constructor for deterministic synthetic integration tests. */
export function createAgentTurnHandler({
  runTurn,
  capabilityPolicy = productionCapabilityPolicy,
} = {}) {
  if (runTurn !== undefined && typeof runTurn !== 'function') {
    throw new TypeError('The internal turn runner must be a function.');
  }
  if (typeof capabilityPolicy !== 'function') {
    throw new TypeError('The server capability policy must be a function.');
  }

  return async function handleAgentTurn(request) {
    let trustedContext;
    try {
      trustedContext = createTrustedTurnContext();
    } catch {
      return safeErrorResponse(SAFE_ERROR_CODES.INTERNAL_ERROR, 'unavailable');
    }

    if (request?.method !== 'POST') {
      return safeErrorResponse(SAFE_ERROR_CODES.METHOD_NOT_ALLOWED, trustedContext.correlationId);
    }

    const parsed = await parseRequest(request);
    if (!parsed.ok) {
      if (parsed.cancelled || request.signal?.aborted) {
        return safeErrorResponse(SAFE_ERROR_CODES.INVALID_REQUEST, trustedContext.correlationId);
      }
      return safeErrorResponse(parsed.errorCode, trustedContext.correlationId);
    }

    let accessDecision;
    try {
      accessDecision = await capabilityPolicy(trustedContext);
    } catch {
      accessDecision = null;
    }

    if (!policyAllowsProvider(accessDecision) || !runTurn) {
      return safeErrorResponse(SAFE_ERROR_CODES.CAPABILITY_DISABLED, trustedContext.correlationId);
    }

    if (request.signal?.aborted) {
      return terminalResponse({
        request: parsed.request,
        trustedContext,
        outcome: 'cancelled',
        answer: FALLBACK_ANSWER,
      });
    }

    try {
      const result = await runTurn({
        request: parsed.request,
        trustedContext,
        signal: request.signal,
      });
      if (!isObject(result)) return failedTerminalResponse(parsed.request, trustedContext);

      const resultDescriptors = readOwnDataRecord(result, ['terminalOutcome', 'trustedContext', 'answer']);
      if (!resultDescriptors
        || !isMatchingRuntimeContext(resultDescriptors.trustedContext?.value, trustedContext)) {
        return failedTerminalResponse(parsed.request, trustedContext);
      }

      let answer;
      try {
        answer = normalizeAnswer(resultDescriptors.answer?.value);
      } catch {
        return failedTerminalResponse(parsed.request, trustedContext);
      }

      return terminalResponse({
        request: parsed.request,
        // Only the server-created context remains authoritative for response
        // identifiers; the runner returns a narrow reference for correlation.
        trustedContext,
        outcome: resultDescriptors.terminalOutcome?.value,
        answer,
      });
    } catch {
      return failedTerminalResponse(parsed.request, trustedContext);
    }
  };
}

function createProductionTurnRunner() {
  const environment = process.env;
  const supabaseUrl = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL;
  const publishableKey = environment.SUPABASE_PUBLISHABLE_KEY
    || environment.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (typeof supabaseUrl !== 'string' || supabaseUrl.length === 0
    || typeof publishableKey !== 'string' || publishableKey.length === 0) {
    throw new Error('Agent Supabase configuration is unavailable.');
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const repository = createReadRepository(supabase);
  const writeRepository = createSupabaseWriteRepository(supabase);
  const recurrenceRepository = createSupabaseRecurrenceRepository(supabase);
  const domainReadTools = createDomainReadTools(repository, {
    cursorSecret: getHierarchyCursorSecret(),
  });
  const writeCapabilities = createWriteCapabilityRegistry({
    accessGate: {
      allowsWrite: async ({ operation }) => PRODUCTION_ACCESS_GATE === 'open'
        && ['create_task', 'create_subtask'].includes(operation),
    },
    writeRepository,
  });
  const recurrenceCapabilities = createRecurrenceCapabilities({
    readTools: domainReadTools,
    recurrenceRepository,
  });
  const toolSet = createAgentToolRegistry(domainReadTools, { writeCapabilities, recurrenceCapabilities });
  const toolExecutor = createToolExecutor({
    registry: toolSet.registry,
    capabilityPolicy: productionCapabilityPolicy,
  });

  return createAgentTurnRunner({
    modelAdapter: createDeepSeekModelAdapter({ apiKey: getDeepSeekApiKey() }),
    toolExecutor,
    capabilityPolicy: productionCapabilityPolicy,
    modelTools: toolSet.modelTools,
    toolRegistry: toolSet.registry,
  });
}

let productionRunTurn;

async function runProductionTurn(input) {
  if (!productionRunTurn) productionRunTurn = createProductionTurnRunner();
  return productionRunTurn(input);
}

const defaultHandler = createAgentTurnHandler({
  runTurn: runProductionTurn,
  capabilityPolicy: productionCapabilityPolicy,
});

export default defaultHandler;
