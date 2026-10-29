import {
  DOMAIN_KINDS,
  DOMAIN_STATUSES,
  READ_LIMITS,
  getIsoWeekday,
  validateDecimalId,
  validateGetDailyScheduleRequest,
  validateGetRoutineTemplatesRequest,
  validateGetWeeklyAllocationRequest,
  validatePageSize,
  validateSearchItemsRequest,
  validateLocalDate,
} from './contracts.js';
import { DOMAIN_READ_ERROR_CODES, DomainReadError } from './errors.js';
import { paginateReadQuery } from './pagination.js';

const DEMAND_TABLE = 'demandas';
const ROUTINE_TABLE = 'recorrente';
const DEMAND_PROJECTION = 'id::text,demanda,tipo,raizid::text,status,data_exec,hora_inicio,hora_fim';
const ROUTINE_PROJECTION = 'id::text,demanda,hora,hora_fim,dias_semana,data_inicial,data_final';
const TYPE_ID_BY_KIND = Object.freeze({ demand: 1, task: 2, subtask: 3 });
const KIND_BY_TYPE_ID = Object.freeze({ 1: 'demand', 2: 'task', 3: 'subtask' });
const READ_ORDERING = Object.freeze({
  hierarchy: 'hierarchy',
  search: 'search',
  dailySchedule: 'dailySchedule',
  weeklyAllocation: 'weeklyAllocation',
  routineTemplates: 'routineTemplates',
});

