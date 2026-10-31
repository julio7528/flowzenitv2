import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseRecurrenceRepository } from '../../../server/domain/recurrence/supabase-repository.js';

const INSERTED_ID = '900000000000000021';
const INPUT = Object.freeze({
  name: '  Study planning  ',
  weekdaysISO: [5, 1],
  startDate: '2026-10-30',
  endDate: '2026-11-06',
  startTime: '09:00',
});
const STORED_ROW = Object.freeze({
  id: INSERTED_ID,
  demanda: 'Study planning',
  hora: '09:00:00',
  hora_fim: null,
  dias_semana: [1, 5],
  data_inicial: '2026-10-30',
  data_final: '2026-11-06',
});

function createSupabaseDouble({ insertResult, readbackResult, throwOnInsert = false }) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table, action: 'read', projection: null, filter: null, limit: null };
      const builder = {
        insert(payload) { call.action = 'insert'; call.payload = payload; return builder; },
        select(projection) { call.projection = projection; return builder; },
        eq(column, value) { call.filter = [column, value]; return builder; },
        limit(value) { call.limit = value; return builder; },
        then(resolve, reject) {
          calls.push({ ...call });
          if (call.action === 'insert' && throwOnInsert) {
            return Promise.reject(new Error('synthetic connection reset after request send')).then(resolve, reject);
          }
          const result = call.action === 'insert' ? insertResult : readbackResult;
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

test('routine create uses one fixed insert and confirms the exact inserted ID and civil values', async () => {
  const { client, calls } = createSupabaseDouble({
    insertResult: { data: [{ id: INSERTED_ID }], error: null },
    readbackResult: { data: [STORED_ROW], error: null },
  });
  const repository = createSupabaseRecurrenceRepository(client);

  const result = await repository.createRoutineSeries(INPUT);

  assert.equal(result.outcome, 'COMMITTED');
  assert.equal(result.operation, 'create_routine_series');
  assert.equal(result.persistentId, INSERTED_ID);
  assert.deepEqual(calls, [
    {
      table: 'recorrente',
      action: 'insert',
      payload: {
        demanda: 'Study planning',
        hora: '09:00:00',
        hora_fim: null,
        dias_semana: [1, 5],
        data_inicial: '2026-10-30',
        data_final: '2026-11-06',
      },
      projection: 'id::text',
      filter: null,
      limit: null,
    },
    {
      table: 'recorrente',
      action: 'read',
      projection: 'id::text,demanda,hora,hora_fim,dias_semana,data_inicial,data_final',
      filter: ['id', INSERTED_ID],
      limit: 1,
    },
  ]);
});

test('permission errors return a safe denial without exposing database text or reading back', async () => {
  const { client, calls } = createSupabaseDouble({
    insertResult: {
      data: null,
      error: { code: '42501', message: 'private policy and table details' },
    },
    readbackResult: { data: [], error: null },
  });
  const result = await createSupabaseRecurrenceRepository(client).createRoutineSeries(INPUT);

  assert.equal(result.outcome, 'DENIED');
  assert.equal(result.reasonCategory, 'ACCESS_DISABLED');
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(result).includes('private policy'), false);
});

test('invalid input is rejected before any Supabase request', async () => {
  const { client, calls } = createSupabaseDouble({
    insertResult: { data: [], error: null },
    readbackResult: { data: [], error: null },
  });
  const result = await createSupabaseRecurrenceRepository(client).createRoutineSeries({
    ...INPUT,
    weekdaysISO: [1, 1],
  });

  assert.equal(result.outcome, 'VALIDATION_ERROR');
  assert.equal(result.reasonCategory, 'INVALID_INPUT');
  assert.deepEqual(calls, []);
});

test('an uncertain insert transport failure is not retried and never reports success', async () => {
  const { client, calls } = createSupabaseDouble({
    insertResult: { data: [], error: null },
    readbackResult: { data: [STORED_ROW], error: null },
    throwOnInsert: true,
  });
  const result = await createSupabaseRecurrenceRepository(client).createRoutineSeries(INPUT);

  assert.equal(result.outcome, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(result.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].action, 'insert');
});

test('a read-back row that differs from the submitted template remains unconfirmed', async () => {
  const { client } = createSupabaseDouble({
    insertResult: { data: [{ id: INSERTED_ID }], error: null },
    readbackResult: { data: [{ ...STORED_ROW, hora: '10:00:00' }], error: null },
  });
  const result = await createSupabaseRecurrenceRepository(client).createRoutineSeries(INPUT);

  assert.equal(result.outcome, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(result.persistentId, INSERTED_ID);
});
