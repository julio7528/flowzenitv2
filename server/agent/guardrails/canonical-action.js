import { createHash } from 'node:crypto';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

function canonicalJson(value, ancestors = new WeakSet()) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical action values must be finite JSON numbers.');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new TypeError('Canonical action values must be JSON data.');
  if (ancestors.has(value)) throw new TypeError('Canonical action values cannot contain cycles.');
  ancestors.add(value);

  let serialized;
  if (Array.isArray(value)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors).filter(key => key !== 'length');
    if (keys.length !== value.length) throw new TypeError('Canonical arrays must be dense and contain no extra fields.');
    const entries = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw new TypeError('Canonical arrays must contain only enumerable data values.');
      }
      entries.push(canonicalJson(descriptor.value, ancestors));
    }
    serialized = `[${entries.join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError('Canonical objects must be plain JSON records.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries = [];
    for (const key of Object.keys(descriptors).sort()) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw new TypeError('Canonical objects must contain only enumerable data values.');
      }
      entries.push(`${JSON.stringify(key)}:${canonicalJson(descriptor.value, ancestors)}`);
    }
    serialized = `{${entries.join(',')}}`;
  }

  ancestors.delete(value);
  return serialized;
}

export function canonicalizeActionValue(value) {
  return canonicalJson(value);
}

export function canonicalizeTarget(target) {
  return canonicalJson(target);
}

export function canonicalizePayload(payload) {
  const serialized = canonicalJson(payload);
  return Object.freeze({
    serialized,
    sha256: createHash('sha256').update(serialized, 'utf8').digest('hex'),
  });
}

export function fingerprintPreconditions(preconditions) {
  const serialized = canonicalJson(preconditions);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}
