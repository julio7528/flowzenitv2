import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { canonicalizeActionValue } from './canonical-action.js';
import { isActionBoundConfirmationGrant } from './confirmation.js';

assertServerOnlyRuntime();

export const CONFIRMATION_STORE_RESULTS = Object.freeze([
  'issued',
  'rejected',
  'already_final',
  'reserved',
  'expired',
  'mismatch',
  'already_consumed',
  'unavailable',
]);

function readAdapter(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  try {
    const prototype = Object.getPrototypeOf(candidate);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(candidate).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const methods = Object.create(null);
    for (const name of ['issue', 'reject', 'consumeOnce']) {
      const descriptor = descriptors[name];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function') return null;
      methods[name] = descriptor.value;
    }
    if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value'))) return null;
    return methods;
  } catch {
    return null;
  }
}

function safeOpaqueRef(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Adapter-neutral atomic confirmation store port. Implementations must make
 * consumeOnce compare the exact binding and atomically reserve a grant at most
 * once. This interface selects neither a storage backend nor grant TTL.
 */
export function createConfirmationStorePort(adapter) {
  const methods = readAdapter(adapter);
  if (!methods) throw new TypeError('A confirmation store adapter is required.');

  async function issue(grant) {
    if (!isActionBoundConfirmationGrant(grant)) return Object.freeze({ status: 'unavailable' });
    try {
      const result = await methods.issue(grant);
      const grantRef = safeOpaqueRef(result?.grantRef);
      return grantRef
        ? Object.freeze({ status: 'issued', grantRef })
        : Object.freeze({ status: 'unavailable' });
    } catch {
      return Object.freeze({ status: 'unavailable' });
    }
  }

  async function reject(grantRef) {
    if (!safeOpaqueRef(grantRef)) return Object.freeze({ status: 'unavailable' });
    try {
      const result = await methods.reject(grantRef);
      return ['rejected', 'already_final'].includes(result?.status)
        ? Object.freeze({ status: result.status })
        : Object.freeze({ status: 'unavailable' });
    } catch {
      return Object.freeze({ status: 'unavailable' });
    }
  }

  async function consumeOnce(grantRef, expectedBinding) {
    if (!safeOpaqueRef(grantRef)) return Object.freeze({ status: 'unavailable' });
    try { canonicalizeActionValue(expectedBinding); }
    catch { return Object.freeze({ status: 'mismatch' }); }
    try {
      const result = await methods.consumeOnce(grantRef, expectedBinding);
      if (!result || !CONFIRMATION_STORE_RESULTS.includes(result.status)) {
        return Object.freeze({ status: 'unavailable' });
      }
      if (result.status === 'reserved') {
        if (!isActionBoundConfirmationGrant(result.grant)
          || typeof result.idempotencyKey !== 'string' || result.idempotencyKey.length === 0) {
          return Object.freeze({ status: 'unavailable' });
        }
        return Object.freeze({
          status: 'reserved',
          grant: result.grant,
          idempotencyKey: result.idempotencyKey,
        });
      }
      return Object.freeze({ status: result.status });
    } catch {
      return Object.freeze({ status: 'unavailable' });
    }
  }

  return Object.freeze({ issue, reject, consumeOnce });
}
