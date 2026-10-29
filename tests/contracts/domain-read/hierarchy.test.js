import test from 'node:test';
import assert from 'node:assert/strict';
import { getHierarchy } from '../../../server/domain/read/hierarchy.js';
import { validateDomainItem } from '../../../server/domain/read/contracts.js';
import {
  createDomainReadFixtures,
} from '../../fixtures/domain-read/records.js';

const fixtures = createDomainReadFixtures({ marker: 't008-hierarchy-synthetic' });

function createRepository(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    async getItemById(id) {
      return byId.get(id) ?? null;
    },
    async getChildren(parentId, { kind } = {}) {
      const items = rows.filter((row) => row.raizid === parentId
        && (kind === undefined || ({ 1: 'demand', 2: 'task', 3: 'subtask' })[row.tipo] === kind));
      return { items, hasMore: false, nextCursor: null };
    },
  };
}

function hierarchyItems(result) {
  const items = Array.isArray(result) ? result : result?.items;
  assert.ok(Array.isArray(items), 'hierarchy returns a flat item list');
  return items;
}

test('hierarchy preserves decimal IDs, ancestor chain, parent links, and status source', async () => {
  const repository = createRepository(fixtures.demandas);
  const result = await getHierarchy(repository, fixtures.ids.overlappingSubtaskA);
  const items = hierarchyItems(result);
  const ids = items.map((item) => item.id);

  assert.deepEqual(ids, [
    fixtures.ids.demandWithHierarchy,
    fixtures.ids.taskWithSchedule,
    fixtures.ids.overlappingSubtaskA,
  ]);
  assert.ok(ids.every((id) => typeof id === 'string' && /^\d+$/.test(id)));
  assert.equal(items[0].parentId, null);
  assert.equal(items[1].parentId, fixtures.ids.demandWithHierarchy);
  assert.equal(items[2].parentId, fixtures.ids.taskWithSchedule);
  assert.equal(items[0].statusSource, 'derived');
  assert.equal(items[1].statusSource, 'derived');
  assert.equal(items[2].statusSource, 'stored');
  assert.equal(items[0].sourceRef.id, fixtures.ids.demandWithHierarchy);
  assert.equal(items[1].sourceRef.id, fixtures.ids.taskWithSchedule);
  assert.equal(items[2].sourceRef.id, fixtures.ids.overlappingSubtaskA);
});

test('a demand query includes existing descendants and keeps each persistent parent relationship', async () => {
  const repository = createRepository(fixtures.demandas);
  const items = hierarchyItems(await getHierarchy(repository, fixtures.ids.demandWithHierarchy));
  const byId = new Map(items.map((item) => [item.id, item]));

  for (const id of [
    fixtures.ids.demandWithHierarchy,
    fixtures.ids.taskWithSchedule,
    fixtures.ids.overlappingSubtaskA,
    fixtures.ids.overlappingSubtaskB,
    fixtures.ids.completedTask,
    fixtures.ids.completedSubtask,
  ]) {
    assert.ok(byId.has(id), `hierarchy includes ${id}`);
  }
  assert.equal(byId.get(fixtures.ids.taskWithSchedule).parentId, fixtures.ids.demandWithHierarchy);
  assert.equal(byId.get(fixtures.ids.completedTask).parentId, fixtures.ids.demandWithHierarchy);
  assert.equal(byId.get(fixtures.ids.overlappingSubtaskA).parentId, fixtures.ids.taskWithSchedule);
  assert.equal(byId.get(fixtures.ids.completedSubtask).parentId, fixtures.ids.completedTask);
});

test('display numbering remains explicitly display-only and cannot replace a persistent ID', () => {
  const item = validateDomainItem({
    id: fixtures.ids.overlappingSubtaskA,
    name: 'Synthetic child',
    kind: 'subtask',
    parentId: fixtures.ids.taskWithSchedule,
    status: 'Executando',
    statusSource: 'stored',
    executionDate: fixtures.dates.day,
    startTime: '09:00:00',
    endTime: '10:00:00',
    sourceRef: { kind: 'subtask', id: fixtures.ids.overlappingSubtaskA },
    displayNumber: { value: '1.1', displayOnly: true },
  });

  assert.equal(item.id, fixtures.ids.overlappingSubtaskA);
  assert.deepEqual(item.displayNumber, { value: '1.1', displayOnly: true });
  assert.throws(() => validateDomainItem({
    ...item,
    displayNumber: { value: '1.1', displayOnly: false },
  }), { code: 'INVALID_INPUT' });
});
