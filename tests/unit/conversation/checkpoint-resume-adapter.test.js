import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCheckpointResume,
  createLangGraphPostgresCheckpointPort,
} from '../../../server/agent/memory/checkpoint-resume.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';

const conversationId = '00000000-0000-4000-8000-000000000101';
const turnId = '00000000-0000-4000-8000-000000000301';
const correlationId = '00000000-0000-4000-8000-000000000401';
const parentCheckpointId = '00000000-0000-4000-8000-000000000501';
const checkpointId = '00000000-0000-4000-8000-000000000502';
const checkpointNs = 'nested:agent/turn';
const now = new Date('2026-10-29T11:00:00.000Z');
const checkpointPayload = Object.freeze({
  v: 4,
  id: checkpointId,
  ts: '2026-10-29T10:00:00.000Z',
  channel_values: Object.freeze({ marker: 'synthetic-checkpoint' }),
  channel_versions: Object.freeze({ marker: 2 }),
  versions_seen: Object.freeze({}),
});

const request = Object.freeze({
  conversationId,
  turnId,
  correlationId,
  checkpointNs,
  checkpointId,
});

function createOpenGate() {
  return Object.freeze({ async run(operation) { return operation(); } });
}

function createConversationRepository(calls) {
  return Object.freeze({
    async getConversationMetadata({ conversationId: requestedId }) {
      calls.repository += 1;
      assert.equal(requestedId, conversationId);
      return {
        conversationId,
        lifecycle: 'active',
        policyVersion: 'dec005-spec003-v1',
        expiresAt: '2027-10-29T10:00:00.000Z',
      };
    },
  });
}

function createLedger(calls) {
  return Object.freeze({
    async lookup(ledgerRef) {
      calls.ledger += 1;
      assert.match(ledgerRef, /^ledger-synthetic-/);
      return { status: 'not_started' };
    },
    async reserve() {},
    async recordStarted() {},
    async recordOutcome() {},
  });
}

test('PostgresSaver adapter saves and loads an exact namespace and parent checkpoint', async () => {
  const calls = { repository: 0, envelope: 0, checkpoint: 0, ledger: 0 };
  const gate = createOpenGate();
  let savedTuple;
  let savedEnvelope;
  const saver = {
    async put(config, checkpoint, metadata, newVersions) {
      calls.checkpoint += 1;
      const configurable = config.configurable;
      assert.equal(configurable.thread_id, conversationId);
      assert.equal(configurable.checkpoint_ns, checkpointNs);
      assert.equal(configurable.checkpoint_id, parentCheckpointId);
      assert.equal(checkpoint.id, checkpointId);
      assert.deepEqual(newVersions, checkpoint.channel_versions);
      assert.equal(metadata.graphVersion, 'graph-v1');
      savedTuple = {
        config: {
          configurable: {
            thread_id: conversationId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpointId,
          },
        },
        checkpoint,
        metadata,
        parentConfig: { configurable: { ...configurable } },
      };
      return savedTuple.config;
    },
    async getTuple(config) {
      calls.checkpoint += 1;
      assert.deepEqual(config.configurable, {
        thread_id: conversationId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      });
      return savedTuple;
    },
  };
  const checkpointPort = createLangGraphPostgresCheckpointPort({ checkpointer: saver, accessGate: gate });
  const envelopeStore = {
    async load() {
      calls.envelope += 1;
      return savedEnvelope;
    },
    async save(envelope) {
      calls.envelope += 1;
      savedEnvelope = envelope;
      return { saved: true };
    },
  };
  const runtime = createCheckpointResume({
    checkpointPort,
    envelopeStore,
    conversationRepository: createConversationRepository(calls),
    executionLedger: createLedger(calls),
    accessGate: gate,
    graphVersion: 'graph-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'serializer-v1',
    now: () => now,
  });

  const saved = await runtime.save({
    ...request,
    parentCheckpointId,
    ledgerRefs: ['ledger-synthetic-ref-001'],
    checkpointPayload,
  });
  assert.deepEqual(saved, {
    outcome: 'READY',
    envelopeReference: { conversationId, checkpointNs, checkpointId },
  });
  assert.deepEqual(await runtime.preflight(request), { outcome: 'READY' });
  assert.deepEqual(calls, { repository: 2, envelope: 2, checkpoint: 2, ledger: 1 });

  savedTuple = {
    ...savedTuple,
    parentConfig: {
      configurable: {
        thread_id: conversationId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: '00000000-0000-4000-8000-000000000599',
      },
    },
  };
  assert.deepEqual(await runtime.preflight(request), { outcome: 'CORRUPT' });
});

test('generic CheckpointPort fails closed if it cannot persist the requested namespace and parent', async () => {
  const calls = { repository: 0, envelope: 0, checkpoint: 0, ledger: 0 };
  const checkpointPort = {
    async load() { calls.checkpoint += 1; return undefined; },
    async save() {
      calls.checkpoint += 1;
      return { threadId: conversationId, graphVersion: 'graph-v1' };
    },
  };
  const envelopeStore = {
    async load() { calls.envelope += 1; return null; },
    async save() { calls.envelope += 1; return { saved: true }; },
  };
  const runtime = createCheckpointResume({
    checkpointPort,
    envelopeStore,
    conversationRepository: createConversationRepository(calls),
    executionLedger: createLedger(calls),
    accessGate: createOpenGate(),
    graphVersion: 'graph-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'serializer-v1',
    now: () => now,
  });

  assert.deepEqual(await runtime.save({
    ...request,
    parentCheckpointId,
    ledgerRefs: [],
    checkpointPayload,
  }), { outcome: 'DEPENDENCY_UNAVAILABLE' });
  assert.deepEqual(calls, { repository: 1, envelope: 0, checkpoint: 0, ledger: 0 });
});

test('closed DEC-001 gate denies preflight before any private adapter call', async () => {
  const calls = { repository: 0, envelope: 0, checkpoint: 0, ledger: 0 };
  const runtime = createCheckpointResume({
    checkpointPort: {
      async load() { calls.checkpoint += 1; },
      async save() { calls.checkpoint += 1; },
    },
    envelopeStore: {
      async load() { calls.envelope += 1; },
      async save() { calls.envelope += 1; },
    },
    conversationRepository: createConversationRepository(calls),
    executionLedger: createLedger(calls),
    graphVersion: 'graph-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'serializer-v1',
    now: () => now,
  });

  assert.deepEqual(await runtime.preflight(request), { outcome: 'ACCESS_DISABLED' });
  assert.deepEqual(calls, { repository: 0, envelope: 0, checkpoint: 0, ledger: 0 });
  assert.equal(memoryAccessGate.isOpen(), false);
});
