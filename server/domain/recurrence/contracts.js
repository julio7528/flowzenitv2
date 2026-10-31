import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateDecimalId, validateLocalDate } from '../read/contracts.js';
import { MutationOutcomeSchema } from '../write/outcomes.js';
import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

function passesValidator(validator, value) {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

export const RoutineCivilDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => passesValidator(validateLocalDate, value), {
    message: 'Invalid civil date.',
  });

export const RoutineLocalTimeSchema = z.string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);

function localTimeValue(value) {
  const [clock, fractional = ''] = value.split('.');
  const [hours, minutes, seconds = '0'] = clock.split(':').map(Number);
  const microseconds = Number(fractional.padEnd(6, '0') || '0');
  return (((hours * 60 + minutes) * 60 + seconds) * 1_000_000) + microseconds;
}

const RoutineWeekdaysSchema = z.array(z.number().int().min(1).max(7))
  .min(1)
  .max(7)
  .refine(days => new Set(days).size === days.length, {
    message: 'Weekdays must be unique.',
  })
  .transform(days => [...days].sort((left, right) => left - right));

/** Canonical model/tool input; dates and times remain civil strings. */
export const CreateRoutineSeriesInputSchema = z.strictObject({
  name: z.string().trim().min(1),
  weekdaysISO: RoutineWeekdaysSchema,
  startDate: RoutineCivilDateSchema,
  endDate: RoutineCivilDateSchema,
  startTime: RoutineLocalTimeSchema,
  endTime: RoutineLocalTimeSchema.nullable().optional().transform(value => value ?? null),
}).superRefine((value, context) => {
  if (value.startDate > value.endDate) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Date range is reversed.' });
  }
  if (value.endTime !== null && localTimeValue(value.endTime) <= localTimeValue(value.startTime)) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must follow start time.' });
  }
});

export function validateCreateRoutineSeriesInput(value) {
  return CreateRoutineSeriesInputSchema.parse(value);
}

export const RoutineSeriesOutcomeSchema = MutationOutcomeSchema.extend({
  operation: z.literal('create_routine_series'),
});

export function createRoutineSeriesOutcome({ outcome, persistentId, reasonCategory, correlationId = randomUUID() }) {
  const candidate = {
    outcome,
    operation: 'create_routine_series',
    operationVersion: 1,
    correlationId,
    reasonCategory,
  };
  if (persistentId !== undefined) candidate.persistentId = persistentId;
  return Object.freeze(RoutineSeriesOutcomeSchema.parse(candidate));
}

export function isRoutineTemplateId(value) {
  return passesValidator(validateDecimalId, value);
}
