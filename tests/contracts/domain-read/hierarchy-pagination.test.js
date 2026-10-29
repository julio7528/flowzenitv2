import test from 'node:test';
import assert from 'node:assert/strict';
import { getHierarchy } from '../../../server/domain/read/hierarchy.js';

const rootId = '9007199254743001';
const secondRootId = '9007199254743002';
const TEST_CURSOR_SECRET = new Uint8Array(32).fill(7);
const OTHER_CURSOR_SECRET = new Uint8Array(32).fill(8);

function getHierarchyWithKey(repository, input, cursorSecret = TEST_CURSOR_SECRET) {
  return getHierarchy(repository, input, { cursorSecret });
}

function makeRow(id, name, tipo, raizid, status) {
  return {
    id,
    demanda: name,
    tipo,
    raizid,
    status,
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  };
}

function createLongHierarchy({ root = rootId, taskCount = 5, subtasksPerTask = 25 } = {}) {
  const rows = [makeRow(root, `synthetic demand ${root}`, 1, null, 'Em andamento')];
  const descendants = [];
  const firstTaskId = BigInt('9007199254743100');
  const firstSubtaskId = BigInt('9007199254744000');
  let subtaskNumber = 0;

  for (let taskNumber = 0; taskNumber < taskCount; taskNumber += 1) {
    const taskId = (firstTaskId + BigInt(taskNumber)).toString();
    const task = makeRow(taskId, `synthetic task ${taskNumber}`, 2, root, 'Em andamento');
    rows.push(task);
    descendants.push(task);

    for (let childNumber = 0; childNumber < subtasksPerTask; childNumber += 1) {
      const subtaskId = (firstSubtaskId + BigInt(subtaskNumber)).toString();
      const subtask = makeRow(
        subtaskId,
        `synthetic subtask ${subtaskNumber}`,
        3,
        taskId,
        'Executando',
      );
      rows.push(subtask);
      descendants.push(subtask);
      subtaskNumber += 1;
    }
  }

  return { rows, descendants };
}

function createRepository(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const childCursors = new Map();
  const calls = [];
  let cursorNumber = 0;

  return {
    calls,
    async getItemById(id) {
      return byId.get(id) ?? null;
    },
    async getChildren(parentId, { kind, pageSize, cursor } = {}) {
      const kindByType = { 1: 'demand', 2: 'task', 3: 'subtask' };
      const children = rows
        .filter((row) => row.raizid === parentId && kindByType[row.tipo] === kind)
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
      let offset = 0;

      if (cursor !== undefined) {
        const prior = childCursors.get(cursor);
        if (!prior || prior.parentId !== parentId || prior.kind !== kind) {
          throw new Error('Synthetic repository cursor did not match its parent and kind.');
        }
        offset = prior.offset;
      }

      const boundedSize = pageSize ?? 50;
      calls.push({ parentId, kind, pageSize: boundedSize, cursor });
      const items = children.slice(offset, offset + boundedSize);
      const hasMore = offset + boundedSize < children.length;
      let nextCursor = null;
      if (hasMore) {
        nextCursor = `repo-child-page-${++cursorNumber}`;
        childCursors.set(nextCursor, {
          parentId,
          kind,
          offset: offset + boundedSize,
        });
      }

      return { items, hasMore, nextCursor };
    },
  };
}

function itemsOf(result) {
  assert.ok(Array.isArray(result?.items), 'hierarchy result contains items');
  return result.items;
}

function descendantsOf(result, root) {
  return itemsOf(result).filter((item) => item.id !== root);
}

test('hierarchy defaults to 50 descendants and retains the root context on a truncated page', async () => {
  const { rows } = createLongHierarchy();
  const repository = createRepository(rows);

  const result = await getHierarchyWithKey(repository, { itemId: rootId });
  const descendants = descendantsOf(result, rootId);

  assert.equal(descendants.length, 50);
  assert.equal(itemsOf(result)[0].id, rootId);
  assert.ok(descendants.every((item) => typeof item.id === 'string'));
  assert.equal(result.metadata.completeness, 'truncated');
  assert.equal(typeof result.metadata.nextCursor, 'string');
});

test('hierarchy accepts at most 100 descendants per page', async () => {
  const { rows } = createLongHierarchy();
  const repository = createRepository(rows);

  const result = await getHierarchyWithKey(repository, { itemId: rootId, pageSize: 100 });
  assert.equal(descendantsOf(result, rootId).length, 100);
  assert.equal(result.metadata.completeness, 'truncated');
  await assert.rejects(
    () => getHierarchyWithKey(repository, { itemId: rootId, pageSize: 101 }),
    { code: 'INVALID_INPUT' },
  );
});

