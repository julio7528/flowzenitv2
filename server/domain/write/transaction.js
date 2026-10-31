import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

export const MUTATION_TRANSACTION_METHODS = Object.freeze(['run']);

export function assertMutationTransactionPort(port) {
  if (port === null || typeof port !== 'object' || Array.isArray(port)) {
    throw new TypeError('A mutation transaction port is required.');
  }
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(port);
    descriptors = Object.getOwnPropertyDescriptors(port);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(port).length > 0) throw new TypeError();
  } catch {
    throw new TypeError('The mutation transaction port is invalid.');
  }
  const keys = Object.keys(descriptors).sort();
  if (keys.length !== MUTATION_TRANSACTION_METHODS.length || keys[0] !== 'run') {
    throw new TypeError('The mutation transaction port has an invalid method set.');
  }
  const descriptor = descriptors.run;
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
    throw new TypeError('The mutation transaction port is invalid.');
  }
  return port;
}

/**
 * @typedef {object} MutationTransaction
 * @property {(work: Function, options: object) => Promise<unknown>} run
 *
 * The transaction boundary must include revalidation, one operation, and
 * read-back. Its concrete adapter remains unselected until DEC-001/DEC-010
 * and the product transaction decision are resolved.
 */
