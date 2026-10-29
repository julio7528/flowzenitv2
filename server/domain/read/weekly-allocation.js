import {
  createQueryResult,
  localDateDayNumber,
  validateGetWeeklyAllocationRequest,
} from './contracts.js';
import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
} from './errors.js';
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

async function demandHasTasks(repository, demandId) {
  let children;
  try {
    children = await repository.getChildren(demandId, { kind: 'task', pageSize: 1 });
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  assertPage(children);
  if (children.items.length > 0) return true;
  if (children.hasMore) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  return false;
}

/**
 * Return only scheduled demand/task cards in `items`; undated cards are
 * returned separately in `backlog`. Subtasks are never weekly cards.
 */
export async function getWeeklyAllocation(repository, input) {
  const request = validateGetWeeklyAllocationRequest(input);
  if (!isRecord(repository)
    || typeof repository.getWeeklyAllocation !== 'function'
    || typeof repository.getChildren !== 'function') {
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  let page;
  try {
    page = await repository.getWeeklyAllocation(request);
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  assertPage(page);
  const scheduled = [];
  const backlog = [];
  const weekStartDay = localDateDayNumber(request.weekStart);

  for (const row of page.items) {
    const item = mapReadRowToDomainItem(row);
    if (item.kind === 'subtask') continue;
    if (item.executionDate !== null) {
      const dayDifference = localDateDayNumber(item.executionDate) - weekStartDay;
      if (dayDifference < 0 || dayDifference > 6) {
        throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
      }
    }

    if (item.kind === 'demand' && await demandHasTasks(repository, item.id)) continue;
    (item.executionDate === null ? backlog : scheduled).push(item);
  }

  const combined = [...scheduled, ...backlog];
  const result = createQueryResult(combined, {
    readAt: new Date().toISOString(),
    completeness: page.hasMore ? 'truncated' : 'complete',
    freshness: 'fresh',
    nextCursor: page.hasMore ? page.nextCursor : null,
  });

  return Object.freeze({
    items: Object.freeze(scheduled),
    backlog: Object.freeze(backlog),
    metadata: result.metadata,
  });
}
