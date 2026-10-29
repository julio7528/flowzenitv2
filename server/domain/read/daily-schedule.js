import {
  createQueryResult,
  validateGetDailyScheduleRequest,
} from './contracts.js';
import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
} from './errors.js';
import { getHierarchy } from './hierarchy.js';
import { mapReadRowToDomainItem } from './lookup.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function error(code) {
  return new DomainReadError(code);
}

function assertPage(page) {
  if (!isRecord(page)
    || !Array.isArray(page.items)
    || typeof page.hasMore !== 'boolean') {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }

  if (page.hasMore) {
    if (typeof page.nextCursor !== 'string' || page.nextCursor.length === 0) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
  } else if (page.nextCursor !== null && page.nextCursor !== undefined) {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
}

async function readHierarchyContext(repository, itemId) {
  try {
    const result = await getHierarchy(repository, itemId);
    const ancestors = result.items.filter(item => item.id !== itemId);
    if (ancestors.length !== 2
      || ancestors[0].kind !== 'demand'
      || ancestors[1].kind !== 'task') {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
    return Object.freeze(ancestors);
  } catch (cause) {
    if (cause instanceof DomainReadError
      && cause.code !== DOMAIN_READ_ERROR_CODES.NOT_FOUND) {
      throw cause;
    }
    // A schedule row whose parent chain disappeared or is incomplete is an
    // internal consistency failure, not a public lookup miss.
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
}

/** Return scheduled subtasks for one civil date, preserving overlaps. */
export async function getDailySchedule(repository, input) {
  const request = validateGetDailyScheduleRequest(input);
  if (!isRecord(repository) || typeof repository.getDailySchedule !== 'function') {
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  let page;
  try {
    page = await repository.getDailySchedule(request);
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  assertPage(page);
  const items = [];
  for (const row of page.items) {
    const item = mapReadRowToDomainItem(row);
    if (item.kind !== 'subtask'
      || item.executionDate !== request.date
      || item.startTime === null
      || item.endTime === null) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }

    const hierarchy = await readHierarchyContext(repository, item.id);
    items.push(Object.freeze({ ...item, hierarchy }));
  }

  return createQueryResult(items, {
    readAt: new Date().toISOString(),
    completeness: page.hasMore ? 'truncated' : 'complete',
    freshness: 'fresh',
    nextCursor: page.hasMore ? page.nextCursor : null,
  });
}
