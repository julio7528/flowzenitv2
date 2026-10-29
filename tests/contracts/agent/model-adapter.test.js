import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { createDeepSeekModelAdapter } from '../../../server/agent/model/deepseek.js';

const SYNTHETIC_API_KEY = 'synthetic-deepseek-test-key';
const SYNTHETIC_TOOL_NAME = 'getItemById';
const SYNTHETIC_MESSAGES = Object.freeze([
  Object.freeze({ role: 'user', content: 'Read synthetic item 41.' }),
]);

function syntheticCompletion({
  content = null,
  toolCalls = [],
  finishReason = 'stop',
  usage = { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
} = {}) {
  return {
    id: 'chatcmpl-synthetic',
    object: 'chat.completion',
    created: 1,
    model: 'deepseek-flash',
    choices: [{
      index: 0,
      finish_reason: finishReason,
      message: {
        role: 'assistant',
        content,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
    }],
    usage,
  };
}

function jsonResponse(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeSyntheticReadTool() {
  return tool(async ({ itemId }) => ({ itemId }), {
    name: SYNTHETIC_TOOL_NAME,
    description: 'Read one synthetic item by its persistent identifier.',
    schema: z.strictObject({ itemId: z.string().regex(/^\d+$/) }),
  });
}

function createAdapter(fetchImpl) {
  return createDeepSeekModelAdapter({
    apiKey: SYNTHETIC_API_KEY,
    fetchImpl,
  });
}

function captureFetch(payload, options) {
  let request;
  const fetchImpl = async (input, init) => {
    request = {
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body ?? '{}'),
      signal: init?.signal,
    };
    return jsonResponse(payload, options);
  };
  return { fetchImpl, getRequest: () => request };
}

test('ChatDeepSeek sends bounded deepseek-flash non-thinking request with a typed tool schema', async () => {
  const { fetchImpl, getRequest } = captureFetch(syntheticCompletion({
    toolCalls: [{
      id: 'call-synthetic-1',
      type: 'function',
      function: { name: SYNTHETIC_TOOL_NAME, arguments: '{"itemId":"41"}' },
    }],
    finishReason: 'tool_calls',
  }));

  const adapter = createAdapter(fetchImpl);
  const result = await adapter.complete({
    messages: SYNTHETIC_MESSAGES,
    tools: [makeSyntheticReadTool()],
  });

  const request = getRequest();
  assert.ok(request, 'the mocked transport receives the request');
  assert.equal(new URL(request.url).origin, 'https://api.deepseek.com');
  assert.equal(new URL(request.url).pathname, '/chat/completions');
  assert.equal(request.body.model, 'deepseek-flash');
  assert.deepEqual(request.body.thinking, { type: 'disabled' });
  assert.equal(request.body.max_tokens, 2_048);
  assert.equal(request.body.stream, false);
  assert.equal(request.body.tools.length, 1);
  assert.equal(request.body.tools[0].type, 'function');
  assert.equal(request.body.tools[0].function.name, SYNTHETIC_TOOL_NAME);
  assert.deepEqual(request.body.tools[0].function.parameters, {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { itemId: { type: 'string', pattern: '^\\d+$' } },
    required: ['itemId'],
    additionalProperties: false,
  });

  assert.equal(result.finishReason, 'tool_calls');
  assert.equal(result.content, '');
  assert.deepEqual(result.toolCalls, [{
    id: 'call-synthetic-1',
    name: SYNTHETIC_TOOL_NAME,
    arguments: '{"itemId":"41"}',
  }]);
  assert.deepEqual(result.usage, {
    inputTokens: 11,
    outputTokens: 4,
    totalTokens: 15,
  });
  assert.equal(result.providerErrorCategory, undefined);
});

test('malformed provider tool arguments stay untrusted text for local schema rejection', async () => {
  const { fetchImpl } = captureFetch(syntheticCompletion({
    toolCalls: [{
      id: 'call-malformed',
      type: 'function',
      function: { name: SYNTHETIC_TOOL_NAME, arguments: '{"itemId":' },
    }],
    finishReason: 'tool_calls',
  }));

  const result = await createAdapter(fetchImpl).complete({
    messages: SYNTHETIC_MESSAGES,
    tools: [makeSyntheticReadTool()],
  });

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].name, SYNTHETIC_TOOL_NAME);
  assert.equal(result.toolCalls[0].arguments, '{"itemId":');
  assert.equal(result.providerErrorCategory, undefined);
});

