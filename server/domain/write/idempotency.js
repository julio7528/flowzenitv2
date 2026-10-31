import { z } from 'zod';
import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

export const MUTATION_LEDGER_METHODS = Object.freeze([
  'reserve',
  'recordStarted',
  'recordOutcome',
  'recordUncertain',
]);

export const MutationReservationSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('reserved') }),
  z.strictObject({ status: z.literal('prior-outcome'), safeOutcomeReference: z.string().min(1) }),
  z.strictObject({ status: z.literal('conflict') }),
  z.strictObject({ status: z.literal('unavailable') }),
]);

const MutationLedgerRequestSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  commandHash: z.string().regex(/^[a-f0-9]{64}$/),
});

function assertLedgerMethods(ledger) {
  if (ledger === null || typeof ledger !== 'object' || Array.isArray(ledger)) {
    throw new TypeError('A mutation idempotency ledger is required.');
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(ledger);
    descriptors = Object.getOwnPropertyDescriptors(ledger);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(ledger).length > 0) throw new TypeError();
  } catch {
    throw new TypeError('The mutation idempotency ledger is invalid.');
  }
  const keys = Object.keys(descriptors).sort();
  const expected = [...MUTATION_LEDGER_METHODS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError('The mutation idempotency ledger has an invalid method set.');
  }
  for (const method of MUTATION_LEDGER_METHODS) {
    const descriptor = descriptors[method];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
      throw new TypeError('The mutation idempotency ledger is invalid.');
    }
  }
  return ledger;
}

export function assertMutationIdempotencyLedger(ledger) {
  return assertLedgerMethods(ledger);
}

/** Reserve only a server-generated key and a canonical command hash. */
export async function reserveMutation(ledger, request) {
  const input = MutationLedgerRequestSchema.parse(request);
  const validatedLedger = assertLedgerMethods(ledger);
  return MutationReservationSchema.parse(await validatedLedger.reserve(input));
}

/**
 * @typedef {object} MutationIdempotencyLedger
 * @property {Function} reserve
 * @property {Function} recordStarted
 * @property {Function} recordOutcome
 * @property {Function} recordUncertain
 *
 * This contract defines no table, RPC, key lifecycle, retention, or persistent
 * implementation. A durable implementation requires an explicit decision.
 */
