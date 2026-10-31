import { assertServerOnlyRuntime } from '../../agent/runtime/server-only.js';

assertServerOnlyRuntime();

export const MUTATION_REPOSITORY_METHODS = Object.freeze([
  'readTarget',
  'readAffectedRecords',
  'createDemand',
  'createTask',
  'createSubtask',
  'rename',
  'setWeeklyAllocation',
  'setDailySubtaskSchedule',
  'setSubtaskStatus',
]);

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/** Validate a typed repository adapter without defining its storage mechanism. */
export function assertMutationRepositoryPort(port) {
  if (!isPlainRecord(port) || Object.getOwnPropertySymbols(port).length > 0) {
    throw new TypeError('A mutation repository port is required.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(port);
  const keys = Object.keys(descriptors).sort();
  const expected = [...MUTATION_REPOSITORY_METHODS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError('The mutation repository port has an invalid method set.');
  }
  for (const key of MUTATION_REPOSITORY_METHODS) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') {
      throw new TypeError('The mutation repository port is invalid.');
    }
  }
  return port;
}

/**
 * @typedef {object} MutationRepository
 * @property {Function} readTarget
 * @property {Function} readAffectedRecords
 * @property {Function} createDemand
 * @property {Function} createTask
 * @property {Function} createSubtask
 * @property {Function} rename
 * @property {Function} setWeeklyAllocation
 * @property {Function} setDailySubtaskSchedule
 * @property {Function} setSubtaskStatus
 *
 * Implementations are injected after the separate access and transaction
 * decisions are approved. This SPEC selects no Supabase or SQL adapter.
 */
