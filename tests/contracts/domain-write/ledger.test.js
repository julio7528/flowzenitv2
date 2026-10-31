import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMutationIdempotencyLedger,
  reserveMutation,
} from '../../../server/domain/write/idempotency.js';

const KEY = '123e4567-e89b-42d3-a456-426614174000';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function createSyntheticLedger() {
  const entries = new Map();
  return {
    async reserve({ idempotencyKey, commandHash }) {
      const prior = entries.get(idempotencyKey);
      if (!prior) {
        entries.set(idempotencyKey, { commandHash, state: 'reserved' });
        return { status: 'reserved' };
      }
      if (prior.commandHash !== commandHash) return { status: 'conflict' };
      if (prior.state === 'completed') {
        return { status: 'prior-outcome', safeOutcomeReference: prior.safeOutcomeReference };
      }
      if (prior.state === 'uncertain') return { status: 'unavailable' };
      return { status: 'conflict' };
    },
    async recordStarted(idempotencyKey) {
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.state !== 'reserved') return { acknowledged: false };
      entry.state = 'started';
      return { acknowledged: true };
    },
    async recordOutcome(idempotencyKey, safeOutcomeReference) {
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.state !== 'started') return { acknowledged: false };
      Object.assign(entry, { state: 'completed', safeOutcomeReference });
      return { acknowledged: true };
    },
    async recordUncertain(idempotencyKey) {
      const entry = entries.get(idempotencyKey);
      if (!entry || !['started', 'reserved'].includes(entry.state)) return { acknowledged: false };
      entry.state = 'uncertain';
      return { acknowledged: true };
    },
  };
}

test('same-key same-hash replay returns a prior safe outcome without a second reservation', async () => {
  const ledger = createSyntheticLedger();
  assert.equal(assertMutationIdempotencyLedger(ledger), ledger);
  assert.deepEqual(await reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A }), { status: 'reserved' });
  await ledger.recordStarted(KEY);
  await ledger.recordOutcome(KEY, 'synthetic-outcome-001');
  assert.deepEqual(await reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A }), {
    status: 'prior-outcome',
    safeOutcomeReference: 'synthetic-outcome-001',
  });
});

test('same key with a different hash conflicts and concurrent reservations admit one effect', async () => {
  const ledger = createSyntheticLedger();
  const concurrent = await Promise.all([
    reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A }),
    reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A }),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status).sort(), ['conflict', 'reserved']);
  assert.deepEqual(await reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_B }), { status: 'conflict' });
});

test('uncertain outcomes never become a fresh reservation', async () => {
  const ledger = createSyntheticLedger();
  await reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A });
  await ledger.recordStarted(KEY);
  await ledger.recordUncertain(KEY);
  assert.deepEqual(await reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A }), { status: 'unavailable' });
});

test('ledger result is validated and malformed requests do not reach the port', async () => {
  let called = false;
  const ledger = {
    ...createSyntheticLedger(),
    async reserve() { called = true; return { status: 'reserved', sql: 'forbidden' }; },
  };
  await assert.rejects(() => reserveMutation(ledger, { idempotencyKey: 'not-a-uuid', commandHash: HASH_A }));
  assert.equal(called, false);
  await assert.rejects(() => reserveMutation(ledger, { idempotencyKey: KEY, commandHash: HASH_A }));
});