function invalidInput() {
  return new DomainReadError(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
}

function internalError() {
  return new DomainReadError(DOMAIN_READ_ERROR_CODES.INTERNAL);
}

function dependencyUnavailable() {
  return new DomainReadError(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainRecord(value) {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(record, field) {
  const descriptor = Object.getOwnPropertyDescriptor(record, field);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function normalizeDatabaseId(value) {
  try {
    // The projection casts bigint to text. Reject a numeric value because its
    // precision could already have been lost before this boundary.
    return validateDecimalId(value);
  } catch {
    throw internalError();
  }
}

function normalizeNullableDatabaseId(value) {
  return value === null ? null : normalizeDatabaseId(value);
}

function normalizeDemandRow(row) {
  if (!isRecord(row)) throw internalError();

  const kind = KIND_BY_TYPE_ID[row.tipo];
  if (!kind || typeof row.demanda !== 'string') throw internalError();
  if (typeof row.status !== 'string' || !DOMAIN_STATUSES[kind].includes(row.status)) {
    throw internalError();
  }

  const executionDate = row.data_exec === null ? null : row.data_exec;
  if (executionDate !== null) {
    try {
      // Keep PostgreSQL `date` as its original civil string; never create a Date.
      validateLocalDate(executionDate);
    } catch {
      throw internalError();
    }
  }

  for (const field of ['hora_inicio', 'hora_fim']) {
    if (row[field] !== null && typeof row[field] !== 'string') throw internalError();
  }

  // Return only columns in the fixed projection. Never pass through a payload
  // containing unselected or unexpected fields.
  return Object.freeze({
    id: normalizeDatabaseId(row.id),
    demanda: row.demanda,
    tipo: row.tipo,
    raizid: normalizeNullableDatabaseId(row.raizid),
    status: row.status,
    data_exec: executionDate,
    hora_inicio: row.hora_inicio,
    hora_fim: row.hora_fim,
  });
}

function normalizeRoutineRow(row) {
  if (!isRecord(row)) throw internalError();
  if (typeof row.demanda !== 'string' || !Array.isArray(row.dias_semana)) {
    throw internalError();
  }

  try {
    validateLocalDate(row.data_inicial);
    validateLocalDate(row.data_final);
  } catch {
    throw internalError();
  }

  if (typeof row.hora !== 'string'
    || (row.hora_fim !== null && typeof row.hora_fim !== 'string')
    || row.dias_semana.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw internalError();
  }

  return Object.freeze({
    id: normalizeDatabaseId(row.id),
    demanda: row.demanda,
    hora: row.hora,
    hora_fim: row.hora_fim,
    dias_semana: Object.freeze([...row.dias_semana]),
    data_inicial: row.data_inicial,
    data_final: row.data_final,
  });
}

function mapPage(page, mapper) {
  let items;
  try {
    items = page.items.map(mapper);
  } catch (error) {
    if (error instanceof DomainReadError) throw error;
    throw internalError();
  }

  return Object.freeze({
    items: Object.freeze(items),
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
  });
}

function validatePageRequest(options = {}, allowedFields = ['pageSize', 'cursor']) {
  if (!isPlainRecord(options) || Object.getOwnPropertySymbols(options).length > 0) {
    throw invalidInput();
  }
  for (const key of Object.keys(options)) {
    if (!allowedFields.includes(key)) throw invalidInput();
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw invalidInput();
  }

  const pageSize = validatePageSize(ownValue(options, 'pageSize'));
  const cursor = ownValue(options, 'cursor');
  if (cursor !== undefined && typeof cursor !== 'string') throw invalidInput();
  return Object.freeze({ pageSize, cursor });
}

function addCivilDays(value, count) {
  const [year, month, day] = value.split('-').map(Number);
  // setUTCFullYear avoids Date.UTC's special handling of years 0 through 99.
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day + count);

  const nextYear = String(date.getUTCFullYear()).padStart(4, '0');
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

async function executeSingle(query) {
  let result;
  try {
    result = await query;
  } catch {
    throw dependencyUnavailable();
  }

  if (!isRecord(result)) throw internalError();
  if (result.error !== null && result.error !== undefined) throw dependencyUnavailable();
  if (!Array.isArray(result.data)) throw internalError();
  return result.data;
}

function buildSearchQuery(client, request) {
  let query = client.from(DEMAND_TABLE).select(DEMAND_PROJECTION);

  if (request.kinds !== undefined) {
    query = query.in('tipo', request.kinds.map(kind => TYPE_ID_BY_KIND[kind]));
  }
  if (request.statuses !== undefined) query = query.in('status', request.statuses);
  if (request.parentId !== undefined) query = query.eq('raizid', request.parentId);
  if (request.dateFrom !== undefined) query = query.gte('data_exec', request.dateFrom);
  if (request.dateTo !== undefined) query = query.lte('data_exec', request.dateTo);
  if (request.text !== undefined) {
    // PostgreSQL's default LIKE escape is backslash. Escape user pattern
    // metacharacters before adding the only wildcards, which represent the
    // approved substring search behavior.
    const literal = request.text.replace(/[\\%_]/g, '\\$&');
    query = query.ilike('demanda', `%${literal}%`);
  }

  return query;
}

function validateClient(client) {
  if (!isRecord(client) || typeof client.from !== 'function') {
    throw dependencyUnavailable();
  }
  return client;
}

/**
 * Build a fixed-projection, read-only repository around an injected server
 * client. This module never creates clients, reads credentials, or opens the
 * SPEC-001 access gate. Agent services must call the fail-closed gate first;
 * direct repository access is reserved for synthetic contract tests.
 */
export function createReadRepository(injectedClient) {
  const client = validateClient(injectedClient);

  async function readPage(query, { pageSize, cursor }, filters, ordering, mapper) {
    const page = await paginateReadQuery(query, {
      pageSize,
      cursor,
      filters,
      ordering,
    });
    return mapPage(page, mapper);
  }

  return Object.freeze({
    async getItemById(itemId) {
      const id = validateDecimalId(itemId);
      let query;
      try {
        query = client.from(DEMAND_TABLE)
          .select(DEMAND_PROJECTION)
          .eq('id', id)
          .limit(1);
      } catch {
        throw dependencyUnavailable();
      }

      const rows = await executeSingle(query);
      if (rows.length === 0) return null;
      if (rows.length !== 1) throw internalError();
      return normalizeDemandRow(rows[0]);
    },

    async getChildren(parentId, options = {}) {
      const id = validateDecimalId(parentId);
      const pageRequest = validatePageRequest(options, ['pageSize', 'cursor', 'kind']);
      const requestedKind = ownValue(options, 'kind');
      let kindId;
      if (requestedKind !== undefined) {
        if (!DOMAIN_KINDS.includes(requestedKind) || requestedKind === 'demand') {
          throw invalidInput();
        }
        kindId = TYPE_ID_BY_KIND[requestedKind];
      }

      let query;
      try {
        query = client.from(DEMAND_TABLE)
          .select(DEMAND_PROJECTION)
          .eq('raizid', id);
        if (kindId !== undefined) query = query.eq('tipo', kindId);
        else query = query.in('tipo', [2, 3]);
      } catch {
        throw dependencyUnavailable();
      }

      return readPage(
        query,
        pageRequest,
        { operation: 'getChildren', parentId: id, kind: requestedKind ?? null },
        READ_ORDERING.hierarchy,
        normalizeDemandRow,
      );
    },

    async searchItems(input) {
      const request = validateSearchItemsRequest(input);
      let query;
      try {
        query = buildSearchQuery(client, request);
      } catch (error) {
        if (error instanceof DomainReadError) throw error;
        throw dependencyUnavailable();
      }

      const { pageSize, cursor } = request;
      return readPage(
        query,
        { pageSize, cursor },
        { operation: 'searchItems', ...request },
        READ_ORDERING.search,
        normalizeDemandRow,
      );
    },

    async getDailySchedule(input) {
      const request = validateGetDailyScheduleRequest(input);
      let query;
      try {
        query = client.from(DEMAND_TABLE)
          .select(DEMAND_PROJECTION)
          .eq('tipo', TYPE_ID_BY_KIND.subtask)
          .eq('data_exec', request.date);
      } catch {
        throw dependencyUnavailable();
      }

      return readPage(
        query,
        request,
        { operation: 'getDailySchedule', date: request.date },
        READ_ORDERING.dailySchedule,
        normalizeDemandRow,
      );
    },

    async getWeeklyAllocation(input) {
      const request = validateGetWeeklyAllocationRequest(input);
      const nextWeekStart = addCivilDays(request.weekStart, 7);
      let query;
      try {
        query = client.from(DEMAND_TABLE)
          .select(DEMAND_PROJECTION)
          .in('tipo', [TYPE_ID_BY_KIND.demand, TYPE_ID_BY_KIND.task])
          // The only disjunction is fixed and both interpolated values are
          // validated LocalDate strings, never model-supplied filter syntax.
          .or(`data_exec.is.null,and(data_exec.gte.${request.weekStart},data_exec.lt.${nextWeekStart})`);
      } catch {
        throw dependencyUnavailable();
      }

      return readPage(
        query,
        request,
        { operation: 'getWeeklyAllocation', weekStart: request.weekStart },
        READ_ORDERING.weeklyAllocation,
        normalizeDemandRow,
      );
    },

    async getRoutineTemplates(input) {
      const request = validateGetRoutineTemplatesRequest(input);
      const weekday = getIsoWeekday(request.date);
      let query;
      try {
        query = client.from(ROUTINE_TABLE)
          .select(ROUTINE_PROJECTION)
          .lte('data_inicial', request.date)
          .gte('data_final', request.date)
          .contains('dias_semana', [weekday]);
      } catch {
        throw dependencyUnavailable();
      }

      return readPage(
        query,
        request,
        { operation: 'getRoutineTemplates', date: request.date, weekday },
        READ_ORDERING.routineTemplates,
        normalizeRoutineRow,
      );
    },
  });
}

export const READ_REPOSITORY_LIMITS = Object.freeze({
  defaultPageSize: READ_LIMITS.defaultPageSize,
  maxPageSize: READ_LIMITS.maxPageSize,
});
