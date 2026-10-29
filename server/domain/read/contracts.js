import { DOMAIN_READ_ERROR_CODES, DomainReadError } from './errors.js';

const INVALID_INPUT = () => new DomainReadError(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
const POSTGRES_BIGINT_MAX = 9223372036854775807n;
export const DOMAIN_KINDS = Object.freeze(['demand', 'task', 'subtask']);
export const ROUTINE_TEMPLATE_KIND = 'routineTemplate';
export const SOURCE_REF_KINDS = Object.freeze([...DOMAIN_KINDS, ROUTINE_TEMPLATE_KIND]);

export const READ_LIMITS = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 100,
  maxTextCodePoints: 200,
  maxInclusiveDateRangeDays: 366,
});

export const DOMAIN_STATUSES = Object.freeze({
  demand: Object.freeze(['Backlog', 'Em andamento', 'Done']),
  task: Object.freeze(['Backlog', 'Em andamento', 'Done']),
  subtask: Object.freeze(['Backlog', 'Analise', 'Executando', 'Aguardando', 'Done']),
});

export const QUERY_RESULT_STATES = Object.freeze(['empty', 'nonEmpty']);
export const QUERY_COMPLETENESS = Object.freeze(['complete', 'partial', 'truncated']);
export const QUERY_FRESHNESS = Object.freeze(['fresh', 'stale']);

const ALL_STATUSES = Object.freeze([...new Set(Object.values(DOMAIN_STATUSES).flat())]);
const REQUEST_FIELDS = Object.freeze({
  getHierarchy: Object.freeze(['itemId', 'pageSize', 'cursor']),
  getItemById: Object.freeze(['itemId']),
  searchItems: Object.freeze([
    'text', 'kinds', 'statuses', 'dateFrom', 'dateTo', 'parentId', 'pageSize', 'cursor',
  ]),
  getDailySchedule: Object.freeze(['date', 'pageSize', 'cursor']),
  getWeeklyAllocation: Object.freeze(['weekStart', 'pageSize', 'cursor']),
  getRoutineTemplates: Object.freeze(['date', 'pageSize', 'cursor']),
});

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertRecord(value, allowedFields) {
  if (!isPlainRecord(value)) throw INVALID_INPUT();
  if (Object.getOwnPropertySymbols(value).length > 0) throw INVALID_INPUT();

  for (const field of Object.keys(value)) {
    if (!allowedFields.includes(field)) throw INVALID_INPUT();
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw INVALID_INPUT();
  }

  return value;
}

function ownValue(record, field) {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  return descriptor ? descriptor.value : undefined;
}

function hasOwnValue(record, field) {
  return Object.hasOwn(record, field) && ownValue(record, field) !== undefined;
}

function assertUniqueEnumArray(value, allowedValues) {
  if (!Array.isArray(value) || value.length === 0) throw INVALID_INPUT();
  if (value.some(item => typeof item !== 'string' || !allowedValues.includes(item))) {
    throw INVALID_INPUT();
  }
  if (new Set(value).size !== value.length) throw INVALID_INPUT();
  return Object.freeze([...value]);
}

/** Validate a canonical positive PostgreSQL bigint ID without Number coercion. */
export function validateDecimalId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw INVALID_INPUT();
  try {
    if (BigInt(value) > POSTGRES_BIGINT_MAX) throw INVALID_INPUT();
  } catch (error) {
    if (error instanceof DomainReadError) throw error;
    throw INVALID_INPUT();
  }
  return value;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function civilDayNumber(year, month, day) {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365
    + Math.floor(yearOfEra / 4)
    - Math.floor(yearOfEra / 100)
    + dayOfYear;

  // Integer day count relative to 1970-01-01; no timezone conversion occurs.
  return era * 146097 + dayOfEra - 719468;
}

function parseCivilParts(value) {
  if (typeof value !== 'string') throw INVALID_INPUT();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw INVALID_INPUT();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw INVALID_INPUT();
  }

  return { year, month, day };
}

/** Validate and return a Gregorian YYYY-MM-DD civil date unchanged. */
export function validateLocalDate(value) {
  parseCivilParts(value);
  return value;
}

export function localDateDayNumber(value) {
  const { year, month, day } = parseCivilParts(value);
  return civilDayNumber(year, month, day);
}

export function getIsoWeekday(value) {
  const weekdayIndex = ((localDateDayNumber(value) + 3) % 7 + 7) % 7;
  return weekdayIndex + 1;
}

