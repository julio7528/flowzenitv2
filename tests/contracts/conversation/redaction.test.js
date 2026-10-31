import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSafeMemoryEvent,
  writeSafeMemoryEvent,
} from '../../../server/agent/memory/safe-logging.js';

const SENTINEL = 'SPEC003-SYNTHETIC-PRIVATE-CONTENT-SENTINEL';
const correlationId = '123e4567-e89b-42d3-a456-426614174000';

test('safe memory events retain allowlisted metadata and omit private content and identifiers', () => {
  const event = createSafeMemoryEvent({
    eventType: 'message_append',
    outcome: 'success',
    correlationId,
    elapsedMs: 12,
    messageCount: 2,
    policyVersion: 'dec005-spec003-v1',
    conversationId: SENTINEL,
    messageId: SENTINEL,
    transcript: SENTINEL,
    prompt: SENTINEL,
    checkpoint: SENTINEL,
    ledgerReference: SENTINEL,
    toolPayload: SENTINEL,
    error: new Error(SENTINEL),
    arbitrary: { nested: SENTINEL },
  });

  assert.deepEqual(event, {
    eventType: 'message_append',
    outcome: 'success',
    correlationId,
    elapsedMs: 12,
    messageCount: 2,
    policyVersion: 'dec005-spec003-v1',
  });
  assert.doesNotMatch(JSON.stringify(event), new RegExp(SENTINEL));
  assert.equal('conversationId' in event, false);
  assert.equal('messageId' in event, false);
});

test('safe logging rejects unsafe categories and does not evaluate input getters', () => {
  let getterCalls = 0;
  const input = { eventType: 'unknown', outcome: SENTINEL };
  Object.defineProperty(input, 'transcript', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return SENTINEL;
    },
  });

  const event = createSafeMemoryEvent(input);

  assert.deepEqual(event, {});
  assert.equal(getterCalls, 0);
  assert.doesNotMatch(JSON.stringify(event), new RegExp(SENTINEL));
});

test('logger receives only the sanitized event and logger errors are swallowed', () => {
  const entries = [];
  const logger = { info: (event) => entries.push(event) };
  const logged = writeSafeMemoryEvent(logger, {
    eventType: 'history_read',
    outcome: 'success',
    correlationId,
    conversationId: SENTINEL,
    transcript: SENTINEL,
    rawError: new Error(SENTINEL),
  });

  assert.equal(logged, true);
  assert.deepEqual(entries, [{ eventType: 'history_read', outcome: 'success', correlationId }]);
  assert.doesNotMatch(JSON.stringify(entries), new RegExp(SENTINEL));
  assert.equal(writeSafeMemoryEvent({ info: () => { throw new Error(SENTINEL); } }, {
    eventType: 'retention',
    outcome: 'expired',
  }), false);
});
