import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMutationRepositoryPort,
  MUTATION_REPOSITORY_METHODS,
} from '../../../server/domain/write/repository.js';

const noop = async () => null;

test('repository port accepts only the typed mutation methods', () => {
  const port = Object.fromEntries(MUTATION_REPOSITORY_METHODS.map((method) => [method, noop]));
  assert.equal(assertMutationRepositoryPort(port), port);
  assert.throws(() => assertMutationRepositoryPort({ ...port, delete: noop }), /invalid method set/);
  assert.throws(() => assertMutationRepositoryPort({ ...port, executeSql: noop }), /invalid method set/);
});

test('repository port rejects accessor-backed methods', () => {
  let getterRan = false;
  const port = Object.fromEntries(MUTATION_REPOSITORY_METHODS.map((method) => [method, noop]));
  Object.defineProperty(port, 'readTarget', {
    enumerable: true,
    get() {
      getterRan = true;
      return noop;
    },
  });
  assert.throws(() => assertMutationRepositoryPort(port), /invalid/);
  assert.equal(getterRan, false);
});