export function validatePageSize(value) {
  if (value === undefined) return READ_LIMITS.defaultPageSize;
  if (!Number.isInteger(value) || value < 1 || value > READ_LIMITS.maxPageSize) {
    throw INVALID_INPUT();
  }
  return value;
}

function validateCursor(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw INVALID_INPUT();
  }
  return value;
}

function validatePageFields(record) {
  const fields = { pageSize: validatePageSize(ownValue(record, 'pageSize')) };
  const cursor = validateCursor(ownValue(record, 'cursor'));
  if (cursor !== undefined) fields.cursor = cursor;
  return fields;
}

function validateOptionalDate(record, field) {
  const value = ownValue(record, field);
  return value === undefined ? undefined : validateLocalDate(value);
}

function validateDateRange(dateFrom, dateTo) {
  if (dateFrom === undefined || dateTo === undefined) return;
  const inclusiveDays = localDateDayNumber(dateTo) - localDateDayNumber(dateFrom) + 1;
  if (inclusiveDays < 1 || inclusiveDays > READ_LIMITS.maxInclusiveDateRangeDays) {
    throw INVALID_INPUT();
  }
}

function validateText(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw INVALID_INPUT();
  }
  if (Array.from(value).length > READ_LIMITS.maxTextCodePoints) throw INVALID_INPUT();
  return value;
}

function validateKinds(value) {
  return value === undefined ? undefined : assertUniqueEnumArray(value, DOMAIN_KINDS);
}

function validateStatuses(value, kinds) {
  if (value === undefined) return undefined;
  const statuses = assertUniqueEnumArray(value, ALL_STATUSES);
  if (kinds && statuses.some(status => !kinds.some(kind => DOMAIN_STATUSES[kind].includes(status)))) {
    throw INVALID_INPUT();
  }
  return statuses;
}

function validateRequestId(record, fields) {
  assertRecord(record, fields);
  return validateDecimalId(ownValue(record, 'itemId'));
}

export function validateGetHierarchyRequest(value) {
  assertRecord(value, REQUEST_FIELDS.getHierarchy);
  return Object.freeze({
    itemId: validateDecimalId(ownValue(value, 'itemId')),
    ...validatePageFields(value),
  });
}

export function validateGetItemByIdRequest(value) {
  return Object.freeze({ itemId: validateRequestId(value, REQUEST_FIELDS.getItemById) });
}

export function validateSearchItemsRequest(value) {
  assertRecord(value, REQUEST_FIELDS.searchItems);
  const kinds = validateKinds(ownValue(value, 'kinds'));
  const statuses = validateStatuses(ownValue(value, 'statuses'), kinds);
  const dateFrom = validateOptionalDate(value, 'dateFrom');
  const dateTo = validateOptionalDate(value, 'dateTo');
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) throw INVALID_INPUT();
  validateDateRange(dateFrom, dateTo);

  const result = {};
  const text = validateText(ownValue(value, 'text'));
  const parentId = ownValue(value, 'parentId');
  if (text !== undefined) result.text = text;
  if (kinds !== undefined) result.kinds = kinds;
  if (statuses !== undefined) result.statuses = statuses;
  if (dateFrom !== undefined) result.dateFrom = dateFrom;
  if (dateTo !== undefined) result.dateTo = dateTo;
  if (hasOwnValue(value, 'parentId')) result.parentId = validateDecimalId(parentId);
  return Object.freeze({ ...result, ...validatePageFields(value) });
}

function validateDatedPageRequest(value, allowedFields, dateField) {
  assertRecord(value, allowedFields);
  const date = validateLocalDate(ownValue(value, dateField));
  const result = { [dateField]: date, ...validatePageFields(value) };
  return Object.freeze(result);
}

export function validateGetDailyScheduleRequest(value) {
  return validateDatedPageRequest(value, REQUEST_FIELDS.getDailySchedule, 'date');
}

export function validateGetWeeklyAllocationRequest(value) {
  const result = validateDatedPageRequest(value, REQUEST_FIELDS.getWeeklyAllocation, 'weekStart');
  if (getIsoWeekday(result.weekStart) !== 1) throw INVALID_INPUT();
  return result;
}

export function validateGetRoutineTemplatesRequest(value) {
  return validateDatedPageRequest(value, REQUEST_FIELDS.getRoutineTemplates, 'date');
}

