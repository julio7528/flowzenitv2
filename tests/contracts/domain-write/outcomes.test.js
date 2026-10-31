import assert from 'node:assert/strict';
import test from 'node:test';
import {
  categorizeMutationDatabaseError,
  createMutationOutcome,
} from '../../../server/domain/write/outcomes.js';

test('database error mapping returns bounded categories and never copies raw messages', () => {
  const sentinel = 'private sql payload sentinel';
  const category = categorizeMutationDatabaseError({ code: '23503', message: sentinel });
  assert.equal(category, 'INVALID_PARENT');
  assert.equal(JSON.stringify(category).includes(sentinel), false);
  assert.equal(categorizeMutationDatabaseError({ code: 'XX999', message: sentinel }), 'INTERNAL');

  let getterRan = false;
  const accessorCode = Object.defineProperty({}, 'code', {
    enumerable: true,
    get() {
      getterRan = true;
      throw new Error(sentinel);
    },
  });
  assert.equal(categorizeMutationDatabaseError(accessorCode), 'INTERNAL');
  assert.equal(getterRan, false);
});

test('outcome DTO accepts only bounded result fields', () => {
  const outcome = createMutationOutcome({
    outcome: 'DENIED',
    operation: 'create_task',
    operationVersion: 1,
    correlationId: '123e4567-e89b-42d3-a456-426614174000',
    reasonCategory: 'ACCESS_DISABLED',
  });
  assert.equal(outcome.reasonCategory, 'ACCESS_DISABLED');
  assert.throws(() => createMutationOutcome({ ...outcome, sql: 'private statement' }), /Invalid mutation outcome/);
});

test('a committed creation uses an explicit success category and persistent decimal ID', () => {
  const outcome = createMutationOutcome({
    outcome: 'COMMITTED',
    operation: 'create_task',
    operationVersion: 1,
    persistentId: '900000000000000001',
    resultingValues: { name: 'Synthetic task' },
    correlationId: '123e4567-e89b-42d3-a456-426614174000',
    reasonCategory: 'SUCCESS',
  });

  assert.equal(outcome.outcome, 'COMMITTED');
  assert.equal(outcome.reasonCategory, 'SUCCESS');
  assert.equal(outcome.persistentId, '900000000000000001');
});