test('follow-up transcript pairs the assistant tool call with its matching tool result', async () => {
  const { fetchImpl, getRequest } = captureFetch(syntheticCompletion({
    content: 'Synthetic final answer.',
  }));

  const result = await createAdapter(fetchImpl).complete({
    messages: [
      { role: 'user', content: 'Read synthetic item 41.' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{
          id: 'call-synthetic-1',
          name: SYNTHETIC_TOOL_NAME,
          arguments: '{"itemId":"41"}',
        }],
      },
      {
        role: 'tool',
        toolCallId: 'call-synthetic-1',
        toolName: SYNTHETIC_TOOL_NAME,
        content: '{"result":{"id":"41"}}',
      },
    ],
  });

  const requestMessages = getRequest().body.messages;
  assert.equal(requestMessages.length, 3);
  assert.equal(requestMessages[1].role, 'assistant');
  assert.equal(requestMessages[1].tool_calls.length, 1);
  assert.equal(requestMessages[1].tool_calls[0].id, 'call-synthetic-1');
  assert.equal(requestMessages[1].tool_calls[0].function.name, SYNTHETIC_TOOL_NAME);
  assert.deepEqual(JSON.parse(requestMessages[1].tool_calls[0].function.arguments), { itemId: '41' });
  assert.equal(requestMessages[2].role, 'tool');
  assert.equal(requestMessages[2].tool_call_id, 'call-synthetic-1');
  assert.equal(requestMessages[2].name, SYNTHETIC_TOOL_NAME);
  assert.equal(requestMessages[2].content, '{"result":{"id":"41"}}');
  assert.equal(result.content, 'Synthetic final answer.');
});

test('a mismatched or malformed internal tool transcript is rejected before transport', async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return jsonResponse(syntheticCompletion({ content: 'unexpected' }));
  };
  const adapter = createAdapter(fetchImpl);

  const mismatch = await adapter.complete({
    messages: [
      { role: 'assistant', content: '', toolCalls: [{
        id: 'call-expected', name: SYNTHETIC_TOOL_NAME, arguments: '{"itemId":"41"}',
      }] },
      { role: 'tool', toolCallId: 'call-other', toolName: SYNTHETIC_TOOL_NAME, content: '{}' },
    ],
  });
  const malformed = await adapter.complete({
    messages: [
      { role: 'assistant', content: '', toolCalls: [{
        id: 'call-malformed', name: SYNTHETIC_TOOL_NAME, arguments: '{"itemId":',
      }] },
      { role: 'tool', toolCallId: 'call-malformed', toolName: SYNTHETIC_TOOL_NAME, content: '{}' },
    ],
  });

  assert.equal(mismatch.providerErrorCategory, 'unsupported_response');
  assert.equal(malformed.providerErrorCategory, 'unsupported_response');
  assert.equal(fetchCalls, 0);
});

test('a model timeout is normalized without exposing the underlying exception', async () => {
  const fetchImpl = async () => {
    throw new DOMException('Synthetic timeout detail', 'TimeoutError');
  };

  const result = await createAdapter(fetchImpl).complete({ messages: SYNTHETIC_MESSAGES });

  assert.equal(result.providerErrorCategory, 'timeout');
  assert.equal(result.content, null);
  assert.deepEqual(result.toolCalls, []);
  assert.equal(JSON.stringify(result).includes('Synthetic timeout detail'), false);
});

test('caller cancellation reaches the mocked transport and normalizes as cancelled', async () => {
  const controller = new AbortController();
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const fetchImpl = async (_input, init) => new Promise((_resolve, reject) => {
    markStarted();
    if (!(init.signal instanceof AbortSignal)) {
      reject(new Error('Expected an AbortSignal at the transport boundary.'));
      return;
    }
    if (init.signal?.aborted) {
      reject(new DOMException('Synthetic cancellation detail', 'AbortError'));
      return;
    }
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('Synthetic cancellation detail', 'AbortError'));
    }, { once: true });
  });

  const pending = createAdapter(fetchImpl).complete({
    messages: SYNTHETIC_MESSAGES,
    signal: controller.signal,
  });
  await started;
  controller.abort();
  const result = await pending;

  assert.equal(result.providerErrorCategory, 'cancelled');
  assert.equal(result.content, null);
  assert.deepEqual(result.toolCalls, []);
  assert.equal(JSON.stringify(result).includes('Synthetic cancellation detail'), false);
});

test('provider HTTP failures are categorized and never reflect raw provider bodies', async () => {
  const fetchImpl = async () => jsonResponse({
    error: { message: 'synthetic-private-provider-body', type: 'authentication_error' },
  }, { status: 401 });

  const result = await createAdapter(fetchImpl).complete({ messages: SYNTHETIC_MESSAGES });

  assert.equal(result.providerErrorCategory, 'permanent');
  assert.equal(JSON.stringify(result).includes('synthetic-private-provider-body'), false);
  assert.equal(JSON.stringify(result).includes(SYNTHETIC_API_KEY), false);
});
