import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMutationTransactionPort } from '../../../server/domain/write/transaction.js';

test('transaction port accepts one atomic run method and no storage-specific escape hatch', () => {
  const port = { run: async (work) => work() };
  assert.equal(assertMutationTransactionPort(port), port);
  assert.throws(() => assertMutationTransactionPort({ ...port, executeSql: async () => null }), /invalid method set/);
  assert.throws(() => assertMutationTransactionPort({}), /invalid method set/);
});

test('transaction port rejects an accessor instead of invoking it', () => {
  let getterRan = false;
  const port = Object.defineProperty({}, 'run', {
    enumerable: true,
    get() {
      getterRan = true;
      return async () => null;
    },
  });
  assert.throws(() => assertMutationTransactionPort(port), /invalid/);
  assert.equal(getterRan, false);
});
