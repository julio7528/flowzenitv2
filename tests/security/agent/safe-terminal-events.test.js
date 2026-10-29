import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HTTP_STATUS_BY_OUTCOME,
  SAFE_ERROR_CODES,
  TERMINAL_OUTCOMES,
  createSafeErrorResponse,
  httpStatusForOutcome,
} from '../../../server/agent/http/errors.js';
import { createSafeAgentEvent } from '../../../server/agent/observability/safe-events.js';

const CORRELATION_ID = 'b831a95e-1efb-42e6-b6ac-0cbe85471231';

test('all terminal outcomes map to a bounded safe HTTP status', () => {
  assert.deepEqual(Object.keys(HTTP_STATUS_BY_OUTCOME).sort(), [...TERMINAL_OUTCOMES].sort());
  for (const outcome of TERMINAL_OUTCOMES) {
    assert.equal(httpStatusForOutcome(outcome), HTTP_STATUS_BY_OUTCOME[outcome]);
  }
  assert.equal(httpStatusForOutcome('unexpected'), HTTP_STATUS_BY_OUTCOME.failed);
});

test('public error envelopes expose only allowlisted code, fixed message, and correlation id', () => {
  const error = createSafeErrorResponse(SAFE_ERROR_CODES.INTERNAL_ERROR, CORRELATION_ID);
  assert.equal(error.status, 500);
  assert.deepEqual(error.body, {
    error: {
      code: SAFE_ERROR_CODES.INTERNAL_ERROR,
      message: 'Request could not be completed',
    },
    correlationId: CORRELATION_ID,
  });

  const invalid = createSafeErrorResponse('UNTRUSTED_RAW_ERROR', 'private prompt sentinel');
  const serialized = JSON.stringify(invalid);
  assert.equal(invalid.status, 500);
  assert.equal(invalid.body.error.code, SAFE_ERROR_CODES.INTERNAL_ERROR);
  assert.equal(invalid.body.correlationId, 'unavailable');
  assert.doesNotMatch(serialized, /private prompt sentinel|UNTRUSTED_RAW_ERROR/);
});

test('operational events retain allowlisted correlation metadata and strip private or unknown fields', () => {
  const privateSentinel = 'synthetic-private-tool-result-marker';
  const event = createSafeAgentEvent({
    correlationId: CORRELATION_ID,
    graphVersion: 'agent-turn-v1',
    nodeName: 'execute_tool',
    toolName: 'getItemById',
    toolVersion: '1.0.0',
    outcomeCategory: 'completed',
    elapsedMs: 120,
    graphSteps: 8,
    modelCalls: 2,
    toolCalls: 1,
    retryCount: 0,
    message: privateSentinel,
    prompt: privateSentinel,
    reasoning: privateSentinel,
    credential: privateSentinel,
    toolInput: privateSentinel,
    toolResult: privateSentinel,
    rawProviderError: privateSentinel,
  });

  assert.deepEqual(event, {
    correlationId: CORRELATION_ID,
    graphVersion: 'agent-turn-v1',
    nodeName: 'execute_tool',
    toolName: 'getItemById',
    toolVersion: '1.0.0',
    outcomeCategory: 'completed',
    elapsedMs: 120,
    graphSteps: 8,
    modelCalls: 2,
    toolCalls: 1,
    retryCount: 0,
  });
  assert.ok(Object.isFrozen(event));
  assert.doesNotMatch(JSON.stringify(event), /synthetic-private-tool-result-marker/);
});

test('unknown graph node names and accessor fields are ignored without invoking getters', () => {
  let getterCalls = 0;
  const input = {
    correlationId: CORRELATION_ID,
    graphVersion: 'agent-turn-v1',
    nodeName: 'initialize_context',
  };
  Object.defineProperty(input, 'prompt', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'private prompt';
    },
  });

  const event = createSafeAgentEvent(input);
  assert.deepEqual(event, {
    correlationId: CORRELATION_ID,
    graphVersion: 'agent-turn-v1',
  });
  assert.equal(getterCalls, 0);
});
