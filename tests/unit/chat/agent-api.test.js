import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAgentApi } from '../../../src/lib/agentApi.js';

function responseBody(overrides = {}) {
  return {
    turnId: '00000000-0000-4000-8000-000000000001',
    conversationId: null,
    graphVersion: 'agent-turn-v1',
    outcome: 'completed',
    correlationId: '00000000-0000-4000-8000-000000000002',
    answer: {
      text: 'Resposta sintética.',
      evidence: [],
      inference: [],
      missingEvidence: [],
      uncompletedActions: [],
    },
    ...overrides,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('agent API sends a same-origin bounded request with only the current turn and up to eight prior messages', async () => {
  let request;
  const api = createAgentApi({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return jsonResponse(responseBody());
    },
  });
  const activeChatMessages = Array.from({ length: 8 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `Mensagem anterior ${index + 1}`,
  }));

  const result = await api.sendTurn({ message: 'O que está pendente?', activeChatMessages });

  assert.equal(request.url, '/api/agent/turn');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['content-type'], 'application/json');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body, { message: 'O que está pendente?', activeChatMessages });
  assert.ok(new TextEncoder().encode(request.options.body).byteLength <= 8_192);
  assert.equal(result.outcome, 'completed');
});

test('agent API rejects more than eight prior messages and an oversized UTF-8 request before fetch', async () => {
  let calls = 0;
  const api = createAgentApi({ fetchImpl: async () => { calls += 1; return jsonResponse(responseBody()); } });
  const nineMessages = Array.from({ length: 9 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `Anterior ${index}`,
  }));

  await assert.rejects(api.sendTurn({ message: 'Oi', activeChatMessages: nineMessages }), error => error.kind === 'invalid-request');
  await assert.rejects(api.sendTurn({ message: 'x'.repeat(9_000) }), error => error.kind === 'payload-too-large');
  assert.equal(calls, 0);
});

test('agent API validates terminal response fields and does not expose malformed provider data', async () => {
  const api = createAgentApi({
    fetchImpl: async () => jsonResponse({
      ...responseBody(),
      answer: { text: '<script>leak</script>', evidence: [], inference: [] },
      providerPayload: 'private raw response',
    }),
  });

  await assert.rejects(api.sendTurn({ message: 'Oi' }), error => {
    assert.equal(error.kind, 'invalid-response');
    assert.doesNotMatch(error.message, /private raw response|leak/);
    return true;
  });
});

test('agent API preserves a safe public error code without reflecting arbitrary error text', async () => {
  const api = createAgentApi({
    fetchImpl: async () => jsonResponse({
      error: { code: 'CAPABILITY_DISABLED', message: 'Capability unavailable' },
    }, 403),
  });

  await assert.rejects(api.sendTurn({ message: 'Oi' }), error => {
    assert.equal(error.kind, 'http-error');
    assert.equal(error.code, 'CAPABILITY_DISABLED');
    assert.equal(error.message, 'O agente não está disponível no momento.');
    return true;
  });
});

test('agent API maps request cancellation to a cancelled outcome', async () => {
  const controller = new AbortController();
  controller.abort();
  const api = createAgentApi({
    fetchImpl: async () => { throw new DOMException('Private abort detail', 'AbortError'); },
  });

  await assert.rejects(api.sendTurn({ message: 'Resuma as tarefas', signal: controller.signal }), error => {
    assert.equal(error.kind, 'cancelled');
    assert.doesNotMatch(error.message, /Private abort detail/);
    return true;
  });
});

test('chat API module has no direct browser Supabase or model client dependency', () => {
  const source = readFileSync(new URL('../../../src/lib/agentApi.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/agent\/turn/);
  assert.doesNotMatch(source, /@supabase\/|DeepSeek|localStorage|sessionStorage|dangerouslySetInnerHTML/i);
});
