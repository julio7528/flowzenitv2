import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MUTATION_OPERATIONS,
  validateMutationCommand,
} from '../../../server/domain/write/contracts.js';
import { SYNTHETIC_WRITE_COMMANDS, SYNTHETIC_WRITE_IDS } from '../../fixtures/domain-write/commands.js';

test('synthetic mutation command fixtures satisfy their strict DTO schemas', () => {
  for (const [name, command] of Object.entries(SYNTHETIC_WRITE_COMMANDS)) {
    assert.equal(validateMutationCommand(command).valid, true, `${name} should be valid`);
  }
});

test('model-supplied authority and persistence fields are rejected', () => {
  for (const field of [
    'idempotencyKey', 'confirmationRef', 'confirmationGrant', 'policy', 'tipo', 'raizid', 'parentStatus',
  ]) {
    const candidate = { ...SYNTHETIC_WRITE_COMMANDS.createTask, [field]: 'untrusted' };
    assert.deepEqual(validateMutationCommand(candidate), { valid: false }, `${field} should be rejected`);
  }

  assert.deepEqual(
    validateMutationCommand({ ...SYNTHETIC_WRITE_COMMANDS.createTask, targetId: SYNTHETIC_WRITE_IDS.task }),
    { valid: false },
  );
  assert.deepEqual(
    validateMutationCommand({ operation: 'delete', version: 1, targetId: SYNTHETIC_WRITE_IDS.task, payload: {} }),
    { valid: false },
  );
});

test('IDs, civil dates, and all-or-null daily schedules are strictly validated', () => {
  assert.deepEqual(MUTATION_OPERATIONS.length, 9);
  assert.equal(validateMutationCommand({
    operation: 'rename_demand', version: 1, targetId: '9223372036854775808', payload: { name: 'Synthetic' },
  }).valid, false);
  assert.equal(validateMutationCommand({
    operation: 'set_weekly_allocation', version: 1, targetId: SYNTHETIC_WRITE_IDS.demand,
    payload: { date: '2026-02-30' },
  }).valid, false);
  assert.equal(validateMutationCommand({
    operation: 'set_daily_subtask_schedule', version: 1, targetId: SYNTHETIC_WRITE_IDS.subtask,
    payload: { date: null, startTime: '09:00', endTime: null },
  }).valid, false);
  assert.equal(validateMutationCommand({
    operation: 'set_daily_subtask_schedule', version: 1, targetId: SYNTHETIC_WRITE_IDS.subtask,
    payload: { date: null, startTime: null, endTime: null },
  }).valid, true);
});

test('accessor-backed request fields are rejected without invoking getters', () => {
  let getterRan = false;
  const candidate = Object.defineProperty({}, 'operation', {
    enumerable: true,
    get() {
      getterRan = true;
      return 'create_demand';
    },
  });

  assert.deepEqual(validateMutationCommand(candidate), { valid: false });
  assert.equal(getterRan, false);
});
