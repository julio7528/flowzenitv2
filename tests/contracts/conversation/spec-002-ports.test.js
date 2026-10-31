import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHECKPOINT_NOT_FOUND,
  CHECKPOINT_PORT_METHODS,
  EXECUTION_LEDGER_METHODS,
  assertCheckpointPort,
  assertExecutionLedgerPort,
  loadCheckpoint,
  runSyntheticEffectWithLedger,
} from '../../../server/agent/persistence/ports.js';

const THREAD_ID = '00000000-0000-4000-8000-000000000101';
const IDEMPOTENCY_KEY = '00000000-0000-4000-8000-000000000102';
const PROPOSAL_HASH = 'a'.repeat(64);
const SAFE_OUTCOME_REFERENCE = 'synthetic-outcome-reference-001';

function createCheckpointPort(overrides = {}) {
  return {
    async load(threadId) {
      return { threadId, state: 'synthetic-checkpoint' };
    },
    async save(threadId, graphVersion, checkpoint) {
      return { threadId, graphVersion, checkpoint };
    },
    ...overrides,
  };
}

function createLedger(overrides = {}) {
  return {
    async reserve() {
      return { status: 'reserved' };
    },
    async recordStarted() {
      return { acknowledged: true };
    },
    async recordOutcome() {
      return { acknowledged: true };
    },
    async lookup() {
      return { status: 'not_started' };
    },
    ...overrides,
  };
}

test('SPEC-002 persistence ports expose the exact methods required by conversation adapters', async () => {
  assert.deepEqual(CHECKPOINT_PORT_METHODS, ['load', 'save']);
  assert.deepEqual(EXECUTION_LEDGER_METHODS, ['reserve', 'recordStarted', 'recordOutcome', 'lookup']);

  const loadCalls = [];
  const saveCalls = [];
  const checkpointPort = assertCheckpointPort(createCheckpointPort({
    async load(threadId) {
      loadCalls.push(threadId);
      return { state: 'synthetic-loaded-checkpoint' };
    },
    async save(threadId, graphVersion, checkpoint) {
      saveCalls.push([threadId, graphVersion, checkpoint]);
      return { saved: true };
    },
  }));

  assert.deepEqual(await checkpointPort.load(THREAD_ID), { state: 'synthetic-loaded-checkpoint' });
  assert.deepEqual(await checkpointPort.save(THREAD_ID, 'agent-turn-v1', { state: 'synthetic' }), { saved: true });
  assert.deepEqual(loadCalls, [THREAD_ID]);
  assert.deepEqual(saveCalls, [[THREAD_ID, 'agent-turn-v1', { state: 'synthetic' }]]);
  const ledger = createLedger();
  assert.equal(assertExecutionLedgerPort(ledger), ledger);
});

test('missing or incompatible checkpoint and ledger ports fail before any dependency call', async () => {
  let calls = 0;
  const partialCheckpoint = { load: async () => { calls += 1; } };
  const partialLedger = { reserve: async () => { calls += 1; } };

  assert.throws(() => assertCheckpointPort(null), /injected object/);
  assert.throws(() => assertCheckpointPort(partialCheckpoint), /missing a required method/);
  assert.throws(() => assertExecutionLedgerPort([]), /injected object/);
  assert.throws(() => assertExecutionLedgerPort(partialLedger), /missing a required method/);
  await assert.rejects(loadCheckpoint(partialCheckpoint, THREAD_ID), /missing a required method/);
  await assert.rejects(loadCheckpoint(createCheckpointPort(), ''), /thread identifier/);
  assert.equal(calls, 0);
});

test('checkpoint absence is explicit and invalid thread IDs never reach storage', async () => {
  let calls = 0;
  const missing = createCheckpointPort({
    async load(threadId) {
      calls += 1;
      assert.equal(threadId, THREAD_ID);
      return undefined;
    },
  });

  assert.equal(await loadCheckpoint(missing, THREAD_ID), CHECKPOINT_NOT_FOUND);
  await assert.rejects(loadCheckpoint(missing, ''), /thread identifier/);
  assert.equal(calls, 1);
});

test('a completed prior ledger outcome is replayed safely without repeating an effect', async () => {
  let effectCalls = 0;
  const calls = [];
  const ledger = createLedger({
    async reserve(key, proposalHash) {
      calls.push(['reserve', key, proposalHash]);
      return { status: 'prior-outcome', safeOutcomeReference: SAFE_OUTCOME_REFERENCE };
    },
    async lookup(key) {
      calls.push(['lookup', key]);
      return { status: 'completed', safeOutcomeReference: SAFE_OUTCOME_REFERENCE };
    },
    async recordStarted() {
      calls.push(['recordStarted']);
      return { acknowledged: true };
    },
    async recordOutcome() {
      calls.push(['recordOutcome']);
      return { acknowledged: true };
    },
  });

  const result = await runSyntheticEffectWithLedger({
    ledger: assertExecutionLedgerPort(ledger),
    idempotencyKey: IDEMPOTENCY_KEY,
    proposalHash: PROPOSAL_HASH,
    effect: async () => {
      effectCalls += 1;
      return 'synthetic-effect';
    },
    safeOutcomeReference: SAFE_OUTCOME_REFERENCE,
  });

  assert.deepEqual(result, {
    status: 'replayed',
    safeOutcomeReference: SAFE_OUTCOME_REFERENCE,
  });
  assert.equal(effectCalls, 0);
  assert.deepEqual(calls, [['reserve', IDEMPOTENCY_KEY, PROPOSAL_HASH]]);
});

test('a new ledger reservation requires acknowledgements before and after a synthetic effect', async () => {
  let effectCalls = 0;
  const calls = [];
  const ledger = createLedger({
    async reserve(key, hash) {
      calls.push(['reserve', key, hash]);
      return { status: 'reserved' };
    },
    async recordStarted(key) {
      calls.push(['recordStarted', key]);
      return { acknowledged: true };
    },
    async recordOutcome(key, outcome) {
      calls.push(['recordOutcome', key, outcome]);
      return { acknowledged: true };
    },
  });

  const result = await runSyntheticEffectWithLedger({
    ledger,
    idempotencyKey: IDEMPOTENCY_KEY,
    proposalHash: PROPOSAL_HASH,
    effect: async () => {
      effectCalls += 1;
      return 'synthetic-result';
    },
    safeOutcomeReference: SAFE_OUTCOME_REFERENCE,
  });

  assert.deepEqual(result, {
    status: 'completed',
    result: 'synthetic-result',
    safeOutcomeReference: SAFE_OUTCOME_REFERENCE,
  });
  assert.equal(effectCalls, 1);
  assert.deepEqual(calls, [
    ['reserve', IDEMPOTENCY_KEY, PROPOSAL_HASH],
    ['recordStarted', IDEMPOTENCY_KEY],
    ['recordOutcome', IDEMPOTENCY_KEY, SAFE_OUTCOME_REFERENCE],
  ]);
});
