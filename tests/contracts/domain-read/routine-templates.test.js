import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoutineTemplates } from '../../../server/domain/read/routine-templates.js';
import { getIsoWeekday } from '../../../server/domain/read/contracts.js';
import { createDomainReadFixtures } from '../../fixtures/domain-read/records.js';

const fixtures = createDomainReadFixtures({ marker: 't021-routine-synthetic' });

function createRepository(rows) {
  return {
    async getRoutineTemplates({ date }) {
      const day = getIsoWeekday(date);
      const items = rows.filter((row) => row.data_inicial <= date
        && date <= row.data_final
        && row.dias_semana.includes(day));
      return { items, hasMore: false, nextCursor: null };
    },
  };
}

test('routine lookup matches ISO weekday and inclusive active-range boundaries without inventing occurrence IDs', async () => {
  const repository = createRepository(fixtures.recorrente);
  const onFirstBoundary = await getRoutineTemplates(repository, { date: '2026-10-30' });
  const idsOnStart = onFirstBoundary.items.map((item) => item.templateId);
  assert.deepEqual(idsOnStart.sort(), [fixtures.ids.routineOptionalEnd, fixtures.ids.routineWeekdays].sort());

  const onEndBoundary = await getRoutineTemplates(repository, { date: '2026-11-06' });
  assert.ok(onEndBoundary.items.some((item) => item.templateId === fixtures.ids.routineOptionalEnd));
  const optionalEnd = onEndBoundary.items.find((item) => item.templateId === fixtures.ids.routineOptionalEnd);
  assert.equal(optionalEnd.endTime, null);
  assert.deepEqual(optionalEnd.weekdaysISO, [5, 6]);
  assert.equal(optionalEnd.sourceRef.kind, 'routineTemplate');
  assert.equal(optionalEnd.sourceRef.id, fixtures.ids.routineOptionalEnd);
  assert.equal('occurrenceId' in optionalEnd, false);
  assert.equal('appointmentId' in optionalEnd, false);
});

test('a non-applicable ISO weekday produces an empty result and no record-creation side effect', async () => {
  let writes = 0;
  const repository = createRepository(fixtures.recorrente);
  const result = await getRoutineTemplates({
    ...repository,
    async createOccurrence() { writes += 1; },
    async createAppointment() { writes += 1; },
  }, { date: '2026-11-03' });

  assert.deepEqual(result.items, []);
  assert.equal(result.metadata.resultState, 'empty');
  assert.equal(writes, 0);
});
