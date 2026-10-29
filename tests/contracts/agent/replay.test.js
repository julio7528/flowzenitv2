import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertExecutionLedgerPort,
  LedgerAcknowledgementError,
  runSyntheticEffectWithLedger,
} from '../../../server/agent/persistence/ports.js';

const IDEMPOTENCY_KEY = '0a5fdc85-3e38-4a5d-9c0e-328921f4d54c';
const PROPOSAL_HASH = 'a'.repeat(64);
const OUTCOME_REFERENCE = 'synthetic-outcome-1';

class IdempotencyConflictError extends Error {
  constructor() {
    super('Synthetic ledger rejected an idempotency conflict.');
    this.name = 'IdempotencyConflictError';
  }
}

/** In-memory test ledger; it has no database, network, or product data. */
function createMemoryLedger(options = {}) {
  const startAcknowledgement = Object.hasOwn(options, 'startAcknowledgement')
    ? options.startAcknowledgement
    : true;
  const outcomeAcknowledgement = Object.hasOwn(options, 'outcomeAcknowledgement')
    ? options.outcomeAcknowledgement
    : true;
  const reservationResult = options.reservationResult;
  const overrideReservationResult = options.overrideReservationResult === true;
  const entries = new Map();
  const calls = { reservations: [], starts: [], outcomes: [], lookups: [] };

  return {
    calls,
    async reserve(idempotencyKey, proposalHash) {
      calls.reservations.push({ idempotencyKey, proposalHash });
      if (overrideReservationResult) return reservationResult;

      const existing = entries.get(idempotencyKey);
      if (existing) {
        if (existing.proposalHash !== proposalHash) throw new IdempotencyConflictError();
        if (existing.status === 'completed') {
          return {
            status: 'prior-outcome',
            safeOutcomeReference: existing.safeOutcomeReference,
          };
        }
        throw new IdempotencyConflictError();
      }

      entries.set(idempotencyKey, { proposalHash, status: 'reserved' });
      return { status: 'reserved' };
    },
    async recordStarted(idempotencyKey) {
      calls.starts.push(idempotencyKey);
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.status !== 'reserved') throw new IdempotencyConflictError();
      entry.status = 'started';
      return startAcknowledgement;
    },
    async recordOutcome(idempotencyKey, safeOutcomeReference) {
      calls.outcomes.push({ idempotencyKey, safeOutcomeReference });
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.status !== 'started') throw new IdempotencyConflictError();
      if (outcomeAcknowledgement === true) {
        entry.status = 'completed';
        entry.safeOutcomeReference = safeOutcomeReference;
      } else {
        // An unacknowledged result is uncertain; a later reserve must not repeat it.
        entry.status = 'uncertain';
      }
      return outcomeAcknowledgement;
    },
    async lookup(idempotencyKey) {
      calls.lookups.push(idempotencyKey);
      return entries.get(idempotencyKey) ?? null;
    },
  };
}

function runEffect(ledger, effect, overrides = {}) {
  return runSyntheticEffectWithLedger({
    ledger,
    idempotencyKey: IDEMPOTENCY_KEY,
    proposalHash: PROPOSAL_HASH,
    effect,
    safeOutcomeReference: OUTCOME_REFERENCE,
    ...overrides,
  });
}

test('execution ledger contract requires every port method', () => {
  assert.throws(
    () => assertExecutionLedgerPort({ reserve() {} }),
    /missing a required method/,
  );

  const ledger = createMemoryLedger();
  assert.equal(assertExecutionLedgerPort(ledger), ledger);
});

test('acknowledged reserve, start, and outcome produce one completed synthetic effect', async () => {
  const ledger = createMemoryLedger();
  let effectCalls = 0;

  const result = await runEffect(ledger, async () => {
    effectCalls += 1;
    return { value: 'synthetic-only' };
  });

  assert.deepEqual(result, {
    status: 'completed',
    result: { value: 'synthetic-only' },
    safeOutcomeReference: OUTCOME_REFERENCE,
  });
  assert.equal(effectCalls, 1);
  assert.deepEqual(ledger.calls.reservations, [{
    idempotencyKey: IDEMPOTENCY_KEY,
    proposalHash: PROPOSAL_HASH,
  }]);
  assert.deepEqual(ledger.calls.starts, [IDEMPOTENCY_KEY]);
  assert.deepEqual(ledger.calls.outcomes, [{
    idempotencyKey: IDEMPOTENCY_KEY,
    safeOutcomeReference: OUTCOME_REFERENCE,
  }]);
});

