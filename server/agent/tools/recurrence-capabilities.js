import { z } from 'zod';
import {
  READ_LIMITS,
  validateGetRoutineTemplatesRequest,
  validateLocalDate,
} from '../../domain/read/contracts.js';
import { CreateRoutineSeriesInputSchema } from '../../domain/recurrence/contracts.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const RECURRENCE_TOOL_VERSION = '1.0.0';
export const RECURRENCE_QUERY_TOOL_NAME = 'getRoutineTemplates';
export const RECURRENCE_CREATE_TOOL_NAME = 'create_routine_series';
export const RECURRENCE_WRITE_TOOL_NAMES = Object.freeze([RECURRENCE_CREATE_TOOL_NAME]);

const MAX_CURSOR_LENGTH = 256;

function passesDomainValidator(validator, value) {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

const LocalDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => passesDomainValidator(validateLocalDate, value), {
    message: 'Invalid civil date.',
  });

export const GetRoutineTemplatesInputSchema = z.strictObject({
  date: LocalDateSchema,
  pageSize: z.number().int().min(1).max(READ_LIMITS.maxPageSize).optional(),
  cursor: z.string().min(1).max(MAX_CURSOR_LENGTH)
    .refine(value => !value.includes('\0'), { message: 'Invalid cursor.' }).optional(),
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateGetRoutineTemplatesRequest, value)) {
    context.addIssue({ code: 'custom', message: 'Invalid routine query.' });
  }
});

function makeReadOnlyRegistry(entries) {
  const registry = new Map(entries);
  Object.defineProperties(registry, {
    set: { value: () => { throw new TypeError('The recurrence capability registry is immutable.'); } },
    delete: { value: () => { throw new TypeError('The recurrence capability registry is immutable.'); } },
    clear: { value: () => { throw new TypeError('The recurrence capability registry is immutable.'); } },
  });
  return Object.freeze(registry);
}

function readQueryHandler(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptor = Object.getOwnPropertyDescriptor(value, RECURRENCE_QUERY_TOOL_NAME);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0
      || !descriptor
      || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'function') return null;
    return descriptor.value;
  } catch {
    return null;
  }
}

function readCreateHandler(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptor = Object.getOwnPropertyDescriptor(value, 'createRoutineSeries');
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0
      || !descriptor
      || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'function') return null;
    return descriptor.value;
  } catch {
    return null;
  }
}

/** Wrap the existing typed SPEC-004 query and optional routine-create repository. */
export function createRecurrenceCapabilities({ readTools, recurrenceRepository } = {}) {
  const queryHandler = readQueryHandler(readTools);
  if (!queryHandler) throw new TypeError('The typed routine-template query is required.');

  const queryEntry = Object.freeze({
    name: RECURRENCE_QUERY_TOOL_NAME,
    version: RECURRENCE_TOOL_VERSION,
    enabled: true,
    agentInputSchema: GetRoutineTemplatesInputSchema,
    handler: async (input) => queryHandler(GetRoutineTemplatesInputSchema.parse(input)),
  });

  const entries = [[RECURRENCE_QUERY_TOOL_NAME, queryEntry]];
  const createHandler = readCreateHandler(recurrenceRepository);
  if (createHandler) {
    entries.push([RECURRENCE_CREATE_TOOL_NAME, Object.freeze({
      name: RECURRENCE_CREATE_TOOL_NAME,
      version: RECURRENCE_TOOL_VERSION,
      enabled: true,
      agentInputSchema: CreateRoutineSeriesInputSchema,
      handler: async (input) => createHandler(CreateRoutineSeriesInputSchema.parse(input)),
    })]);
  }

  return Object.freeze({ registry: makeReadOnlyRegistry(entries) });
}