function validateLocalTime(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string'
    || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(value)) {
    throw INVALID_INPUT();
  }
  return value;
}

function validateSourceRefForKinds(value, allowedKinds) {
  assertRecord(value, ['kind', 'id']);
  const kind = ownValue(value, 'kind');
  if (typeof kind !== 'string' || !allowedKinds.includes(kind)) throw INVALID_INPUT();
  return Object.freeze({ kind, id: validateDecimalId(ownValue(value, 'id')) });
}

export function validateSourceRef(value) {
  return validateSourceRefForKinds(value, SOURCE_REF_KINDS);
}

export function validateDomainItem(value) {
  const fields = [
    'id', 'name', 'kind', 'parentId', 'status', 'statusSource',
    'executionDate', 'startTime', 'endTime', 'sourceRef', 'displayNumber',
  ];
  assertRecord(value, fields);

  const id = validateDecimalId(ownValue(value, 'id'));
  const kind = ownValue(value, 'kind');
  if (!DOMAIN_KINDS.includes(kind)) throw INVALID_INPUT();

  const name = ownValue(value, 'name');
  if (typeof name !== 'string' || name.trim().length === 0) throw INVALID_INPUT();

  const parentId = ownValue(value, 'parentId');
  if (kind === 'demand' && parentId !== null) throw INVALID_INPUT();
  if (kind !== 'demand' && parentId === null) throw INVALID_INPUT();
  const normalizedParentId = parentId === null ? null : validateDecimalId(parentId);

  const status = ownValue(value, 'status');
  if (!DOMAIN_STATUSES[kind].includes(status)) throw INVALID_INPUT();
  const statusSource = ownValue(value, 'statusSource');
  const expectedSource = kind === 'subtask' ? 'stored' : 'derived';
  if (statusSource !== expectedSource) throw INVALID_INPUT();

  const executionDate = ownValue(value, 'executionDate');
  if (executionDate !== null) validateLocalDate(executionDate);
  const startTime = validateLocalTime(ownValue(value, 'startTime'), true);
  const endTime = validateLocalTime(ownValue(value, 'endTime'), true);
  const sourceRef = validateSourceRef(ownValue(value, 'sourceRef'));
  if (sourceRef.kind !== kind || sourceRef.id !== id) throw INVALID_INPUT();

  let displayNumber;
  if (hasOwnValue(value, 'displayNumber')) {
    const raw = ownValue(value, 'displayNumber');
    assertRecord(raw, ['value', 'displayOnly']);
    const displayValue = ownValue(raw, 'value');
    if (!(typeof displayValue === 'string' && displayValue.length > 0)
      && !(Number.isSafeInteger(displayValue) && displayValue >= 0)) {
      throw INVALID_INPUT();
    }
    if (ownValue(raw, 'displayOnly') !== true) throw INVALID_INPUT();
    displayNumber = Object.freeze({ value: displayValue, displayOnly: true });
  }

  const result = {
    id,
    name,
    kind,
    parentId: normalizedParentId,
    status,
    statusSource,
    executionDate,
    startTime,
    endTime,
    sourceRef,
  };
  if (displayNumber !== undefined) result.displayNumber = displayNumber;
  return Object.freeze(result);
}

