import { z } from 'zod';

export const CHECKPOINT_PORT_METHODS = Object.freeze(['load', 'save']);
export const EXECUTION_LEDGER_METHODS = Object.freeze([
  'reserve',
  'recordStarted',
  'recordOutcome',
  'lookup',
]);

export const CHECKPOINT_NOT_FOUND = Symbol.for('flowzenit.agent.checkpoint.not-found');

export const LedgerReservationSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('reserved') }),
  z.strictObject({
    status: z.literal('prior-outcome'),
    safeOutcomeReference: z.string().min(1),
  }),
]);

export const LedgerAcknowledgementSchema = z.strictObject({
  acknowledged: z.literal(true),
});

export const SafeOutcomeReferenceSchema = z.string().min(1);

/**
 * @typedef {object} CheckpointPort
 * @property {(threadId: string) => Promise<unknown | typeof CHECKPOINT_NOT_FOUND>} load
 * @property {(threadId: string, graphVersion: string, checkpoint: unknown) => Promise<unknown>} save
 *
 * Implementations are injected. This module deliberately supplies no storage
 * adapter, database schema, serialization policy, or production persistence.
 */

/**
 * @typedef {object} ExecutionLedger
 * @property {(idempotencyKey: string, proposalHash: string) => Promise<unknown>} reserve
 * @property {(idempotencyKey: string) => Promise<unknown>} recordStarted
 * @property {(idempotencyKey: string, safeOutcomeReference: string) => Promise<unknown>} recordOutcome
 * @property {(idempotencyKey: string) => Promise<unknown>} lookup
 */

function assertMethods(value, methods, contractName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${contractName} must be an injected object.`);
  }

  for (const method of methods) {
    if (typeof value[method] !== 'function') {
      throw new TypeError(`${contractName} is missing a required method.`);
    }
  }

  return value;
}

export function assertCheckpointPort(port) {
  return assertMethods(port, CHECKPOINT_PORT_METHODS, 'CheckpointPort');
}

export function assertExecutionLedgerPort(ledger) {
  return assertMethods(ledger, EXECUTION_LEDGER_METHODS, 'ExecutionLedger');
}

/** Treat an absent fake checkpoint result as the port's NOT_FOUND value. */
export async function loadCheckpoint(port, threadId) {
  if (typeof threadId !== 'string' || threadId.length === 0) {
    throw new TypeError('A non-empty thread identifier is required.');
  }

  const checkpointPort = assertCheckpointPort(port);
  const result = await checkpointPort.load(threadId);
  return result === undefined || result === null ? CHECKPOINT_NOT_FOUND : result;
}

export class LedgerAcknowledgementError extends Error {
  constructor() {
    super('The execution ledger did not acknowledge the operation.');
    this.name = 'LedgerAcknowledgementError';
    this.code = 'LEDGER_ACKNOWLEDGEMENT_REQUIRED';
  }
}

function isAcknowledged(value) {
  return value === true || LedgerAcknowledgementSchema.safeParse(value).success;
}

/**
 * Test-only helper for a synthetic effect. It never creates a write tool or a
 * persistence adapter. No effect is called unless reservation and start are
 * acknowledged, and continuation waits for an acknowledged safe outcome.
 */
export async function runSyntheticEffectWithLedger({
  ledger,
  idempotencyKey,
  proposalHash,
  effect,
  safeOutcomeReference,
}) {
  const validatedIdempotencyKey = z.uuid().parse(idempotencyKey);
  const validatedProposalHash = z.string().regex(/^[a-f0-9]{64}$/).parse(proposalHash);
  const outcomeReference = SafeOutcomeReferenceSchema.parse(safeOutcomeReference);
  if (typeof effect !== 'function') throw new TypeError('A synthetic effect function is required.');

  const executionLedger = assertExecutionLedgerPort(ledger);
  const reservation = LedgerReservationSchema.parse(
    await executionLedger.reserve(validatedIdempotencyKey, validatedProposalHash),
  );

  if (reservation.status === 'prior-outcome') {
    return Object.freeze({
      status: 'replayed',
      safeOutcomeReference: reservation.safeOutcomeReference,
    });
  }

  if (!isAcknowledged(await executionLedger.recordStarted(validatedIdempotencyKey))) {
    throw new LedgerAcknowledgementError();
  }

  const effectResult = await effect();
  if (!isAcknowledged(
    await executionLedger.recordOutcome(validatedIdempotencyKey, outcomeReference),
  )) {
    throw new LedgerAcknowledgementError();
  }

  return Object.freeze({
    status: 'completed',
    result: effectResult,
    safeOutcomeReference: outcomeReference,
  });
}
