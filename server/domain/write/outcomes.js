import { z } from 'zod';
import { DecimalIdSchema, MUTATION_OPERATIONS, SUBTASK_STATUSES } from './contracts.js';
import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

export const MUTATION_OUTCOMES = Object.freeze([
  'COMMITTED',
  'NO_OP',
  'VALIDATION_ERROR',
  'DENIED',
  'CONFIRMATION_REQUIRED',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'DEPENDENCY_UNAVAILABLE',
  'FAILED',
]);

export const MUTATION_REASON_CATEGORIES = Object.freeze([
  'SUCCESS',
  'INVALID_INPUT',
  'NOT_FOUND',
  'INVALID_PARENT',
  'UNSUPPORTED_TARGET',
  'STALE_STATE',
  'SCHEDULE_CONFLICT',
  'CONFIRMATION_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'ACCESS_DISABLED',
  'POLICY_UNAVAILABLE',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL',
]);

const DomainStatusSchema = z.enum(['Backlog', 'Em andamento', ...SUBTASK_STATUSES.slice(1)]);
const CivilValueSchema = z.string().nullable();
const ResultingValuesSchema = z.strictObject({
  name: z.string().optional(),
  date: CivilValueSchema.optional(),
  startTime: CivilValueSchema.optional(),
  endTime: CivilValueSchema.optional(),
  status: DomainStatusSchema.optional(),
});

export const MutationOutcomeSchema = z.strictObject({
  outcome: z.enum(MUTATION_OUTCOMES),
  operation: z.enum(MUTATION_OPERATIONS),
  operationVersion: z.literal(1),
  persistentId: DecimalIdSchema.optional(),
  resultingValues: ResultingValuesSchema.optional(),
  derivedStatuses: z.strictObject({
    task: DomainStatusSchema,
    demand: DomainStatusSchema,
  }).optional(),
  correlationId: z.uuid(),
  reasonCategory: z.enum(MUTATION_REASON_CATEGORIES),
});

const SAFE_SQLSTATE_CATEGORIES = Object.freeze({
  '23502': 'INVALID_INPUT',
  '23503': 'INVALID_PARENT',
  '23514': 'INVALID_INPUT',
  '40001': 'STALE_STATE',
  '40P01': 'STALE_STATE',
  '42501': 'ACCESS_DISABLED',
  'P0002': 'NOT_FOUND',
});

/** Return only an allowlisted category; never copy a database error message. */
export function categorizeMutationDatabaseError(error) {
  if (error === null || typeof error !== 'object') return 'INTERNAL';
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, 'code');
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'string') {
      return 'INTERNAL';
    }
    return SAFE_SQLSTATE_CATEGORIES[descriptor.value] || 'INTERNAL';
  } catch {
    return 'INTERNAL';
  }
}

/** Construct a bounded response DTO; invalid or raw fields are never returned. */
export function createMutationOutcome(value) {
  const result = MutationOutcomeSchema.safeParse(value);
  if (!result.success) throw new TypeError('Invalid mutation outcome.');
  return Object.freeze(result.data);
}