function validateIsoWeekdays(value) {
  if (!Array.isArray(value) || value.length === 0) throw INVALID_INPUT();
  if (value.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw INVALID_INPUT();
  if (new Set(value).size !== value.length) throw INVALID_INPUT();
  return Object.freeze([...value].sort((a, b) => a - b));
}

export function validateRoutineTemplate(value) {
  const fields = [
    'templateId', 'name', 'weekdaysISO', 'activeFrom', 'activeTo',
    'startTime', 'endTime', 'sourceRef',
  ];
  assertRecord(value, fields);

  const templateId = validateDecimalId(ownValue(value, 'templateId'));
  const name = ownValue(value, 'name');
  if (typeof name !== 'string' || name.trim().length === 0) throw INVALID_INPUT();
  const weekdaysISO = validateIsoWeekdays(ownValue(value, 'weekdaysISO'));
  const activeFrom = validateLocalDate(ownValue(value, 'activeFrom'));
  const activeTo = validateLocalDate(ownValue(value, 'activeTo'));
  if (activeFrom > activeTo) throw INVALID_INPUT();
  const startTime = validateLocalTime(ownValue(value, 'startTime'));
  const endTimeValue = ownValue(value, 'endTime');
  const endTime = endTimeValue === null ? null : validateLocalTime(endTimeValue);
  const sourceRef = validateSourceRefForKinds(ownValue(value, 'sourceRef'), [ROUTINE_TEMPLATE_KIND]);
  if (sourceRef.id !== templateId) throw INVALID_INPUT();

  return Object.freeze({
    templateId,
    name,
    weekdaysISO,
    activeFrom,
    activeTo,
    startTime,
    endTime,
    sourceRef,
  });
}

function validateReadTimestamp(value) {
  if (typeof value !== 'string') throw INVALID_INPUT();
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw INVALID_INPUT();
  validateLocalDate(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[5] === undefined ? 0 : Number(match[5]);
  const offsetMinute = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59) {
    throw INVALID_INPUT();
  }
  if (offsetHour === 14 && offsetMinute !== 0) throw INVALID_INPUT();
  if (!Number.isFinite(Date.parse(value))) throw INVALID_INPUT();
  return value;
}

export function validateQueryMetadata(value) {
  const fields = ['source', 'resultState', 'completeness', 'freshness', 'readAt', 'nextCursor'];
  assertRecord(value, fields);

  const source = ownValue(value, 'source');
  if (source !== 'relational') throw INVALID_INPUT();
  const resultState = ownValue(value, 'resultState');
  if (!QUERY_RESULT_STATES.includes(resultState)) throw INVALID_INPUT();
  const completeness = ownValue(value, 'completeness');
  if (!QUERY_COMPLETENESS.includes(completeness)) throw INVALID_INPUT();
  const freshness = ownValue(value, 'freshness');
  if (!QUERY_FRESHNESS.includes(freshness)) throw INVALID_INPUT();
  const readAt = validateReadTimestamp(ownValue(value, 'readAt'));
  const nextCursor = ownValue(value, 'nextCursor');

  if (completeness === 'truncated') {
    if (typeof nextCursor !== 'string' || nextCursor.length === 0) throw INVALID_INPUT();
  } else if (nextCursor !== undefined && nextCursor !== null) {
    throw INVALID_INPUT();
  }

  return Object.freeze({
    source,
    resultState,
    completeness,
    freshness,
    readAt,
    nextCursor: nextCursor ?? null,
  });
}

export function validateQueryResult(value) {
  assertRecord(value, ['items', 'metadata']);
  const items = ownValue(value, 'items');
  if (!Array.isArray(items)) throw INVALID_INPUT();
  const metadata = validateQueryMetadata(ownValue(value, 'metadata'));
  const expectedState = items.length === 0 ? 'empty' : 'nonEmpty';
  if (metadata.resultState !== expectedState) throw INVALID_INPUT();

  return Object.freeze({ items: Object.freeze([...items]), metadata });
}

export function createQueryResult(items, {
  readAt,
  completeness = 'complete',
  freshness = 'fresh',
  nextCursor = null,
} = {}) {
  if (!Array.isArray(items)) throw INVALID_INPUT();
  return validateQueryResult({
    items,
    metadata: {
      source: 'relational',
      resultState: items.length === 0 ? 'empty' : 'nonEmpty',
      completeness,
      freshness,
      readAt,
      nextCursor,
    },
  });
}

export const SEARCH_NARROWING_REASONS = Object.freeze({
  MULTIPLE_CANDIDATES: 'multiple_candidates',
  RESULTS_TRUNCATED: 'results_truncated',
});

/** Validate the persistent reference and available parent context for a search candidate. */
export function validateSearchCandidate(value) {
  const fields = ['id', 'sourceRef', 'name', 'kind', 'parentId', 'hierarchyContext'];
  assertRecord(value, fields);

  const id = validateDecimalId(ownValue(value, 'id'));
  const sourceRef = validateSourceRef(ownValue(value, 'sourceRef'));
  const kind = ownValue(value, 'kind');
  if (!DOMAIN_KINDS.includes(kind) || sourceRef.kind !== kind || sourceRef.id !== id) throw INVALID_INPUT();
  const name = ownValue(value, 'name');
  if (typeof name !== 'string' || name.trim().length === 0) throw INVALID_INPUT();

  const parentId = ownValue(value, 'parentId');
  if (kind === 'demand' && parentId !== null) throw INVALID_INPUT();
  if (kind !== 'demand' && parentId === null) throw INVALID_INPUT();
  const normalizedParentId = parentId === null ? null : validateDecimalId(parentId);

  const rawContext = ownValue(value, 'hierarchyContext');
  if (!Array.isArray(rawContext) || rawContext.length > 2) throw INVALID_INPUT();
  const hierarchyContext = rawContext.map((entry) => {
    assertRecord(entry, ['sourceRef', 'name']);
    const contextRef = validateSourceRef(ownValue(entry, 'sourceRef'));
    if (!DOMAIN_KINDS.includes(contextRef.kind)) throw INVALID_INPUT();

    const contextName = ownValue(entry, 'name');
    const result = { sourceRef: contextRef };
    if (contextName !== undefined) {
      if (typeof contextName !== 'string' || contextName.trim().length === 0) throw INVALID_INPUT();
      result.name = contextName;
    }
    return Object.freeze(result);
  });

  const validContext = kind === 'demand'
    ? hierarchyContext.length === 0
    : kind === 'task'
      ? hierarchyContext.length === 1 && hierarchyContext[0].sourceRef.kind === 'demand'
      : (hierarchyContext.length === 1 && hierarchyContext[0].sourceRef.kind === 'task')
        || (hierarchyContext.length === 2
          && hierarchyContext[0].sourceRef.kind === 'demand'
          && hierarchyContext[1].sourceRef.kind === 'task');
  if (!validContext) throw INVALID_INPUT();

  const immediateParent = hierarchyContext.at(-1)?.sourceRef;
  if (normalizedParentId !== null
    && (immediateParent?.id !== normalizedParentId
      || immediateParent.kind !== (kind === 'task' ? 'demand' : 'task'))) {
    throw INVALID_INPUT();
  }

  const contextIds = hierarchyContext.map(entry => entry.sourceRef.id);
  if (new Set([...contextIds, sourceRef.id]).size !== contextIds.length + 1) throw INVALID_INPUT();

  return Object.freeze({
    id,
    sourceRef,
    name,
    kind,
    parentId: normalizedParentId,
    hierarchyContext: Object.freeze(hierarchyContext),
  });
}

/** Validate explicit narrowing metadata without ranking or selecting candidates. */
export function validateSearchResult(value) {
  assertRecord(value, [
    'items', 'metadata', 'requiresNarrowing', 'narrowingReason', 'candidates',
  ]);

  const base = validateQueryResult({
    items: ownValue(value, 'items'),
    metadata: ownValue(value, 'metadata'),
  });
  const requiresNarrowing = ownValue(value, 'requiresNarrowing');
  if (typeof requiresNarrowing !== 'boolean') throw INVALID_INPUT();

  const rawCandidates = ownValue(value, 'candidates');
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== base.items.length) throw INVALID_INPUT();
  const candidates = Object.freeze(rawCandidates.map(validateSearchCandidate));

  for (let index = 0; index < candidates.length; index += 1) {
    const item = base.items[index];
    const candidate = candidates[index];
    if (!isPlainRecord(item)
      || !isPlainRecord(ownValue(item, 'sourceRef'))
      || ownValue(item, 'id') !== candidate.id
      || ownValue(item, 'id') !== candidate.sourceRef.id
      || ownValue(item, 'kind') !== candidate.kind
      || ownValue(item, 'parentId') !== candidate.parentId) {
      throw INVALID_INPUT();
    }
  }

  const multipleCandidates = candidates.length > 1;
  const truncated = base.metadata.completeness !== 'complete';
  const expectedRequiresNarrowing = multipleCandidates || truncated;
  if (requiresNarrowing !== expectedRequiresNarrowing) throw INVALID_INPUT();

  const expectedReason = multipleCandidates
    ? SEARCH_NARROWING_REASONS.MULTIPLE_CANDIDATES
    : (truncated ? SEARCH_NARROWING_REASONS.RESULTS_TRUNCATED : undefined);
  const narrowingReason = ownValue(value, 'narrowingReason');
  if (expectedReason === undefined) {
    if (narrowingReason !== undefined) throw INVALID_INPUT();
  } else if (narrowingReason !== expectedReason) {
    throw INVALID_INPUT();
  }

  const result = {
    items: base.items,
    metadata: base.metadata,
    requiresNarrowing,
    candidates,
  };
  if (expectedReason !== undefined) result.narrowingReason = expectedReason;
  return Object.freeze(result);
}
