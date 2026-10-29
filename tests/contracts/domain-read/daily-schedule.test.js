import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailySchedule } from '../../../server/domain/read/daily-schedule.js';
import { createDomainReadFixtures } from '../../fixtures/domain-read/records.js';

const fixtures = createDomainReadFixtures({ marker: 't015-daily-synthetic' });

function withinPage(items) {
  return { items, hasMore: false, nextCursor: null };
}

test('daily schedule uses the exact civil date, includes hierarchy and local times, and preserves overlaps', async () => {
  const overlapRows = fixtures.demandas.filter((row) => fixtures.schedule.overlappingSubtaskIds.includes(row.id));
  let requestSeen;
  const byId = new Map(fixtures.demandas.map((row) => [row.id, row]));
  const repository = {
    async getDailySchedule(request) {
      requestSeen = request;
      return withinPage(overlapRows);
    },
    async getItemById(id) { return byId.get(id) ?? null; },
    async getChildren(parentId) {
      return withinPage(fixtures.demandas.filter((row) => row.raizid === parentId));
    },
  };

  const result = await getDailySchedule(repository, { date: fixtures.dates.day });
  assert.equal(requestSeen.date, fixtures.dates.day);
  assert.deepEqual(result.items.map((item) => item.id), fixtures.schedule.overlappingSubtaskIds);
  assert.deepEqual(result.items.map((item) => item.executionDate), [fixtures.dates.day, fixtures.dates.day]);
  assert.deepEqual(result.items.map((item) => [item.startTime, item.endTime]), [
    ['09:00:00', '10:00:00'],
    ['09:30:00', '10:30:00'],
  ]);
  assert.deepEqual(result.items.map((item) => item.status), ['Executando', 'Aguardando']);
  for (const item of result.items) {
    const serialized = JSON.stringify(item);
    assert.match(serialized, new RegExp(fixtures.ids.demandWithHierarchy));
    assert.match(serialized, new RegExp(fixtures.ids.taskWithSchedule));
    assert.equal(item.kind, 'subtask');
  }
  assert.ok(result.items.every((item) => item.sourceRef.id === item.id));
});
