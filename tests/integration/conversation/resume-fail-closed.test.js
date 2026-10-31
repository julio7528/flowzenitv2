import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckpointEnvelope } from '../../../server/agent/memory/checkpoint-envelope.js';
import { createCheckpointResume } from '../../../server/agent/memory/checkpoint-resume.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';

const conversationId = '00000000-0000-4000-8000-000000000101';
const turnId = '00000000-0000-4000-8000-000000000301';
const correlationId = '00000000-0000-4000-8000-000000000401';
const checkpointId = 'checkpoint-synthetic-002';
const checkpointNs = 'nested:agent/turn';
const ledgerRef = 'ledger-synthetic-read-001';
const now = new Date('2026-10-29T11:00:00.000Z');
const request = Object.freeze({
  conversationId,
  turnId,
  correlationId,
  checkpointNs,
  checkpointId,
});
const checkpointPayload = Object.freeze({
  id: checkpointId,
  channel_versions: Object.freeze({ messages: 2 }),
  channel_values: Object.freeze({ syntheticMarker: 'checkpoint-fixture' }),
});

function openGate() {
  return Object.freeze({ run: (operation) => operation() });
}

function makeEnvelope(overrides = {}) {
  return createCheckpointEnvelope({
    conversationId,
    checkpointNs,
    checkpointId,
    parentCheckpointId: null,
    graphVersion: 'graph-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'serializer-v1',
    turnId,
    correlationId,
    ledgerRefs: [ledgerRef],
    checkpointPayload,
    updatedAt: '2026-10-29T10:00:00.000Z',
    conversationExpiresAt: '2027-10-29T10:00:00.000Z',
    ...overrides,
  });
}

function createRuntime({
  envelope = makeEnvelope(),
  checkpoint = checkpointPayload,
  ledgerResult = { status: 'not_started' },
  runtimeNow = now,
  closedGate = false,
} = {}) {
  const calls = { repository: 0, envelope: 0, checkpoint: 0, ledger: 0, resume: 0 };
  const tuple = {
    config: { configurable: { thread_id: conversationId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId } },
    checkpoint,
    parentConfig: { configurable: { thread_id: conversationId, checkpoint_ns: checkpointNs } },
  };
  const dependencies = {
    checkpointPort: {
      async load() { calls.checkpoint += 1; return tuple; },
      async loadExact() { calls.checkpoint += 1; return tuple; },
      async save() { calls.checkpoint += 1; return { threadId: conversationId, graphVersion: 'graph-v1' }; },
    },
    envelopeStore: {
      async load() { calls.envelope += 1; return envelope; },
      async save() { calls.envelope += 1; return { saved: true }; },
    },
    conversationRepository: {
      async getConversationMetadata() {
        calls.repository += 1;
        return {
          conversationId,
          lifecycle: 'active',
          policyVersion: 'dec005-spec003-v1',
          expiresAt: '2027-10-29T10:00:00.000Z',
        };
      },
    },
    executionLedger: {
      async lookup(reference) {
        calls.ledger += 1;
        assert.equal(reference, ledgerRef);
        return typeof ledgerResult === 'function' ? ledgerResult() : ledgerResult;
      },
      async reserve() { throw new Error('Resume must not reserve a new effect.'); },
      async recordStarted() { throw new Error('Resume must not start a new effect.'); },
      async recordOutcome() { throw new Error('Resume must not record a new effect.'); },
    },
    graphVersion: 'graph-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'serializer-v1',
    now: () => runtimeNow,
  };
  if (!closedGate) dependencies.accessGate = openGate();
  const runtime = createCheckpointResume(dependencies);
  return { runtime, calls };
}

async function expectResumeBlocked(options, expectedOutcome) {
  const { runtime, calls } = createRuntime(options);
  const result = await runtime.resume(request, async () => {
    calls.resume += 1;
    return { synthetic: true };
  });
  assert.deepEqual(result, { outcome: expectedOutcome });
  assert.equal(calls.resume, 0, `resume callback ran for ${expectedOutcome}`);
  return calls;
}

test('expired or corrupt checkpoints never invoke the graph resume callback', async (t) => {
  await t.test('expired checkpoint envelope', async () => {
    const calls = await expectResumeBlocked({
      runtimeNow: new Date('2026-11-29T10:00:00.000Z'),
    }, 'EXPIRED');
    assert.equal(calls.ledger, 0);
  });

  await t.test('corrupted checkpoint digest', async () => {
    const envelope = { ...makeEnvelope(), payloadDigest: `sha256:${'0'.repeat(64)}` };
    const calls = await expectResumeBlocked({ envelope }, 'CORRUPT');
    assert.equal(calls.ledger, 0);
  });
});

test('incompatible checkpoint versions prevent graph resume', async (t) => {
  for (const [name, overrides, expectedOutcome] of [
    ['graph', { graphVersion: 'graph-v2' }, 'INCOMPATIBLE_GRAPH'],
    ['state schema', { stateSchemaVersion: 2 }, 'INCOMPATIBLE_STATE'],
    ['serializer', { serializerVersion: 'serializer-v2' }, 'INCOMPATIBLE_SERIALIZER'],
  ]) {
    await t.test(name, async () => {
      const calls = await expectResumeBlocked({ envelope: makeEnvelope(overrides) }, expectedOutcome);
      assert.equal(calls.ledger, 0);
    });
  }
});

test('missing, started, and uncertain ledger records block resume before any tool callback', async (t) => {
  for (const [name, ledgerResult] of [
    ['missing', () => undefined],
    ['started', { status: 'started' }],
    ['uncertain', { status: 'uncertain' }],
  ]) {
    await t.test(name, async () => {
      const calls = await expectResumeBlocked({ ledgerResult }, 'LEDGER_UNRESOLVED');
      assert.equal(calls.ledger, 1);
    });
  }
});

test('closed DEC-001 gate rejects resume before repository, envelope, checkpoint, ledger, or graph calls', async () => {
  const { runtime, calls } = createRuntime({ closedGate: true });
  const result = await runtime.resume(request, async () => {
    calls.resume += 1;
    return { synthetic: true };
  });

  assert.deepEqual(result, { outcome: 'ACCESS_DISABLED' });
  assert.deepEqual(calls, { repository: 0, envelope: 0, checkpoint: 0, ledger: 0, resume: 0 });
  assert.equal(memoryAccessGate.isOpen(), false);
});

test('a valid synthetic checkpoint resumes only after envelope and durable ledger preflight', async () => {
  const { runtime, calls } = createRuntime();
  let receivedCheckpoint;
  const result = await runtime.resume(request, async (checkpoint) => {
    calls.resume += 1;
    receivedCheckpoint = checkpoint;
    return { resumed: true };
  });

  assert.deepEqual(result, { outcome: 'READY', result: { resumed: true } });
  assert.equal(calls.resume, 1);
  assert.equal(receivedCheckpoint, checkpointPayload);
  assert.equal(calls.ledger, 1);
});
