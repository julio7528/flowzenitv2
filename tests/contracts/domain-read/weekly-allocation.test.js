import test from 'node:test';
import assert from 'node:assert/strict';
import { getWeeklyAllocation } from '../../../server/domain/read/weekly-allocation.js';
import { createDomainReadFixtures } from '../../fixtures/domain-read/records.js';

const fixtures = createDomainReadFixtures({ marker: 't016-weekly-synthetic' });

function withinPage(items) {
  return { items, hasMore: false, nextCursor: null };
}

test('weekly allocation starts Monday, includes supported cards, separates backlog, and excludes subtasks', async () => {
  let requestSeen;
  const childrenByParent = new Map();
  for (const row of fixtures.demandas) {
    if (row.raizid === null) continue;
    const children = childrenByParent.get(row.raizid) ?? [];
    children.push(row);
    childrenByParent.set(row.raizid, children);
  }
  const candidateRows = fixtures.demandas.filter((row) => row.tipo !== 3
    && (row.data_exec === null
      || (row.data_exec >= fixtures.dates.weekStart && row.data_exec < fixtures.dates.nextWeekStart)));
  const repository = {
    async getWeeklyAllocation(request) {
      requestSeen = request;
      return withinPage(candidateRows);
    },
    async getChildren(parentId, { kind } = {}) {
      const children = childrenByParent.get(parentId) ?? [];
      return withinPage(kind ? children.filter((row) => ({ 1: 'demand', 2: 'task', 3: 'subtask' })[row.tipo] === kind) : children);
    },
  };

  const result = await getWeeklyAllocation(repository, { weekStart: fixtures.dates.weekStart });
  assert.equal(requestSeen.weekStart, fixtures.dates.weekStart);
  assert.deepEqual(result.items.map((item) => item.id).sort(), [
    fixtures.ids.scheduledDemandWithoutTasks,
    fixtures.ids.taskWithSchedule,
  ].sort());
  assert.deepEqual(result.backlog.map((item) => item.id), [fixtures.ids.backlogTask]);
  assert.ok([...result.items, ...result.backlog].every((item) => ['demand', 'task'].includes(item.kind)));
  assert.ok([...result.items, ...result.backlog].every((item) => item.sourceRef.id === item.id));
  assert.equal([...result.items, ...result.backlog].some((item) => item.id === fixtures.ids.completedTask), false);
  assert.equal([...result.items, ...result.backlog].some((item) => fixtures.weekly.excludedSubtaskIds.includes(item.id)), false);
});
