import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareHierarchyMutation } from '../../../server/domain/write/hierarchy.js';
import { SYNTHETIC_WRITE_COMMANDS, SYNTHETIC_WRITE_IDS } from '../../fixtures/domain-write/commands.js';

test('hierarchy creation derives type and parent from the operation, not model fields', () => {
  const demand = prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createDemand);
  assert.deepEqual(demand, {
    operation: 'create_demand',
    targetId: null,
    values: { demanda: 'Synthetic demand', tipo: 1, raizid: null },
  });

  const task = prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createTask, {
    id: SYNTHETIC_WRITE_IDS.demand,
    tipo: 1,
  });
  assert.deepEqual(task, {
    operation: 'create_task',
    targetId: null,
    values: { demanda: 'Synthetic task', tipo: 2, raizid: SYNTHETIC_WRITE_IDS.demand },
  });

  const subtask = prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createSubtask, {
    id: SYNTHETIC_WRITE_IDS.task,
    tipo: 2,
  });
  assert.deepEqual(subtask, {
    operation: 'create_subtask',
    targetId: null,
    values: { demanda: 'Synthetic subtask', tipo: 3, raizid: SYNTHETIC_WRITE_IDS.task },
  });
});

test('task and subtask creation rejects missing, mismatched, or wrong-type parents', () => {
  assert.equal(prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createTask), null);
  assert.equal(prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createTask, { id: SYNTHETIC_WRITE_IDS.task, tipo: 1 }), null);
  assert.equal(prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createTask, { id: SYNTHETIC_WRITE_IDS.demand, tipo: 2 }), null);
  assert.equal(prepareHierarchyMutation(SYNTHETIC_WRITE_COMMANDS.createSubtask, { id: SYNTHETIC_WRITE_IDS.task, tipo: 1 }), null);
});

test('rename changes only demanda and does not add maximum-length or name-uniqueness rules', () => {
  const first = prepareHierarchyMutation({
    operation: 'rename_task', version: 1, targetId: SYNTHETIC_WRITE_IDS.task,
    payload: { name: 'Same synthetic name' },
  });
  const second = prepareHierarchyMutation({
    operation: 'rename_demand', version: 1, targetId: SYNTHETIC_WRITE_IDS.demand,
    payload: { name: 'Same synthetic name' },
  });
  assert.deepEqual(first, {
    operation: 'rename_task',
    targetId: SYNTHETIC_WRITE_IDS.task,
    values: { demanda: 'Same synthetic name' },
  });
  assert.equal(second.values.demanda, first.values.demanda);
  assert.deepEqual(Object.keys(first.values), ['demanda']);
  assert.equal(prepareHierarchyMutation({
    operation: 'rename_task', version: 1, targetId: SYNTHETIC_WRITE_IDS.task,
    payload: { name: '   ' },
  }), null);
});
