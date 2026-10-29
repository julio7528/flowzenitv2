import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXECUTION_LEDGER_METHODS,
  LedgerAcknowledgementError,
} from '../../../server/agent/persistence/ports.js';
import {
  createToolExecutor,
  executeSyntheticEffectWithLedgerForTest,
} from '../../../server/agent/tools/execute.js';
import {
  AGENT_READ_TOOL_NAMES,
  createAgentToolRegistry,
} from '../../../server/agent/tools/registry.js';

const ID = '2fffb7f2-b7ca-467f-8557-0ef02537b1e9';
const HASH = 'a'.repeat(64);
const OUTCOME_REFERENCE = 'synthetic:outcome:completed';

function createFakeLedger({ acknowledgeStart = true, acknowledgeOutcome = true, ...overrides } = {}) {
  const entries = new Map();
  const calls = [];
  const ledger = {
    calls,
    async reserve(idempotencyKey, proposalHash) {
      calls.push({ method: 'reserve', idempotencyKey, proposalHash });
      const existing = entries.get(idempotencyKey);
      if (existing) {
        if (existing.proposalHash !== proposalHash) {
          throw new Error('Synthetic idempotency conflict.');
        }
        if (existing.status === 'completed' || existing.status === 'uncertain') {
          return {
            status: 'prior-outcome',
            safeOutcomeReference: existing.safeOutcomeReference,
          };
        }
        throw new Error('Synthetic execution is already in progress.');
      }

      entries.set(idempotencyKey, { proposalHash, status: 'reserved' });
      return { status: 'reserved' };
    },
    async recordStarted(idempotencyKey) {
      calls.push({ method: 'recordStarted', idempotencyKey });
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.status !== 'reserved') throw new Error('Invalid synthetic ledger state.');
      entry.status = 'started';
      return acknowledgeStart ? { acknowledged: true } : false;
    },
    async recordOutcome(idempotencyKey, safeOutcomeReference) {
      calls.push({ method: 'recordOutcome', idempotencyKey, safeOutcomeReference });
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.status !== 'started') throw new Error('Invalid synthetic ledger state.');
      entry.safeOutcomeReference = safeOutcomeReference;
      entry.status = acknowledgeOutcome ? 'completed' : 'uncertain';
      return acknowledgeOutcome ? { acknowledged: true } : false;
    },
    async lookup(idempotencyKey) {
      calls.push({ method: 'lookup', idempotencyKey });
      return entries.get(idempotencyKey) ?? null;
    },
    ...overrides,
  };

  assert.deepEqual(EXECUTION_LEDGER_METHODS, ['reserve', 'recordStarted', 'recordOutcome', 'lookup']);
  return ledger;
}

function makeExecution(ledger, effect, overrides = {}) {
  return executeSyntheticEffectWithLedgerForTest({
    ledger,
    idempotencyKey: ID,
    proposalHash: HASH,
    safeOutcomeReference: OUTCOME_REFERENCE,
    effect,
    ...overrides,
  });
}

test('test-only execution waits for reserve, start, effect, and outcome acknowledgment in order', async () => {
  const ledger = createFakeLedger();
  const sequence = [];
  const result = await makeExecution(ledger, async () => {
    sequence.push('effect');
    return { value: 'synthetic-only' };
  });

  assert.deepEqual(result, {
    status: 'completed',
    result: { value: 'synthetic-only' },
    safeOutcomeReference: OUTCOME_REFERENCE,
  });
  assert.deepEqual(ledger.calls.map(({ method }) => method), [
    'reserve', 'recordStarted', 'recordOutcome',
  ]);
  assert.deepEqual(sequence, ['effect']);
});

test('missing ledger and invalid idempotency data reject before any synthetic effect', async () => {
  let effectCalls = 0;
  const effect = async () => { effectCalls += 1; };

  await assert.rejects(makeExecution(undefined, effect));
  await assert.rejects(makeExecution(createFakeLedger(), effect, { idempotencyKey: 'invalid' }));
  await assert.rejects(makeExecution(createFakeLedger(), effect, { proposalHash: 'not-a-hash' }));

  assert.equal(effectCalls, 0);
});

test('unacknowledged reservation or start blocks the synthetic effect', async () => {
  let effectCalls = 0;
  const effect = async () => { effectCalls += 1; };
  const invalidReservation = createFakeLedger({
    async reserve() { return { status: 'unacknowledged' }; },
  });
  await assert.rejects(makeExecution(invalidReservation, effect));

  const missingStartAck = createFakeLedger({ acknowledgeStart: false });
  await assert.rejects(makeExecution(missingStartAck, effect), LedgerAcknowledgementError);
  assert.equal(effectCalls, 0);
});

test('completed replay returns the stored safe reference and a conflicting hash cannot repeat the effect', async () => {
  const ledger = createFakeLedger();
  let effectCalls = 0;
  const effect = async () => {
    effectCalls += 1;
    return { value: 'single synthetic execution' };
  };

  const first = await makeExecution(ledger, effect);
  const replay = await makeExecution(ledger, effect);
  assert.equal(first.status, 'completed');
  assert.deepEqual(replay, {
    status: 'replayed',
    safeOutcomeReference: OUTCOME_REFERENCE,
  });
  assert.equal(effectCalls, 1);
  await assert.rejects(makeExecution(ledger, effect, { proposalHash: 'b'.repeat(64) }));
  assert.equal(effectCalls, 1);
});

test('uncertain outcome acknowledgment replays safely without repeating the effect', async () => {
  const ledger = createFakeLedger({ acknowledgeOutcome: false });
  let effectCalls = 0;
  const effect = async () => {
    effectCalls += 1;
    return { value: 'synthetic effect once' };
  };

  await assert.rejects(makeExecution(ledger, effect), LedgerAcknowledgementError);
  const replay = await makeExecution(ledger, effect);

  assert.deepEqual(replay, {
    status: 'replayed',
    safeOutcomeReference: OUTCOME_REFERENCE,
  });
  assert.equal(effectCalls, 1);
  assert.deepEqual(ledger.calls.map(({ method }) => method), [
    'reserve', 'recordStarted', 'recordOutcome', 'reserve',
  ]);
});

test('production executor still exposes only the six read tools and no synthetic write method', async () => {
  const handlerCalls = [];
  const handlers = Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    async () => { handlerCalls.push(name); return { operation: name }; },
  ]));
  const { registry, modelTools } = createAgentToolRegistry(handlers);
  const executor = createToolExecutor({ registry });

  assert.deepEqual([...registry.keys()], [...AGENT_READ_TOOL_NAMES]);
  assert.equal(modelTools.length, 6);
  assert.equal(Object.hasOwn(executor, 'executeSyntheticEffectWithLedgerForTest'), false);
  assert.equal(registry.has('createTask'), false);
  assert.equal(handlerCalls.length, 0);
});