test('hierarchy repeats ancestor and target context while paging task descendants', async () => {
  const { rows } = createLongHierarchy();
  const repository = createRepository(rows);
  const taskId = '9007199254743100';
  const first = await getHierarchyWithKey(repository, { itemId: taskId, pageSize: 10 });
  const second = await getHierarchyWithKey(repository, {
    itemId: taskId,
    pageSize: 10,
    cursor: first.metadata.nextCursor,
  });

  assert.equal(first.metadata.completeness, 'truncated');
  assert.equal(second.metadata.completeness, 'truncated');
  for (const page of [first, second]) {
    assert.deepEqual(itemsOf(page).slice(0, 2).map((item) => item.id), [rootId, taskId]);
    assert.ok(itemsOf(page).slice(2).every((item) => item.kind === 'subtask'));
  }
});

test('successive hierarchy cursors cover a stable deep tree without duplicate descendants', async () => {
  const { rows, descendants } = createLongHierarchy();
  const repository = createRepository(rows);
  const observedIds = [];
  let result = await getHierarchyWithKey(repository, { itemId: rootId, pageSize: 23 });
  let pages = 0;

  while (true) {
    pages += 1;
    assert.ok(pages <= 10, 'continuation terminates for a stable finite tree');
    assert.equal(itemsOf(result)[0].id, rootId, 'root context is repeated on every page');
    observedIds.push(...descendantsOf(result, rootId).map((item) => item.id));
    if (result.metadata.completeness === 'complete') break;
    assert.equal(result.metadata.completeness, 'truncated');
    assert.equal(typeof result.metadata.nextCursor, 'string');
    assert.equal(Object.hasOwn(result.metadata, 'snapshot'), false);
    result = await getHierarchyWithKey(repository, {
      itemId: rootId,
      pageSize: 23,
      cursor: result.metadata.nextCursor,
    });
  }

  assert.equal(pages, Math.ceil(descendants.length / 23));
  assert.equal(result.metadata.nextCursor, null);
  assert.equal(new Set(observedIds).size, observedIds.length);
  assert.deepEqual(
    [...observedIds].sort(),
    descendants.map((item) => item.id).sort(),
  );
  assert.ok(repository.calls.length > pages, 'multi-level descendants are fetched from their parents');
});

test('hierarchy rejects malformed and item-mismatched cursors', async () => {
  const { rows } = createLongHierarchy();
  rows.push(makeRow(secondRootId, 'synthetic second demand', 1, null, 'Backlog'));
  rows.push(makeRow('9007199254743200', 'synthetic second task', 2, secondRootId, 'Backlog'));
  const repository = createRepository(rows);

  await assert.rejects(
    getHierarchyWithKey(repository, { itemId: rootId, cursor: 'not a valid cursor' }),
    { code: 'INVALID_INPUT' },
  );

  const firstPage = await getHierarchyWithKey(repository, { itemId: rootId, pageSize: 10 });
  assert.equal(firstPage.metadata.completeness, 'truncated');
  await assert.rejects(
    getHierarchyWithKey(repository, {
      itemId: secondRootId,
      pageSize: 10,
      cursor: firstPage.metadata.nextCursor,
    }),
    { code: 'INVALID_INPUT' },
  );
});

test('hierarchy cursors are opaque and reject tampering instead of forging completion', async () => {
  const { rows } = createLongHierarchy();
  const repository = createRepository(rows);
  const firstPage = await getHierarchyWithKey(repository, { itemId: rootId, pageSize: 10 });
  const cursor = firstPage.metadata.nextCursor;

  assert.equal(firstPage.metadata.completeness, 'truncated');
  assert.equal(typeof cursor, 'string');
  assert.doesNotMatch(cursor, /tasksComplete|taskQueue|currentTaskId|9007199254743/);

  const tamperedCursor = cursor.slice(0, -1) + (cursor.endsWith('A') ? 'B' : 'A');
  await assert.rejects(
    getHierarchyWithKey(repository, {
      itemId: rootId,
      pageSize: 10,
      cursor: tamperedCursor,
    }),
    { code: 'INVALID_INPUT' },
  );
});

test('hierarchy cursors require the same server key for continuation', async () => {
  const { rows } = createLongHierarchy();
  const repository = createRepository(rows);
  const firstPage = await getHierarchyWithKey(repository, { itemId: rootId, pageSize: 10 });

  await assert.rejects(
    getHierarchyWithKey(repository, {
      itemId: rootId,
      pageSize: 10,
      cursor: firstPage.metadata.nextCursor,
    }, OTHER_CURSOR_SECRET),
    { code: 'INVALID_INPUT' },
  );
});

test('truncated hierarchy results require a server cursor key', async () => {
  const { rows } = createLongHierarchy();
  const repository = createRepository(rows);

  await assert.rejects(
    getHierarchy(repository, { itemId: rootId, pageSize: 10 }),
    { code: 'DEPENDENCY_UNAVAILABLE' },
  );
});
