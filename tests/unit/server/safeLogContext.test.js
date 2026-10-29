import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticAgentRequest } from '../../fixtures/agentBoundary.js';
import { mapApiError } from '../../../server/http/apiErrors.js';
import {
  createRequestId,
  createSafeLogContext,
} from '../../../server/observability/safeLogContext.js';

const serverRequestId = '123e4567-e89b-42d3-a456-426614174000';

test('request IDs are generated server-side as random UUIDs', () => {
  const first = createRequestId();
  const second = createRequestId();

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second);
});

test('safe log context retains only approved correlation and category metadata', () => {
  const request = createSyntheticAgentRequest({
    headers: { authorization: 'synthetic authorization', cookie: 'synthetic cookie' },
    body: { prompt: 'synthetic prompt', transcript: 'synthetic transcript', row: { title: 'synthetic task text' } },
  });
  const context = createSafeLogContext({
    requestId: serverRequestId,
    operationId: 'agent.query',
    outcome: 'dependency_unavailable',
    durationMs: 12.5,
    dependency: 'supabase',
    request,
    prompt: 'synthetic prompt',
    transcript: 'synthetic transcript',
    taskText: 'synthetic task text',
    rowData: { title: 'synthetic task text' },
    credentials: 'synthetic credential sentinel',
    cookie: 'synthetic cookie',
    authorization: 'synthetic authorization',
    exception: new Error('synthetic raw exception'),
    arbitrary: { nested: 'untrusted data' },
  });

  assert.deepEqual(context, {
    requestId: serverRequestId,
    operationId: 'agent.query',
    outcome: 'dependency_unavailable',
    durationMs: 12.5,
    dependency: 'supabase',
  });
  assert.equal(JSON.stringify(context).includes('synthetic'), false);
});

test('unsafe operation IDs and invalid categories are omitted, with a generated request ID', () => {
  const context = createSafeLogContext({
    operationId: 'prompt-secret-sentinel',
    outcome: 'synthetic-unapproved-outcome',
    durationMs: Number.NaN,
    dependency: 'synthetic-secret-sentinel',
  });

  assert.deepEqual(Object.keys(context), ['requestId']);
  assert.match(context.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.doesNotMatch(JSON.stringify(context), /prompt|secret|sentinel/i);
});

test('metadata getters are not evaluated while building safe log context', () => {
  let getterCalls = 0;
  const input = {};
  Object.defineProperty(input, 'operationId', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'unsafe-operation';
    },
  });
  Object.defineProperty(input, 'outcome', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'success';
    },
  });

  const context = createSafeLogContext(input);

  assert.equal(getterCalls, 0);
  assert.deepEqual(Object.keys(context), ['requestId']);
});

test('synthetic secret sentinels never enter serialized logs or API errors', () => {
  const sentinel = 'SPEC001-SYNTHETIC-SECRET-SENTINEL';
  const context = createSafeLogContext({
    requestId: serverRequestId,
    operationId: `secret-${sentinel}`,
    outcome: 'internal',
    durationMs: 1,
    dependency: 'internal',
    prompt: sentinel,
    transcript: sentinel,
    taskText: sentinel,
    row: sentinel,
    password: sentinel,
    cookie: sentinel,
    authorization: sentinel,
    rawException: new Error(sentinel),
  });
  const apiError = mapApiError(new Error(`internal exception ${sentinel}`), { requestId: serverRequestId });

  assert.doesNotMatch(JSON.stringify(context), new RegExp(sentinel));
  assert.doesNotMatch(JSON.stringify(apiError), new RegExp(sentinel));
  assert.equal(context.operationId, undefined);
  assert.equal(apiError.error.message, 'Internal error');
});
