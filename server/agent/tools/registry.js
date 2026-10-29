import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  DOMAIN_KINDS,
  DOMAIN_STATUSES,
  validateDecimalId,
  validateGetDailyScheduleRequest,
  validateGetHierarchyRequest,
  validateGetItemByIdRequest,
  validateGetRoutineTemplatesRequest,
  validateGetWeeklyAllocationRequest,
  validateLocalDate,
  validateSearchItemsRequest,
} from '../../domain/read/contracts.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const AGENT_READ_TOOL_VERSION = '1.0.0';

export const AGENT_READ_TOOL_NAMES = Object.freeze([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 16_384;
const MAX_TEXT_CODE_POINTS = 200;
const ALL_STATUSES = Object.freeze([...new Set(Object.values(DOMAIN_STATUSES).flat())]);

function passesDomainValidator(validator, value) {
  try {
    validator(value);
    return true;
  } catch {
    return false;
  }
}

function addInvalidRequestIssue(context) {
  context.addIssue({
    code: 'custom',
    message: 'Invalid read request.',
  });
}

const DecimalIdSchema = z.string()
  .regex(/^[1-9][0-9]*$/)
  .refine(value => passesDomainValidator(validateDecimalId, value), {
    message: 'Invalid decimal identifier.',
  });

const LocalDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => passesDomainValidator(validateLocalDate, value), {
    message: 'Invalid civil date.',
  });

// Cursors are opaque, authenticated SPEC-004 values. This schema checks only
// the bounded string transport contract; it never parses or reconstructs one.
const OpaqueCursorSchema = z.string()
  .min(1)
  .max(MAX_CURSOR_LENGTH)
  .refine(value => !value.includes('\0'), { message: 'Invalid cursor.' });

const PageFields = Object.freeze({
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: OpaqueCursorSchema.optional(),
});

const GetHierarchyInputSchema = z.strictObject({
  itemId: DecimalIdSchema,
  ...PageFields,
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateGetHierarchyRequest, value)) addInvalidRequestIssue(context);
});

const GetItemByIdInputSchema = z.strictObject({
  itemId: DecimalIdSchema,
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateGetItemByIdRequest, value)) addInvalidRequestIssue(context);
});

const SearchItemsInputSchema = z.strictObject({
  text: z.string().min(1).optional().refine(
    value => value === undefined || Array.from(value).length <= MAX_TEXT_CODE_POINTS,
    { message: 'Search text is too long.' },
  ),
  kinds: z.array(z.enum(DOMAIN_KINDS)).min(1).optional(),
  statuses: z.array(z.enum(ALL_STATUSES)).min(1).optional(),
  dateFrom: LocalDateSchema.optional(),
  dateTo: LocalDateSchema.optional(),
  parentId: DecimalIdSchema.optional(),
  ...PageFields,
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateSearchItemsRequest, value)) addInvalidRequestIssue(context);
});

const GetDailyScheduleInputSchema = z.strictObject({
  date: LocalDateSchema,
  ...PageFields,
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateGetDailyScheduleRequest, value)) addInvalidRequestIssue(context);
});

const GetWeeklyAllocationInputSchema = z.strictObject({
  weekStart: LocalDateSchema,
  ...PageFields,
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateGetWeeklyAllocationRequest, value)) addInvalidRequestIssue(context);
});

const GetRoutineTemplatesInputSchema = z.strictObject({
  date: LocalDateSchema,
  ...PageFields,
}).superRefine((value, context) => {
  if (!passesDomainValidator(validateGetRoutineTemplatesRequest, value)) addInvalidRequestIssue(context);
});

const TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: 'getHierarchy',
    schema: GetHierarchyInputSchema,
    description: 'Read an item with its persisted ancestors and paginated descendants. Pass any returned cursor through unchanged to continue; a truncated page is incomplete.',
  }),
  Object.freeze({
    name: 'getItemById',
    schema: GetItemByIdInputSchema,
    description: 'Read one existing demand, task, or subtask by its persistent decimal ID.',
  }),
  Object.freeze({
    name: 'searchItems',
    schema: SearchItemsInputSchema,
    description: 'Search supported demands, tasks, and subtasks with explicit filters and pagination. Preserve all candidates and ask for clarification when narrowing is required.',
  }),
  Object.freeze({
    name: 'getDailySchedule',
    schema: GetDailyScheduleInputSchema,
    description: 'Read scheduled subtasks for one resolved civil date, with pagination.',
  }),
  Object.freeze({
    name: 'getWeeklyAllocation',
    schema: GetWeeklyAllocationInputSchema,
    description: 'Read the weekly allocation for a Monday civil date, with pagination.',
  }),
  Object.freeze({
    name: 'getRoutineTemplates',
    schema: GetRoutineTemplatesInputSchema,
    description: 'Read routine templates applicable to one resolved civil date; this does not create an occurrence or independent commitment.',
  }),
]);

function getReadHandlers(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('SPEC-004 read handlers are required.');
  }

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError('SPEC-004 read handlers are invalid.');
  }

  if ((prototype !== Object.prototype && prototype !== null)
    || Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError('SPEC-004 read handlers are invalid.');
  }

  const ownNames = Object.keys(descriptors).sort();
  const expectedNames = [...AGENT_READ_TOOL_NAMES].sort();
  if (ownNames.length !== expectedNames.length
    || ownNames.some((name, index) => name !== expectedNames[index])) {
    throw new TypeError('Exactly the six SPEC-004 read handlers are required.');
  }

  const handlers = new Map();
  for (const name of AGENT_READ_TOOL_NAMES) {
    const descriptor = descriptors[name];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
      throw new TypeError('SPEC-004 read handlers must be own data functions.');
    }
    handlers.set(name, descriptor.value);
  }
  return handlers;
}

function makeReadOnlyMap(entries) {
  const registry = new Map(entries);
  Object.defineProperties(registry, {
    set: { value: () => { throw new TypeError('The agent tool registry is immutable.'); } },
    delete: { value: () => { throw new TypeError('The agent tool registry is immutable.'); } },
    clear: { value: () => { throw new TypeError('The agent tool registry is immutable.'); } },
  });
  return Object.freeze(registry);
}

/**
 * Build the fixed, read-only six-tool registry from SPEC-004 service methods.
 * The registry owns no repository, Supabase client, cursor key, or query logic.
 * Service results are returned by identity so their evidence and completeness
 * metadata are never selected, rewritten, or dropped here.
 */
export function createAgentToolRegistry(domainReadTools) {
  const handlers = getReadHandlers(domainReadTools);
  const entries = [];
  const modelTools = [];

  for (const definition of TOOL_DEFINITIONS) {
    const serviceHandler = handlers.get(definition.name);
    const handler = async (input) => {
      const validatedInput = definition.schema.parse(input);
      return serviceHandler(validatedInput);
    };

    const modelTool = tool(async (input) => handler(input), {
      name: definition.name,
      description: definition.description,
      schema: definition.schema,
    });

    entries.push([definition.name, Object.freeze({
      name: definition.name,
      version: AGENT_READ_TOOL_VERSION,
      inputSchema: definition.schema,
      handler,
      modelTool,
    })]);
    modelTools.push(modelTool);
  }

  return Object.freeze({
    registry: makeReadOnlyMap(entries),
    modelTools: Object.freeze(modelTools),
  });
}
