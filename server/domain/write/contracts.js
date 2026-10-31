import { z } from 'zod';
import { validateDecimalId, validateLocalDate } from '../read/contracts.js';
import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

export const MUTATION_OPERATIONS = Object.freeze([
  'create_demand',
  'create_task',
  'create_subtask',
  'rename_demand',
  'rename_task',
  'rename_subtask',
  'set_weekly_allocation',
  'set_daily_subtask_schedule',
  'set_subtask_status',
]);

export const SUBTASK_STATUSES = Object.freeze([
  'Backlog',
  'Analise',
  'Executando',
  'Aguardando',
  'Done',
]);

function passesValidator(validator, value) {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

export const DecimalIdSchema = z.string()
  .regex(/^[1-9][0-9]*$/)
  .refine(value => passesValidator(validateDecimalId, value), {
    message: 'Invalid decimal identifier.',
  });

export const CivilDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => passesValidator(validateLocalDate, value), {
    message: 'Invalid civil date.',
  });

const NameSchema = z.string().refine(value => value.trim().length > 0, {
  message: 'A non-empty name is required.',
});
const NamePayloadSchema = z.strictObject({ name: NameSchema });
const CreateDemandSchema = z.strictObject({
  operation: z.literal('create_demand'),
  version: z.literal(1),
  parentId: z.null().optional(),
  payload: NamePayloadSchema,
});
const CreateTaskSchema = z.strictObject({
  operation: z.literal('create_task'),
  version: z.literal(1),
  parentId: DecimalIdSchema,
  payload: NamePayloadSchema,
});
const CreateSubtaskSchema = z.strictObject({
  operation: z.literal('create_subtask'),
  version: z.literal(1),
  parentId: DecimalIdSchema,
  payload: NamePayloadSchema,
});
const RenameSchema = (operation) => z.strictObject({
  operation: z.literal(operation),
  version: z.literal(1),
  targetId: DecimalIdSchema,
  payload: NamePayloadSchema,
});
const WeeklyAllocationSchema = z.strictObject({
  operation: z.literal('set_weekly_allocation'),
  version: z.literal(1),
  targetId: DecimalIdSchema,
  payload: z.strictObject({ date: CivilDateSchema.nullable() }),
});
const DailyScheduleSchema = z.strictObject({
  operation: z.literal('set_daily_subtask_schedule'),
  version: z.literal(1),
  targetId: DecimalIdSchema,
  payload: z.strictObject({
    date: CivilDateSchema.nullable(),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/).nullable(),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/).nullable(),
  }).superRefine((payload, context) => {
    const allNull = payload.date === null && payload.startTime === null && payload.endTime === null;
    const allPresent = payload.date !== null && payload.startTime !== null && payload.endTime !== null;
    if (!allNull && !allPresent) {
      context.addIssue({ code: 'custom', message: 'Daily schedule fields must be all null or all present.' });
    }
  }),
});
const SubtaskStatusSchema = z.strictObject({
  operation: z.literal('set_subtask_status'),
  version: z.literal(1),
  targetId: DecimalIdSchema,
  payload: z.strictObject({ status: z.enum(SUBTASK_STATUSES) }),
});

export const MutationCommandSchema = z.discriminatedUnion('operation', [
  CreateDemandSchema,
  CreateTaskSchema,
  CreateSubtaskSchema,
  RenameSchema('rename_demand'),
  RenameSchema('rename_task'),
  RenameSchema('rename_subtask'),
  WeeklyAllocationSchema,
  DailyScheduleSchema,
  SubtaskStatusSchema,
]);

function clonePlainData(value, seen = new WeakSet()) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value !== 'object' || Array.isArray(value) || seen.has(value)) return undefined;

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0) return undefined;
  } catch {
    return undefined;
  }

  seen.add(value);
  const copy = Object.create(null);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return undefined;
    const cloned = clonePlainData(descriptor.value, seen);
    if (cloned === undefined) return undefined;
    copy[key] = cloned;
  }
  seen.delete(value);
  return copy;
}

/**
 * Validate a model/client command without running getters or retaining unknown
 * fields. Access, confirmation and idempotency authority are server-owned and
 * deliberately cannot be represented in this DTO.
 */
export function validateMutationCommand(value) {
  const safeInput = clonePlainData(value);
  if (!safeInput) return Object.freeze({ valid: false });

  const result = MutationCommandSchema.safeParse(safeInput);
  return result.success
    ? Object.freeze({ valid: true, command: result.data })
    : Object.freeze({ valid: false });
}
