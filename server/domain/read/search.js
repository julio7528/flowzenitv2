import {
  createQueryResult,
  SEARCH_NARROWING_REASONS,
  validateSearchCandidate,
  validateSearchResult,
  validateSearchItemsRequest,
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

function expectedParentKind(kind) {
  if (kind === 'task') return 'demand';
  if (kind === 'subtask') return 'task';
  return null;
}

async function readParent(repository, parentId, cache) {
  if (cache.has(parentId)) return cache.get(parentId);
  const parentPromise = (async () => {
    let row;
    try {
      row = await repository.getItemById(parentId);
    } catch (cause) {
      if (cause instanceof DomainReadError) throw cause;
      throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
    }
    return row === null || row === undefined ? null : mapReadRowToDomainItem(row);
  })();
  cache.set(parentId, parentPromise);
  return parentPromise;
}

async function readHierarchyContext(repository, item, parentCache) {
  const ancestors = [];
  const visitedIds = new Set([item.id]);
  let current = item;

  while (current.parentId !== null) {
    const parentId = current.parentId;
    const parentKind = expectedParentKind(current.kind);
    if (parentKind === null || visitedIds.has(parentId)) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
    visitedIds.add(parentId);

    // A narrow repository double may expose only searchItems. In that case the
    // persistent immediate-parent reference is still useful context. The real
    // repository supplies getItemById so all ancestor names can be included.
    if (typeof repository.getItemById !== 'function') {
      ancestors.unshift({ sourceRef: { kind: parentKind, id: parentId } });
      break;
    }

    const parent = await readParent(repository, parentId, parentCache);
    if (parent === null) {
      ancestors.unshift({ sourceRef: { kind: parentKind, id: parentId } });
      break;
    }
    if (parent.id !== parentId || parent.kind !== parentKind) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }

    ancestors.unshift({ sourceRef: parent.sourceRef, name: parent.name });
    current = parent;
  }

  return ancestors;
}

/** Run structured search and preserve every matching record as a candidate. */
export async function searchItems(repository, input) {
  const request = validateSearchItemsRequest(input);
  if (!isRecord(repository) || typeof repository.searchItems !== 'function') {
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  let page;
  try {
    page = await repository.searchItems(request);
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  assertPage(page);
  const items = page.items.map(mapReadRowToDomainItem);
  const parentCache = new Map();
  const candidates = await Promise.all(items.map(async (item) => validateSearchCandidate({
    id: item.id,
    sourceRef: item.sourceRef,
    name: item.name,
    kind: item.kind,
    parentId: item.parentId,
    hierarchyContext: await readHierarchyContext(repository, item, parentCache),
  })));
  const queryResult = createQueryResult(items, {
    readAt: new Date().toISOString(),
    completeness: page.hasMore ? 'truncated' : 'complete',
    freshness: 'fresh',
    nextCursor: page.hasMore ? page.nextCursor : null,
  });

  const requiresNarrowing = items.length > 1 || page.hasMore;
  const narrowingReason = items.length > 1
    ? SEARCH_NARROWING_REASONS.MULTIPLE_CANDIDATES
    : (page.hasMore ? SEARCH_NARROWING_REASONS.RESULTS_TRUNCATED : undefined);

  return validateSearchResult({
    ...queryResult,
    requiresNarrowing,
    ...(narrowingReason === undefined ? {} : { narrowingReason }),
    candidates,
  });
}
