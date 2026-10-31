import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadRepository } from '../../../server/domain/read/repository.js';
import { getRoutineTemplates } from '../../../server/domain/read/routine-templates.js';

function routine({ id, start, end, weekdays }) {
  return {
    id: String(id),
    demanda: `Synthetic routine ${id}`,
    hora: '09:00:00',
    hora_fim: null,
    dias_semana: weekdays,
    data_inicial: start,
    data_final: end,
  };
}

function createSupabaseDouble(rows) {
  const calls = [];
  const sideEffects = [];
  const client = {
    from(table) {
      const filters = [];
      const orders = [];
      const call = { table, filters, orders, selected: null, range: null };
      calls.push(call);
      const builder = {
        select(projection) { call.selected = projection; return builder; },
        lte(column, value) { filters.push(['lte', column, value]); return builder; },
        gte(column, value) { filters.push(['gte', column, value]); return builder; },
        contains(column, value) { filters.push(['contains', column, value]); return builder; },
        order(column, options) { orders.push([column, options]); return builder; },
        range(from, to) { call.range = [from, to]; return builder; },
        insert() { sideEffects.push('insert'); return builder; },
        update() { sideEffects.push('update'); return builder; },
        delete() { sideEffects.push('delete'); return builder; },
        then(resolve, reject) {
          const date = filters.find(([operator, column]) => operator === 'lte' && column === 'data_inicial')?.[2];
          const weekday = filters.find(([operator, column]) => operator === 'contains' && column === 'dias_semana')?.[2]?.[0];
          const applicable = rows.filter((row) => row.data_inicial <= date
            && row.data_final >= date
            && row.dias_semana.includes(weekday));
          return Promise.resolve({ data: applicable, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, calls, sideEffects };
}

test('explicit-date query includes both civil-date boundaries and filters by ISO weekday', async () => {
  const rows = [
    routine({ id: 1, start: '2026-10-30', end: '2026-11-02', weekdays: [5, 1] }),
    routine({ id: 2, start: '2026-10-28', end: '2026-10-30', weekdays: [5] }),
    routine({ id: 3, start: '2026-10-30', end: '2026-11-02', weekdays: [4] }),
    routine({ id: 4, start: '2026-10-31', end: '2026-11-02', weekdays: [5] }),
    routine({ id: 5, start: '2026-10-28', end: '2026-10-29', weekdays: [5] }),
  ];
  const { client, calls } = createSupabaseDouble(rows);
  const repository = createReadRepository(client);

  const result = await getRoutineTemplates(repository, { date: '2026-10-30' });

  assert.deepEqual(result.items.map((item) => item.templateId), ['1', '2']);
  assert.equal(result.metadata.resultState, 'nonEmpty');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'recorrente');
  assert.equal(calls[0].selected, 'id::text,demanda,hora,hora_fim,dias_semana,data_inicial,data_final');
  assert.deepEqual(calls[0].filters, [
    ['lte', 'data_inicial', '2026-10-30'],
    ['gte', 'data_final', '2026-10-30'],
    ['contains', 'dias_semana', [5]],
  ]);
  assert.deepEqual(calls[0].orders.map(([column]) => column), ['hora', 'id']);
});

test('empty explicit-date query creates no occurrence, task, or subtask', async () => {
  const { client, calls, sideEffects } = createSupabaseDouble([
    routine({ id: 6, start: '2026-10-30', end: '2026-11-06', weekdays: [5] }),
  ]);
  const repository = createReadRepository(client);
  const result = await getRoutineTemplates(repository, { date: '2026-11-03' });

  assert.deepEqual(result.items, []);
  assert.equal(result.metadata.resultState, 'empty');
  assert.equal(calls.length, 1);
  assert.deepEqual(sideEffects, []);
  assert.equal('createOccurrence' in repository, false);
  assert.equal('createTask' in repository, false);
  assert.equal('createSubtask' in repository, false);
});
