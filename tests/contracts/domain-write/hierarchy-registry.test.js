import assert from 'node:assert/strict';
import test from 'node:test';
import { createMutationOutcome } from '../../../server/domain/write/outcomes.js';
import { createWriteCapabilityRegistry } from '../../../server/agent/tools/write-capabilities.js';
import { createSupabaseWriteRepository } from '../../../server/domain/write/supabase-repository.js';
import { SYNTHETIC_WRITE_COMMANDS, SYNTHETIC_WRITE_IDS } from '../../fixtures/domain-write/commands.js';

function createSubtaskRepositoryDouble(parentTipo = 2) {
  const parentId = SYNTHETIC_WRITE_IDS.task;
  const subtaskId = SYNTHETIC_WRITE_IDS.subtask;
  const state = { requests: [], inserts: [] };
  const rowsById = new Map([
    [parentId, {
      id: parentId, demanda: 'Synthetic task', tipo: parentTipo, raizid: SYNTHETIC_WRITE_IDS.demand,
      status: 'Backlog', data_exec: null, hora_inicio: null, hora_fim: null,
    }],
    [subtaskId, {
      id: subtaskId, demanda: 'Synthetic subtask', tipo: 3, raizid: parentId,
      status: 'Backlog', data_exec: null, hora_inicio: null, hora_fim: null,
    }],
  ]);
  const client = {
    from(table) {
      const request = { table, operation: 'select', projection: null, id: null, values: null };
      state.requests.push(request);
      const query = {
        select(projection) { request.projection = projection; return this; },
        eq(column, value) { assert.equal(column, 'id'); request.id = value; return this; },
        limit(value) { request.limit = value; return this; },
        insert(values) { request.operation = 'insert'; request.values = values; state.inserts.push(request); return this; },
        then(resolve, reject) {
          const data = request.operation === 'insert'
            ? [{ id: subtaskId }]
            : (rowsById.has(request.id) ? [rowsById.get(request.id)] : []);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { repository: createSupabaseWriteRepository(client), state };
}

test('registry exposes pure preparation only for the six named hierarchy operations', () => {
  const { registry } = createWriteCapabilityRegistry();
  for (const name of [
    'create_demand', 'create_task', 'create_subtask',
    'rename_demand', 'rename_task', 'rename_subtask',
  ]) {
    assert.equal(typeof registry.get(name)?.prepare, 'function', `${name} should have a typed preparer`);
  }
  assert.equal(registry.get('set_subtask_status').prepare, null);
  assert.equal(registry.has('delete'), false);

  const prepared = registry.get('create_demand').prepare(SYNTHETIC_WRITE_COMMANDS.createDemand);
  assert.equal(prepared.values.tipo, 1);
  assert.equal(prepared.values.raizid, null);
});

test('rename binds to an exact target ID and only emits the name field', () => {
  const { registry } = createWriteCapabilityRegistry();
  const prepared = registry.get('rename_task').prepare({
    operation: 'rename_task', version: 1, targetId: SYNTHETIC_WRITE_IDS.task,
    payload: { name: 'Synthetic exact rename' },
  });
  assert.deepEqual(prepared, {
    operation: 'rename_task',
    targetId: SYNTHETIC_WRITE_IDS.task,
    values: { demanda: 'Synthetic exact rename' },
  });
  assert.equal(registry.get('rename_task').prepare({
    operation: 'rename_task', version: 1, payload: { name: 'Synthetic exact rename' },
  }), null);
  assert.equal(registry.get('create_demand').prepare(SYNTHETIC_WRITE_COMMANDS.createTask), null);
});

test('parent records with accessor-backed identity are rejected without invoking getters', () => {
  const { registry } = createWriteCapabilityRegistry();
  let getterRan = false;
  const parent = Object.defineProperties({}, {
    id: { enumerable: true, value: SYNTHETIC_WRITE_IDS.demand },
    tipo: { enumerable: true, get() { getterRan = true; return 1; } },
  });
  assert.equal(registry.get('create_task').prepare(SYNTHETIC_WRITE_COMMANDS.createTask, parent), null);
  assert.equal(getterRan, false);
});

test('subtask creation persists tipo 3 with the exact tipo 2 parent task ID', async () => {
  const { repository, state } = createSubtaskRepositoryDouble();
  const outcome = await repository.createSubtask({
    name: 'Synthetic subtask',
    parentId: SYNTHETIC_WRITE_IDS.task,
  });

  assert.equal(outcome.outcome, 'COMMITTED');
  assert.equal(outcome.persistentId, SYNTHETIC_WRITE_IDS.subtask);
  assert.deepEqual(state.inserts.map(request => request.values), [{
    demanda: 'Synthetic subtask',
    tipo: 3,
    raizid: SYNTHETIC_WRITE_IDS.task,
  }]);
  assert.equal(state.requests[0].id, SYNTHETIC_WRITE_IDS.task);
  assert.equal(state.requests.at(-1).id, SYNTHETIC_WRITE_IDS.subtask);
  assert.equal(state.inserts.length, 1);
});

test('subtask creation with a non-task parent makes zero Supabase inserts', async () => {
  const { repository, state } = createSubtaskRepositoryDouble(1);
  const outcome = await repository.createSubtask({
    name: 'Synthetic subtask',
    parentId: SYNTHETIC_WRITE_IDS.task,
  });

  assert.equal(outcome.outcome, 'VALIDATION_ERROR');
  assert.equal(outcome.reasonCategory, 'INVALID_PARENT');
  assert.equal(state.inserts.length, 0);
});

test('write capability handlers delegate only task and subtask creates to the injected repository', async () => {
  const calls = [];
  const writeRepository = {
    createTask: async input => {
      calls.push(['create_task', input]);
      return createMutationOutcome({
        outcome: 'COMMITTED', operation: 'create_task', operationVersion: 1,
        persistentId: '900000000000000004', resultingValues: { name: input.name },
        correlationId: '123e4567-e89b-42d3-a456-426614174000', reasonCategory: 'SUCCESS',
      });
    },
    createSubtask: async input => {
      calls.push(['create_subtask', input]);
      return createMutationOutcome({
        outcome: 'COMMITTED', operation: 'create_subtask', operationVersion: 1,
        persistentId: SYNTHETIC_WRITE_IDS.subtask, resultingValues: { name: input.name },
        correlationId: '123e4567-e89b-42d3-a456-426614174001', reasonCategory: 'SUCCESS',
      });
    },
  };
  const { registry } = createWriteCapabilityRegistry({
    accessGate: { allowsWrite: async () => true },
    writeRepository,
  });

  const outcome = await registry.get('create_task').handler({
    name: '  Synthetic task  ',
    parentId: SYNTHETIC_WRITE_IDS.demand,
  });

  assert.equal(registry.get('create_task').enabled, true);
  assert.equal(registry.get('create_subtask').enabled, true);
  assert.equal(registry.get('rename_task').enabled, false);
  assert.equal(registry.get('rename_task').handler, null);
  assert.equal(outcome.outcome, 'COMMITTED');
  assert.deepEqual(calls, [['create_task', {
    name: 'Synthetic task',
    parentId: SYNTHETIC_WRITE_IDS.demand,
  }]]);
});
