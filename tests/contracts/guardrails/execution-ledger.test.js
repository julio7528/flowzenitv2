import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createPolicyEvaluator } from '../../../server/agent/guardrails/policy.js';
import { SYNTHETIC_CONFIRMATION_MATRIX } from '../../fixtures/security/confirmations.js';

const action = Object.freeze({
  operationName: 'synthetic.read',
  operationVersion: '1',
  target: Object.freeze({ id: 'synthetic' }),
  arguments: Object.freeze({ value: 'synthetic-payload' }),
});
const idempotencyKey = '00000000-0000-4000-8000-000000000001';

function createHarness({ ledger, handler = async input => input.value, keyProvider = async () => idempotencyKey } = {}) {
  const events = [];
  let handlerCalls = 0;
  const capabilityRegistry = new Map([
    ['synthetic.read@1', {
      operationName: 'synthetic.read',
      operationVersion: '1',
      capability: 'synthetic.read',
      enabled: true,
      inputSchema: z.strictObject({ value: z.string() }),
      isTargetInScope: target => target === '{"id":"synthetic"}',
      readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }),
      handler: async (...args) => {
        handlerCalls += 1;
        events.push('handler');
        return handler(...args);
      },
    }],
  ]);
  const evaluator = createPolicyEvaluator({
    accessGate: { allowsAction: async () => true },
    matrixProvider: () => SYNTHETIC_CONFIRMATION_MATRIX,
    budgetProvider: () => ({ graphStepsUsed: 0, modelCallsUsed: 0, toolCallsUsed: 0 }),
    capabilityRegistry,
    executionLedger: ledger,
    idempotencyKeyProvider: keyProvider,
  });
  return { evaluator, events, get handlerCalls() { return handlerCalls; } };
}

function makeLedger(overrides = {}) {
  return {
    reserve: async () => ({ status: 'reserved' }),
    recordStarted: async () => ({ acknowledged: true }),
    recordOutcome: async () => ({ acknowledged: true }),
    lookup: async () => ({ state: 'started' }),
    ...overrides,
  };
}

test('missing, uncertain, conflicting, or malformed reservations deny before the handler', async () => {
  const cases = [
    { name: 'missing ledger', ledger: null },
    { name: 'unavailable reservation', ledger: makeLedger({ reserve: async () => { throw new Error('offline'); } }) },
    { name: 'uncertain reservation', ledger: makeLedger({ reserve: async () => ({ status: 'uncertain' }) }) },
    { name: 'conflicting hash', ledger: makeLedger({ reserve: async () => ({ status: 'conflict' }) }), reason: 'IDEMPOTENCY_CONFLICT' },
  ];

  for (const item of cases) {
    const harness = createHarness({ ledger: item.ledger });
    const result = await harness.evaluator.execute(action);
    assert.equal(result.status, 'denied', item.name);
    assert.equal(result.decision.reasonCategory, item.reason ?? 'DEPENDENCY_UNAVAILABLE', item.name);
    assert.equal(harness.handlerCalls, 0, item.name);
  }
});

test('handler runs only after reserve and start acknowledgement, and success returns after outcome acknowledgement', async () => {
  const events = [];
  const ledger = makeLedger({
    reserve: async (key, hash) => {
      events.push(['reserve', key, hash]);
      return { status: 'reserved' };
    },
    recordStarted: async key => {
      events.push(['recordStarted', key]);
      return { acknowledged: true };
    },
    recordOutcome: async (key, reference) => {
      events.push(['recordOutcome', key, reference]);
      return { acknowledged: true };
    },
  });
  const harness = createHarness({ ledger });
  const result = await harness.evaluator.execute(action);

  assert.equal(result.status, 'executed');
  assert.equal(result.handlerResult, 'synthetic-payload');
  assert.match(result.safeOutcomeReference, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(events.map(event => event[0]), ['reserve', 'recordStarted', 'recordOutcome']);
  assert.equal(events[0][1], idempotencyKey);
  assert.match(events[0][2], /^[a-f0-9]{64}$/);
  assert.deepEqual(harness.events, ['handler']);
  assert.equal(events[2][1], idempotencyKey);
  assert.equal(events[2][2], result.safeOutcomeReference);
});

test('a durable prior outcome replays without starting or invoking the handler again', async () => {
  const ledgerEvents = [];
  const ledger = makeLedger({
    reserve: async key => {
      ledgerEvents.push(['reserve', key]);
      return { status: 'prior-outcome', safeOutcomeReference: 'sha256:prior-safe-outcome' };
    },
    recordStarted: async () => { ledgerEvents.push(['recordStarted']); return { acknowledged: true }; },
    recordOutcome: async () => { ledgerEvents.push(['recordOutcome']); return { acknowledged: true }; },
  });
  const harness = createHarness({ ledger });
  const result = await harness.evaluator.execute(action);

  assert.equal(result.status, 'replayed');
  assert.equal(result.safeOutcomeReference, 'sha256:prior-safe-outcome');
  assert.deepEqual(ledgerEvents.map(event => event[0]), ['reserve']);
  assert.equal(harness.handlerCalls, 0);
});

test('missing start acknowledgement blocks the handler', async () => {
  const ledger = makeLedger({ recordStarted: async () => ({ acknowledged: false }) });
  const harness = createHarness({ ledger });
  const result = await harness.evaluator.execute(action);

  assert.equal(result.status, 'denied');
  assert.equal(result.decision.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(harness.handlerCalls, 0);
});

test('missing outcome acknowledgement never reports success after a handler invocation', async () => {
  const ledger = makeLedger({ recordOutcome: async () => null });
  const harness = createHarness({ ledger });
  const result = await harness.evaluator.execute(action);

  assert.equal(result.status, 'failed');
  assert.equal(result.decision.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(harness.handlerCalls, 1);
});

test('a handler error records an uncertain outcome and does not claim success', async () => {
  let recordedReference;
  const ledger = makeLedger({
    recordOutcome: async (_key, reference) => {
      recordedReference = reference;
      return { acknowledged: true };
    },
  });
  const harness = createHarness({ ledger, handler: async () => { throw new Error('synthetic failure'); } });
  const result = await harness.evaluator.execute(action);

  assert.equal(result.status, 'failed');
  assert.equal(result.decision.outcome, 'DENY');
  assert.match(recordedReference, /^uncertain:[a-f0-9]{64}$/);
  assert.equal(result.safeOutcomeReference, recordedReference);
  assert.equal(harness.handlerCalls, 1);
});

test('unavailable or invalid server idempotency-key sources deny before reservation', async () => {
  for (const keyProvider of [
    async () => { throw new Error('synthetic unavailable'); },
    async () => 'client-controlled-key',
  ]) {
    let reserveCalls = 0;
    const harness = createHarness({
      ledger: makeLedger({ reserve: async () => { reserveCalls += 1; return { status: 'reserved' }; } }),
      keyProvider,
    });
    const result = await harness.evaluator.execute(action);
    assert.equal(result.status, 'denied');
    assert.equal(result.decision.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(reserveCalls, 0);
    assert.equal(harness.handlerCalls, 0);
  }
});
