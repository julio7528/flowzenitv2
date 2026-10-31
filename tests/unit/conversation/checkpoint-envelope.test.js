import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECKPOINT_MAX_AGE_MS,
  CheckpointEnvelopeError,
  createCheckpointEnvelope,
  digestCheckpointPayload,
  validateCheckpointEnvelope,
} from '../../../server/agent/memory/checkpoint-envelope.js';

const common = {
  conversationId: '00000000-0000-4000-8000-000000000101',
  checkpointNs: 'agent',
  checkpointId: 'checkpoint-synthetic-001',
  graphVersion: 'flowzenit-agent-v1',
  stateSchemaVersion: 1,
  serializerVersion: 'langgraph-json-v1',
  turnId: '00000000-0000-4000-8000-000000000301',
  correlationId: '00000000-0000-4000-8000-000000000401',
  ledgerRefs: ['ledger-synthetic-001'],
  checkpointPayload: { z: 2, a: { y: true, x: 1 } },
  updatedAt: '2026-10-29T10:00:00.000Z',
  conversationExpiresAt: '2027-10-20T10:00:00.000Z',
};

test('checkpoint digest is stable for equivalent JSON objects', () => {
  assert.equal(digestCheckpointPayload({ a: 1, b: 2 }), digestCheckpointPayload({ b: 2, a: 1 }));
  assert.equal(digestCheckpointPayload('synthetic bytes'), digestCheckpointPayload('synthetic bytes'));
});

test('envelope records only metadata and bounds expiry to thirty days and conversation expiry', () => {
  const envelope = createCheckpointEnvelope(common);
  assert.equal(envelope.envelopeVersion, 1);
  assert.equal(envelope.expiresAt, new Date(Date.parse(common.updatedAt) + CHECKPOINT_MAX_AGE_MS).toISOString());
  assert.equal(Object.hasOwn(envelope, 'checkpointPayload'), false);
  assert.deepEqual(envelope.ledgerRefs, ['ledger-synthetic-001']);
  assert.equal(Object.isFrozen(envelope), true);

  const shortConversation = createCheckpointEnvelope({
    ...common,
    conversationExpiresAt: '2026-11-01T00:00:00.000Z',
  });
  assert.equal(shortConversation.expiresAt, '2026-11-01T00:00:00.000Z');
});

test('envelope validates digest, binding, versions, and expiry without returning checkpoint content', () => {
  const envelope = createCheckpointEnvelope(common);
  const expected = {
    conversationId: common.conversationId,
    checkpointNs: common.checkpointNs,
    checkpointId: common.checkpointId,
    graphVersion: common.graphVersion,
    stateSchemaVersion: common.stateSchemaVersion,
    serializerVersion: common.serializerVersion,
    turnId: common.turnId,
    correlationId: common.correlationId,
    conversationExpiresAt: common.conversationExpiresAt,
  };

  assert.deepEqual(validateCheckpointEnvelope({
    envelope,
    checkpointPayload: common.checkpointPayload,
    expected,
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'READY' });
  assert.deepEqual(validateCheckpointEnvelope({
    envelope,
    checkpointPayload: { changed: true },
    expected,
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'CORRUPT' });
  assert.deepEqual(validateCheckpointEnvelope({
    envelope,
    checkpointPayload: common.checkpointPayload,
    expected: { ...expected, graphVersion: 'other-graph' },
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'INCOMPATIBLE_GRAPH' });
  assert.deepEqual(validateCheckpointEnvelope({
    envelope,
    checkpointPayload: common.checkpointPayload,
    expected,
    now: '2026-11-28T10:00:00.000Z',
  }), { outcome: 'EXPIRED' });
});

test('invalid payload and already expired conversation fail without creating an envelope', () => {
  const circular = {};
  circular.self = circular;
  assert.throws(() => digestCheckpointPayload(circular), CheckpointEnvelopeError);
  assert.throws(() => createCheckpointEnvelope({
    ...common,
    conversationExpiresAt: '2026-10-29T09:59:59.000Z',
  }), (error) => error instanceof CheckpointEnvelopeError && error.code === 'CONVERSATION_EXPIRED');
});
