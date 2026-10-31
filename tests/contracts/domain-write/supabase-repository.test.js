import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseWriteRepository } from '../../../server/domain/write/supabase-repository.js';
import { SYNTHETIC_WRITE_IDS } from '../../fixtures/domain-write/commands.js';

const INSERTED_ID = SYNTHETIC_WRITE_IDS.task;
const PARENT_PROJECTION = 'id::text,demanda,tipo,raizid::text,status,data_exec,hora_inicio,hora_fim';

function row({ id, name, tipo, raizid = null, data_exec = null }) {
  return {
    id,
    demanda: name,
    tipo,
    raizid,
    status: 'Backlog',
    data_exec,
    hora_inicio: null,
    hora_fim: null,
  };
}

function createPostgrestDouble({
  parent = row({ id: SYNTHETIC_WRITE_IDS.demand, name: 'Synthetic demand', tipo: 1 }),
  insertResponse = { data: [{ id: INSERTED_ID }], error: null },
  readback = row({ id: INSERTED_ID, name: 'Synthetic task', tipo: 2, raizid: SYNTHETIC_WRITE_IDS.demand }),
  throwAfterInsertRequest = false,
} = {}) {
  const state = { requests: [], selects: [], inserts: [] };
  const client = {
    from(table) {
      const request = { table, method: 'select', projection: null, filters: [], limit: null, values: null };
      state.requests.push(request);
      const query = {
        select(projection) { request.projection = projection; return this; },
        eq(column, value) { request.filters.push([column, value]); return this; },
        limit(value) { request.limit = value; return this; },
        insert(values) { request.method = 'insert'; request.values = values; state.inserts.push(request); return this; },
        then(resolve, reject) {
          if (request.method === 'insert') {
            if (throwAfterInsertRequest) return Promise.reject(new Error('synthetic transport loss')).then(resolve, reject);
            return Promise.resolve(insertResponse).then(resolve, reject);
          }
          state.selects.push(request);
          const result = state.selects.length === 1
            ? { data: parent === null ? [] : [parent], error: null }
            : { data: readback === null ? [] : [readback], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };

  return { repository: createSupabaseWriteRepository(client), state };
}

const taskInput = Object.freeze({ name: 'Synthetic task', parentId: SYNTHETIC_WRITE_IDS.demand });

test('task PostgREST contract uses fixed table and values, then reads back the exact inserted ID', async () => {
  const { repository, state } = createPostgrestDouble();
  const outcome = await repository.createTask(taskInput);

  assert.equal(outcome.outcome, 'COMMITTED');
  assert.equal(outcome.reasonCategory, 'SUCCESS');
  assert.equal(outcome.persistentId, INSERTED_ID);
  assert.deepEqual(state.requests.map(({ table, method }) => ({ table, method })), [
    { table: 'demandas', method: 'select' },
    { table: 'demandas', method: 'insert' },
    { table: 'demandas', method: 'select' },
  ]);
  assert.deepEqual(state.inserts.map(request => request.values), [{
    demanda: 'Synthetic task',
    tipo: 2,
    raizid: SYNTHETIC_WRITE_IDS.demand,
  }]);
  assert.equal(state.requests[0].projection, PARENT_PROJECTION);
  assert.deepEqual(state.requests[0].filters, [['id', SYNTHETIC_WRITE_IDS.demand]]);
  assert.equal(state.requests[0].limit, 1);
  assert.equal(state.requests[1].projection, 'id::text');
  assert.deepEqual(state.requests[2].filters, [['id', INSERTED_ID]]);
  assert.equal(state.requests[2].projection, PARENT_PROJECTION);
  assert.equal(state.requests[2].limit, 1);
  assert.equal(state.inserts.length, 1);
});

test('permission errors return a bounded denial and never start the read-back query', async () => {
  const sentinel = 'private permission detail';
  const { repository, state } = createPostgrestDouble({
    insertResponse: { data: null, error: { code: '42501', message: sentinel } },
  });

  const outcome = await repository.createTask(taskInput);

  assert.equal(outcome.outcome, 'DENIED');
  assert.equal(outcome.reasonCategory, 'ACCESS_DISABLED');
  assert.equal(JSON.stringify(outcome).includes(sentinel), false);
  assert.equal(state.inserts.length, 1);
  assert.equal(state.selects.length, 1);
});

test('an insert response lost after dispatch is uncertain and is never retried', async () => {
  const { repository, state } = createPostgrestDouble({ throwAfterInsertRequest: true });

  const outcome = await repository.createTask(taskInput);

  assert.equal(outcome.outcome, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(outcome.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(state.inserts.length, 1);
  assert.equal(state.requests.filter(request => request.method === 'insert').length, 1);
  assert.equal(state.selects.length, 1);
});

test('missing or mismatched exact-ID read-back never reports a committed task', async (t) => {
  await t.test('missing row', async () => {
    const { repository, state } = createPostgrestDouble({ readback: null });
    const outcome = await repository.createTask(taskInput);
    assert.equal(outcome.outcome, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(outcome.persistentId, INSERTED_ID);
    assert.equal(state.inserts.length, 1);
  });

  await t.test('row does not match inserted task', async () => {
    const { repository, state } = createPostgrestDouble({
      readback: row({ id: '900000000000000099', name: 'Different row', tipo: 2, raizid: SYNTHETIC_WRITE_IDS.demand }),
    });
    const outcome = await repository.createTask(taskInput);
    assert.equal(outcome.outcome, 'DEPENDENCY_UNAVAILABLE');
    assert.equal(outcome.persistentId, INSERTED_ID);
    assert.equal(state.inserts.length, 1);
  });
});
