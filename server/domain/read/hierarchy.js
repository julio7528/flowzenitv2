import {
  DOMAIN_KINDS,
  READ_LIMITS,
  createQueryResult,
  validateGetHierarchyRequest,
} from './contracts.js';
import {
  decodeHierarchyCursor,
  encodeHierarchyCursor,
} from './pagination.js';
import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
} from './errors.js';
import { mapReadRowToDomainItem } from './lookup.js';

const DECIMAL_ID = /^\d+$/;
const MAX_CURSOR_FIELD_LENGTH = 16_384;
const HIERARCHY_STATE_FIELDS = Object.freeze([
  'mode',
  'taskCursor',
  'taskQueue',
  'currentTaskId',
  'subtaskCursor',
  'pendingSubtaskId',
  'pendingSubtaskFinal',
  'tasksComplete',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function error(code) {
  return new DomainReadError(code);
}

function getCursorSecret(options) {
  const prototype = isRecord(options) ? Object.getPrototypeOf(options) : undefined;
  if (!isRecord(options)
    || (prototype !== Object.prototype && prototype !== null)
    || Object.getOwnPropertySymbols(options).length > 0) {
    throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
  }
  for (const key of Object.keys(options)) {
    if (key !== 'cursorSecret') throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, 'cursorSecret');
  return descriptor?.value;
}

function isDecimalId(value) {
  return typeof value === 'string' && DECIMAL_ID.test(value);
}

function isCursorValue(value) {
  return value === null
    || (typeof value === 'string' && value.length > 0 && value.length <= MAX_CURSOR_FIELD_LENGTH);
}

function clearCurrentTask(state) {
  state.currentTaskId = null;
  state.subtaskCursor = null;
  state.pendingSubtaskId = null;
  state.pendingSubtaskFinal = false;
}

function initialState(target) {
  if (target.kind === 'demand') {
    return {
      mode: 'demand',
      taskCursor: null,
      taskQueue: [],
      currentTaskId: null,
      subtaskCursor: null,
      pendingSubtaskId: null,
      pendingSubtaskFinal: false,
      tasksComplete: false,
    };
  }

  if (target.kind === 'task') {
    return {
      mode: 'task',
      taskCursor: null,
      taskQueue: [],
      currentTaskId: target.id,
      subtaskCursor: null,
      pendingSubtaskId: null,
      pendingSubtaskFinal: false,
      tasksComplete: true,
    };
  }

  return null;
}

function validateCursorState(value, target) {
  if (!isRecord(value)
    || Object.keys(value).sort().join(',') !== [...HIERARCHY_STATE_FIELDS].sort().join(',')
    || value.mode !== target.kind
    || !isCursorValue(value.taskCursor)
    || !Array.isArray(value.taskQueue)
    || value.taskQueue.length > READ_LIMITS.maxPageSize
    || !value.taskQueue.every(isDecimalId)
    || !isCursorValue(value.subtaskCursor)
    || (value.currentTaskId !== null && !isDecimalId(value.currentTaskId))
    || (value.pendingSubtaskId !== null && !isDecimalId(value.pendingSubtaskId))
    || typeof value.pendingSubtaskFinal !== 'boolean'
    || typeof value.tasksComplete !== 'boolean') {
    throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
  }

  if (new Set(value.taskQueue).size !== value.taskQueue.length
    || (value.currentTaskId !== null && value.taskQueue.includes(value.currentTaskId))
    || (value.tasksComplete && value.taskCursor !== null)
    || (value.currentTaskId === null
      && (value.subtaskCursor !== null
        || value.pendingSubtaskId !== null
        || value.pendingSubtaskFinal))
    || (value.pendingSubtaskId === null && value.pendingSubtaskFinal)
    || (value.pendingSubtaskId !== null && value.currentTaskId === null)) {
    throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
  }

  if (target.kind === 'task') {
    if (value.taskCursor !== null
      || value.taskQueue.length !== 0
      || !value.tasksComplete
      || (value.currentTaskId !== null && value.currentTaskId !== target.id)) {
      throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
    }
  } else if (target.kind === 'demand') {
    if (value.taskQueue.includes(target.id) || value.currentTaskId === target.id) {
      throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
    }
  } else {
    throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
  }

  return {
    mode: value.mode,
    taskCursor: value.taskCursor,
    taskQueue: [...value.taskQueue],
    currentTaskId: value.currentTaskId,
    subtaskCursor: value.subtaskCursor,
    pendingSubtaskId: value.pendingSubtaskId,
    pendingSubtaskFinal: value.pendingSubtaskFinal,
    tasksComplete: value.tasksComplete,
  };
}

function assertPage(page, pageSize) {
  if (!isRecord(page)
    || !Array.isArray(page.items)
    || typeof page.hasMore !== 'boolean'
    || page.items.length > pageSize) {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }

  if (page.hasMore) {
    if (typeof page.nextCursor !== 'string'
      || page.nextCursor.length === 0
      || page.items.length === 0) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
  } else if (page.nextCursor !== null && page.nextCursor !== undefined) {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
}

async function readItem(repository, itemId) {
  let row;
  try {
    row = await repository.getItemById(itemId);
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }
  return row === null || row === undefined ? null : mapReadRowToDomainItem(row);
}

async function readChildrenPage(repository, parentId, kind, options) {
  let page;
  try {
    page = await repository.getChildren(parentId, {
      kind,
      pageSize: options.pageSize,
      ...(options.cursor === null ? {} : { cursor: options.cursor }),
    });
  } catch (cause) {
    if (cause instanceof DomainReadError) throw cause;
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  assertPage(page, options.pageSize);
  const items = page.items.map(mapReadRowToDomainItem);
  if (items.some(item => item.parentId !== parentId || item.kind !== kind)) {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
  return { items, hasMore: page.hasMore, nextCursor: page.nextCursor ?? null };
}

function expectedParentKind(kind) {
  if (kind === 'task') return 'demand';
  if (kind === 'subtask') return 'task';
  return null;
}

function assertCursorProgress(seen, scope, currentCursor, nextCursor) {
  const key = `${scope}\u0000${nextCursor}`;
  if (nextCursor === currentCursor || seen.has(key)) {
    throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
  }
  seen.add(key);
}

async function readDescendantPage(repository, target, pageSize, state, contextIds) {
  const descendants = [];
  const seenIds = new Set(contextIds);
  const knownTasks = new Map();
  const seenTaskCursors = new Set();
  const seenSubtaskCursors = new Set();
  const validatedTaskIds = new Set();

  function append(item) {
    if (seenIds.has(item.id)) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    seenIds.add(item.id);
    descendants.push(item);
  }

  async function validateCurrentTask() {
    if (state.currentTaskId === null
      || target.kind === 'task'
      || validatedTaskIds.has(state.currentTaskId)) return true;

    const task = knownTasks.get(state.currentTaskId)
      ?? await readItem(repository, state.currentTaskId);
    if (task === null) {
      clearCurrentTask(state);
      return false;
    }
    if (task.kind !== 'task' || task.parentId !== target.id) {
      throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
    }
    validatedTaskIds.add(task.id);
    return true;
  }

  while (true) {
    if (state.pendingSubtaskId !== null) {
      if (!await validateCurrentTask()) continue;
      if (descendants.length >= pageSize) {
        return { descendants, hasMore: true };
      }

      const pending = await readItem(repository, state.pendingSubtaskId);
      if (pending === null
        || pending.kind !== 'subtask'
        || pending.parentId !== state.currentTaskId) {
        throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
      }
      append(pending);
      const pendingWasFinal = state.pendingSubtaskFinal;
      state.pendingSubtaskId = null;
      state.pendingSubtaskFinal = false;
      if (pendingWasFinal) clearCurrentTask(state);
      continue;
    }

    if (state.currentTaskId !== null) {
      if (!await validateCurrentTask()) continue;

      const remaining = pageSize - descendants.length;
      const queryPageSize = Math.max(1, remaining);
      const cursorBefore = state.subtaskCursor;
      const page = await readChildrenPage(repository, state.currentTaskId, 'subtask', {
        pageSize: queryPageSize,
        cursor: cursorBefore,
      });

      if (page.items.length === 0) {
        clearCurrentTask(state);
        continue;
      }

      if (remaining === 0) {
        const [pending] = page.items;
        state.pendingSubtaskId = pending.id;
        state.pendingSubtaskFinal = !page.hasMore;
        if (page.hasMore) {
          assertCursorProgress(
            seenSubtaskCursors,
            state.currentTaskId,
            cursorBefore,
            page.nextCursor,
          );
          state.subtaskCursor = page.nextCursor;
        } else {
          state.subtaskCursor = null;
        }
        return { descendants, hasMore: true };
      }

      for (const item of page.items) append(item);
      if (page.hasMore) {
        assertCursorProgress(
          seenSubtaskCursors,
          state.currentTaskId,
          cursorBefore,
          page.nextCursor,
        );
        state.subtaskCursor = page.nextCursor;
        if (descendants.length >= pageSize) {
          return { descendants, hasMore: true };
        }
      } else {
        clearCurrentTask(state);
      }
      continue;
    }

    if (state.taskQueue.length > 0) {
      const taskId = state.taskQueue.shift();
      if (target.kind === 'task') {
        state.currentTaskId = target.id;
      } else {
        const task = knownTasks.get(taskId) ?? await readItem(repository, taskId);
        if (task === null) continue;
        if (task.kind !== 'task' || task.parentId !== target.id) {
          throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
        }
        validatedTaskIds.add(task.id);
        state.currentTaskId = task.id;
      }
      state.subtaskCursor = null;
      continue;
    }

    if (target.kind === 'task') {
      return { descendants, hasMore: false };
    }
    if (state.tasksComplete) {
      return { descendants, hasMore: false };
    }
    if (descendants.length >= pageSize && state.taskCursor !== null) {
      return { descendants, hasMore: true };
    }

    const remaining = pageSize - descendants.length;
    const queryPageSize = Math.min(
      READ_LIMITS.maxPageSize,
      Math.max(1, remaining),
    );
    const cursorBefore = state.taskCursor;
    const page = await readChildrenPage(repository, target.id, 'task', {
      pageSize: queryPageSize,
      cursor: cursorBefore,
    });

    for (const task of page.items) {
      knownTasks.set(task.id, task);
      state.taskQueue.push(task.id);
      append(task);
    }
    if (page.hasMore) {
      assertCursorProgress(seenTaskCursors, target.id, cursorBefore, page.nextCursor);
      state.taskCursor = page.nextCursor;
    } else {
      state.taskCursor = null;
      state.tasksComplete = true;
    }
  }
}

/**
 * Return the stored ancestor context and one bounded page of descendants.
 * The repository, request, and cursor key are server-injected dependencies;
 * callers pass only the public `{ itemId, pageSize?, cursor? }` DTO.
 */
export async function getHierarchy(repository, input, options = {}) {
  const cursorSecret = getCursorSecret(options);
  const request = validateGetHierarchyRequest(
    typeof input === 'string' ? { itemId: input } : input,
  );
  if (!isRecord(repository)
    || typeof repository.getItemById !== 'function'
    || typeof repository.getChildren !== 'function') {
    throw error(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE);
  }

  const target = await readItem(repository, request.itemId);
  if (target === null) throw error(DOMAIN_READ_ERROR_CODES.NOT_FOUND);
  if (!DOMAIN_KINDS.includes(target.kind)) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);

  const ancestors = [];
  const visitedIds = new Set([target.id]);
  let current = target;
  while (current.parentId !== null) {
    const parentId = current.parentId;
    if (visitedIds.has(parentId)) throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    visitedIds.add(parentId);

    const parent = await readItem(repository, parentId);
    if (parent === null || parent.kind !== expectedParentKind(current.kind)) {
      throw error(DOMAIN_READ_ERROR_CODES.INTERNAL);
    }
    ancestors.push(parent);
    current = parent;
  }

  if (target.kind === 'subtask' && request.cursor !== undefined) {
    throw error(DOMAIN_READ_ERROR_CODES.INVALID_INPUT);
  }

  const context = [...ancestors.reverse(), target];
  const state = request.cursor === undefined
    ? initialState(target)
    : validateCursorState(
      decodeHierarchyCursor(request.cursor, request.itemId, cursorSecret),
      target,
    );
  const pageSize = request.pageSize ?? READ_LIMITS.defaultPageSize;
  const page = target.kind === 'subtask'
    ? { descendants: [], hasMore: false }
    : await readDescendantPage(
      repository,
      target,
      pageSize,
      state,
      context.map(item => item.id),
    );
  const nextCursor = page.hasMore
    ? encodeHierarchyCursor(request.itemId, state, cursorSecret)
    : null;

  return createQueryResult([...context, ...page.descendants], {
    readAt: new Date().toISOString(),
    completeness: page.hasMore ? 'truncated' : 'complete',
    freshness: 'fresh',
    nextCursor,
  });
}