test('completed effect replay returns the stored outcome without invoking it again', async () => {
  const ledger = createMemoryLedger();
  let effectCalls = 0;
  const effect = async () => {
    effectCalls += 1;
    return { sequence: effectCalls };
  };

  const first = await runEffect(ledger, effect);
  const replay = await runEffect(ledger, effect);

  assert.equal(first.status, 'completed');
  assert.deepEqual(replay, {
    status: 'replayed',
    safeOutcomeReference: OUTCOME_REFERENCE,
  });
  assert.equal(effectCalls, 1);
  assert.equal(ledger.calls.reservations.length, 2);
  assert.deepEqual(ledger.calls.reservations[0], ledger.calls.reservations[1]);
  assert.equal(ledger.calls.starts.length, 1);
  assert.equal(ledger.calls.outcomes.length, 1);
});

test('missing or invalid reservation acknowledgements reject before the effect', async () => {
  for (const reservationResult of [undefined, null, { acknowledged: true }, { status: 'unknown' }]) {
    const ledger = createMemoryLedger({ overrideReservationResult: true, reservationResult });
    let effectCalls = 0;

    await assert.rejects(
      runEffect(ledger, async () => {
        effectCalls += 1;
      }),
    );
    assert.equal(effectCalls, 0);
    assert.equal(ledger.calls.starts.length, 0);
  }
});

test('missing or invalid start acknowledgements reject before the effect', async () => {
  for (const startAcknowledgement of [undefined, false, { acknowledged: false }]) {
    const ledger = createMemoryLedger({ startAcknowledgement });
    let effectCalls = 0;

    await assert.rejects(
      runEffect(ledger, async () => {
        effectCalls += 1;
      }),
      LedgerAcknowledgementError,
    );
    assert.equal(effectCalls, 0);
    assert.equal(ledger.calls.starts.length, 1);
    assert.equal(ledger.calls.outcomes.length, 0);
  }
});

test('missing or invalid outcome acknowledgements are not reported complete or replayed', async () => {
  for (const outcomeAcknowledgement of [undefined, false, { acknowledged: false }]) {
    const ledger = createMemoryLedger({ outcomeAcknowledgement });
    let effectCalls = 0;
    const effect = async () => {
      effectCalls += 1;
      return { value: 'synthetic-side-effect' };
    };

    await assert.rejects(runEffect(ledger, effect), LedgerAcknowledgementError);
    assert.equal(effectCalls, 1);
    assert.equal(ledger.calls.outcomes.length, 1);

    await assert.rejects(runEffect(ledger, effect), IdempotencyConflictError);
    assert.equal(effectCalls, 1);
  }
});

test('idempotency keys and proposal hashes are validated before ledger calls', async () => {
  for (const idempotencyKey of ['not-a-uuid', '']) {
    const ledger = createMemoryLedger();
    let effectCalls = 0;

    await assert.rejects(runEffect(ledger, async () => { effectCalls += 1; }, { idempotencyKey }));
    assert.equal(ledger.calls.reservations.length, 0);
    assert.equal(effectCalls, 0);
  }

  for (const proposalHash of ['short', 'A'.repeat(64), 'g'.repeat(64)]) {
    const ledger = createMemoryLedger();
    let effectCalls = 0;

    await assert.rejects(runEffect(ledger, async () => { effectCalls += 1; }, { proposalHash }));
    assert.equal(ledger.calls.reservations.length, 0);
    assert.equal(effectCalls, 0);
  }
});

test('same idempotency key with a different proposal hash is rejected without a duplicate effect', async () => {
  const ledger = createMemoryLedger();
  let effectCalls = 0;
  const effect = async () => {
    effectCalls += 1;
    return 'synthetic';
  };

  await runEffect(ledger, effect);
  await assert.rejects(
    runEffect(ledger, effect, { proposalHash: 'b'.repeat(64) }),
    IdempotencyConflictError,
  );
  assert.equal(effectCalls, 1);
});
