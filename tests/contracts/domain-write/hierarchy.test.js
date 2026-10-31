import assert from 'node:assert/strict';
import test from 'node:test';
import { MUTATION_OPERATIONS, validateMutationCommand } from '../../../server/domain/write/contracts.js';
import { prepareHierarchyMutation } from '../../../server/domain/write/hierarchy.js';
import { createSupabaseWriteRepository } from '../../../server/domain/write/supabase-repository.js';
import { SYNTHETIC_WRITE_IDS } from '../../fixtures/domain-write/commands.js';

const INSERTED_TASK_ID = '900000000000000004';
const DEMAND_PROJECTION = 'id::text,demanda,tipo,raizid::text,status,data_exec,hora_inicio,hora_fim';

function createSupabaseDouble({ rows = [], insertedId = INSERTED_TASK_ID } = {}) {
  const state = { requests: [], inserts: [] };
  const rowsById = new Map(rows.map(row => [row.id, row]));
  const client = {
    from(table) {
      const request = { table, operation: 'select', columns: null, id: null, limit: null, values: null };
      state.requests.push(request);
      const query = {
        select(columns) { request.columns = columns; return this; },
        eq(column, value) { assert.equal(column, 'id'); request.id = value; return this; },
        limit(value) { request.limit = value; return this; },
        insert(values) { request.operation = 'insert'; request.values = values; state.inserts.push(request); return this; },
        then(resolve, reject) {
          const data = request.operation === 'insert'
            ? [{ id: insertedId }]
            : (rowsById.has(request.id) ? [rowsById.get(request.id)] : []);
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { repository: createSupabaseWriteRepository(client), state };
}

function demandRow(overrides = {}) {
  return {
    id: SYNTHETIC_WRITE_IDS.demand,
    demanda: 'Synthetic demand',
    tipo: 1,
    raizid: null,
    status: 'Backlog',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
    ...overrides,
  };
}

function taskRow(overrides = {}) {
  return {
    id: INSERTED_TASK_ID,
    demanda: 'Synthetic task',
    tipo: 2,
    raizid: SYNTHETIC_WRITE_IDS.demand,
    status: 'Backlog',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
    ...overrides,
  };
}

const HIERARCHY_OPERATIONS = Object.freeze([
  'create_demand', 'create_task', 'create_subtask',
  'rename_demand', 'rename_task', 'rename_subtask',
]);

test('only named create and rename hierarchy operations are part of the write allowlist', () => {
  for (const operation of HIERARCHY_OPERATIONS) assert.equal(MUTATION_OPERATIONS.includes(operation), true);
  assert.equal(MUTATION_OPERATIONS.includes('delete'), false);
});

test('create and rename commands require exact parent or target IDs', () => {
  const valid = [
    { operation: 'create_demand', version: 1, parentId: null, payload: { name: 'Synthetic demand' } },
    { operation: 'create_task', version: 1, parentId: SYNTHETIC_WRITE_IDS.demand, payload: { name: 'Synthetic task' } },
    { operation: 'create_subtask', version: 1, parentId: SYNTHETIC_WRITE_IDS.task, payload: { name: 'Synthetic subtask' } },
    ...['demand', 'task', 'subtask'].map((kind) => ({
      operation: `rename_${kind}`,
      version: 1,
      targetId: SYNTHETIC_WRITE_IDS[kind],
      payload: { name: 'Synthetic renamed value' },
    })),
  ];
  for (const command of valid) assert.equal(validateMutationCommand(command).valid, true, command.operation);

  assert.equal(validateMutationCommand({ operation: 'create_task', version: 1, payload: { name: 'Synthetic task' } }).valid, false);
  assert.equal(validateMutationCommand({ operation: 'create_subtask', version: 1, payload: { name: 'Synthetic subtask' } }).valid, false);
  assert.equal(validateMutationCommand({ operation: 'rename_demand', version: 1, payload: { name: 'Synthetic name' } }).valid, false);
});

test('hierarchy commands reject caller-controlled type, parent, status and authority fields', () => {
  for (const field of ['tipo', 'raizid', 'parentStatus', 'idempotencyKey', 'confirmationGrant', 'policy']) {
    const command = {
      operation: 'rename_task',
      version: 1,
      targetId: SYNTHETIC_WRITE_IDS.task,
      payload: { name: 'Synthetic rename', [field]: 'untrusted' },
    };
    assert.equal(validateMutationCommand(command).valid, false, `${field} must be rejected`);
  }
});

test('task creation derives tipo and raizid from the operation and exact demand record', () => {
  const prepared = prepareHierarchyMutation({
    operation: 'create_task',
    version: 1,
    parentId: SYNTHETIC_WRITE_IDS.demand,
    payload: { name: 'Synthetic task' },
  }, {
    id: SYNTHETIC_WRITE_IDS.demand,
    tipo: 1,
    data_exec: null,
  });

  assert.deepEqual(prepared, {
    operation: 'create_task',
    targetId: null,
    values: {
      demanda: 'Synthetic task',
      tipo: 2,
      raizid: SYNTHETIC_WRITE_IDS.demand,
    },
  });
});

test('task repository inserts fixed tipo/raizid and confirms the exact persisted row', async () => {
  const parent = demandRow();
  const child = taskRow();
  const { repository, state } = createSupabaseDouble({ rows: [parent, child] });

  const outcome = await repository.createTask({
    name: 'Synthetic task',
    parentId: SYNTHETIC_WRITE_IDS.demand,
  });

  assert.equal(outcome.outcome, 'COMMITTED');
  assert.equal(outcome.persistentId, INSERTED_TASK_ID);
  assert.deepEqual(state.inserts.map(request => request.values), [{
    demanda: 'Synthetic task',
    tipo: 2,
    raizid: SYNTHETIC_WRITE_IDS.demand,
  }]);
  assert.equal(state.requests[0].table, 'demandas');
  assert.equal(state.requests[0].columns, DEMAND_PROJECTION);
  assert.equal(state.requests.at(-1).id, INSERTED_TASK_ID);
  assert.equal(state.inserts.length, 1);
});

test('blank name, malformed/mismatched ID, wrong parent type, and scheduled demand cause zero inserts', async () => {
  const cases = [
    { input: { name: '   ', parentId: SYNTHETIC_WRITE_IDS.demand }, rows: [demandRow()] },
    { input: { name: 'Synthetic task', parentId: 'not-a-decimal-id' }, rows: [] },
    { input: { name: 'Synthetic task', parentId: SYNTHETIC_WRITE_IDS.demand }, rows: [demandRow({ id: SYNTHETIC_WRITE_IDS.task })] },
    { input: { name: 'Synthetic task', parentId: SYNTHETIC_WRITE_IDS.demand }, rows: [demandRow({ tipo: 2 })] },
    { input: { name: 'Synthetic task', parentId: SYNTHETIC_WRITE_IDS.demand }, rows: [demandRow({ data_exec: '2026-11-02' })] },
    { input: { name: 'Synthetic task', parentId: SYNTHETIC_WRITE_IDS.demand }, rows: [] },
  ];

  for (const scenario of cases) {
    const { repository, state } = createSupabaseDouble({ rows: scenario.rows });
    const outcome = await repository.createTask(scenario.input);
    assert.notEqual(outcome.outcome, 'COMMITTED');
    assert.equal(state.inserts.length, 0);
  }
});
