import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKPOINT_MAX_AGE_MS,
  CHECKPOINT_ENVELOPE_VERSION,
  createCheckpointEnvelope,
  validateCheckpointEnvelope,
} from '../../../server/agent/memory/checkpoint-envelope.js';

const conversationId = '00000000-0000-4000-8000-000000000101';
const checkpointPayload = {
  channel_versions: { messages: 2 },
  state: { marker: 'synthetic-checkpoint-payload' },
};
const fixture = {
  conversationId,
  checkpointNs: 'agent',
  checkpointId: 'checkpoint-synthetic-001',
  parentCheckpointId: 'checkpoint-synthetic-000',
  graphVersion: 'agent-turn-v1',
  stateSchemaVersion: 1,
  serializerVersion: 'langgraph-json-v1',
  turnId: '00000000-0000-4000-8000-000000000301',
  correlationId: '00000000-0000-4000-8000-000000000401',
  ledgerRefs: ['ledger-synthetic-read-001'],
  checkpointPayload,
  updatedAt: '2026-10-29T10:00:00.000Z',
  conversationExpiresAt: '2027-10-20T10:00:00.000Z',
};

function makeEnvelope(overrides = {}) {
  return createCheckpointEnvelope({ ...fixture, ...overrides });
}

function expectedFrom(envelope, overrides = {}) {
  return {
    conversationId: envelope.conversationId,
    checkpointNs: envelope.checkpointNs,
    checkpointId: envelope.checkpointId,
    graphVersion: envelope.graphVersion,
    stateSchemaVersion: envelope.stateSchemaVersion,
    serializerVersion: envelope.serializerVersion,
    turnId: envelope.turnId,
    correlationId: envelope.correlationId,
    conversationExpiresAt: fixture.conversationExpiresAt,
    ...overrides,
  };
}

test('checkpoint preflight accepts only a matching versioned envelope and returns no payload', () => {
  const envelope = makeEnvelope();
  const result = validateCheckpointEnvelope({
    envelope,
    checkpointPayload,
    expected: expectedFrom(envelope),
    now: '2026-10-29T11:00:00.000Z',
  });

  assert.deepEqual(result, { outcome: 'READY' });
  assert.equal(result.outcome, 'READY');
  assert.equal(Object.hasOwn(result, 'envelope'), false);
  assert.equal(Object.hasOwn(result, 'checkpointPayload'), false);
  assert.equal(JSON.stringify(result).includes('synthetic-checkpoint-payload'), false);
  assert.equal(envelope.envelopeVersion, CHECKPOINT_ENVELOPE_VERSION);
});

test('preflight rejects wrong conversation, thread namespace, checkpoint, turn, or correlation binding', () => {
  const envelope = makeEnvelope();
  const bindingOverrides = [
    { conversationId: '00000000-0000-4000-8000-000000000102' },
    { checkpointNs: 'other-namespace' },
    { checkpointId: 'checkpoint-synthetic-other' },
    { turnId: '00000000-0000-4000-8000-000000000302' },
    { correlationId: '00000000-0000-4000-8000-000000000402' },
  ];

  for (const binding of bindingOverrides) {
    assert.deepEqual(validateCheckpointEnvelope({
      envelope,
      checkpointPayload,
      expected: expectedFrom(envelope, binding),
      now: '2026-10-29T11:00:00.000Z',
    }), { outcome: 'CORRUPT' });
  }
});

test('preflight rejects incompatible graph, state schema, serializer, version, and digest', () => {
  const envelope = makeEnvelope();
  const mismatches = [
    [{ graphVersion: 'agent-turn-v2' }, 'INCOMPATIBLE_GRAPH'],
    [{ stateSchemaVersion: 2 }, 'INCOMPATIBLE_STATE'],
    [{ serializerVersion: 'langgraph-json-v2' }, 'INCOMPATIBLE_SERIALIZER'],
  ];

  for (const [overrides, outcome] of mismatches) {
    assert.deepEqual(validateCheckpointEnvelope({
      envelope,
      checkpointPayload,
      expected: expectedFrom(envelope, overrides),
      now: '2026-10-29T11:00:00.000Z',
    }), { outcome });
  }

  assert.deepEqual(validateCheckpointEnvelope({
    envelope: { ...envelope, envelopeVersion: CHECKPOINT_ENVELOPE_VERSION + 1 },
    checkpointPayload,
    expected: expectedFrom(envelope),
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'CORRUPT' });

  assert.deepEqual(validateCheckpointEnvelope({
    envelope,
    checkpointPayload: { state: { marker: 'synthetic-tampered-payload' } },
    expected: expectedFrom(envelope),
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'CORRUPT' });
});

test('preflight rejects checkpoint TTL beyond thirty days or the conversation expiry', () => {
  const envelope = makeEnvelope();
  const overThirtyDays = {
    ...envelope,
    expiresAt: new Date(Date.parse(envelope.updatedAt) + CHECKPOINT_MAX_AGE_MS + 1).toISOString(),
  };
  assert.deepEqual(validateCheckpointEnvelope({
    envelope: overThirtyDays,
    checkpointPayload,
    expected: expectedFrom(envelope),
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'CORRUPT' });

  const afterConversationExpiry = {
    ...envelope,
    expiresAt: '2026-11-01T00:00:00.000Z',
  };
  assert.deepEqual(validateCheckpointEnvelope({
    envelope: afterConversationExpiry,
    checkpointPayload,
    expected: expectedFrom(envelope, { conversationExpiresAt: '2026-10-31T23:59:59.999Z' }),
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'CORRUPT' });

  assert.deepEqual(validateCheckpointEnvelope({
    envelope,
    checkpointPayload,
    expected: expectedFrom(envelope),
    now: envelope.expiresAt,
  }), { outcome: 'EXPIRED' });
});

test('ledger references accept only bounded metadata identifiers, never content-shaped text', () => {
  const envelope = makeEnvelope({ ledgerRefs: ['ledger-synthetic-read-001'] });
  assert.deepEqual(envelope.ledgerRefs, ['ledger-synthetic-read-001']);
  assert.equal(Object.hasOwn(envelope, 'checkpointPayload'), false);
  assert.throws(() => makeEnvelope({ ledgerRefs: [{ content: 'synthetic-private-shaped-value' }] }));
  assert.throws(() => makeEnvelope({ ledgerRefs: [''] }));

  const invalidReferences = [
    'ledger synthetic read 001',
    'synthetic private conversation transcript content',
    `ledger-${'x'.repeat(122)}`,
    { content: 'synthetic-private-shaped-value' },
  ];

  for (const ledgerRef of invalidReferences) {
    assert.throws(() => makeEnvelope({ ledgerRefs: [ledgerRef] }));

    const malformedStoredEnvelope = { ...envelope, ledgerRefs: [ledgerRef] };
    assert.deepEqual(validateCheckpointEnvelope({
      envelope: malformedStoredEnvelope,
      checkpointPayload,
      expected: expectedFrom(envelope),
      now: '2026-10-29T11:00:00.000Z',
    }), { outcome: 'CORRUPT' });
  }

  const overlongReference = 'x'.repeat(129);
  assert.throws(() => makeEnvelope({ ledgerRefs: [overlongReference] }));
  assert.deepEqual(validateCheckpointEnvelope({
    envelope: { ...envelope, ledgerRefs: [overlongReference] },
    checkpointPayload,
    expected: expectedFrom(envelope),
    now: '2026-10-29T11:00:00.000Z',
  }), { outcome: 'CORRUPT' });
});
