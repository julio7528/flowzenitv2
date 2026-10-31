import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const UNTRUSTED_SOURCE_KINDS = Object.freeze([
  'user',
  'retrieval',
  'memory',
  'model',
  'provider',
  'web',
]);

export const UNTRUSTED_CONTENT_VERSION = '1.0.0';

const sourceKinds = new Set(UNTRUSTED_SOURCE_KINDS);
const issuedSegments = new WeakSet();
const ALLOWED_FIELDS = new Set(['sourceKind', 'sourceRef', 'text']);

function readInput(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(value).length > 0) return null;

    const result = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!ALLOWED_FIELDS.has(key) || !Object.hasOwn(descriptor, 'value')) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

/** Preserve user/model/retrieved text as inert data with server-defined provenance. */
export function createUntrustedContentSegment(candidate) {
  const value = readInput(candidate);
  if (!value || !sourceKinds.has(value.sourceKind) || typeof value.text !== 'string') {
    throw new TypeError('A recognized untrusted source and text are required.');
  }
  if (Object.hasOwn(value, 'sourceRef') && typeof value.sourceRef !== 'string') {
    throw new TypeError('The optional source reference must be a string.');
  }

  const segment = Object.freeze({
    version: UNTRUSTED_CONTENT_VERSION,
    sourceKind: value.sourceKind,
    sourceRef: value.sourceRef,
    trust: 'untrusted',
    contentType: 'data',
    text: value.text,
  });
  issuedSegments.add(segment);
  return segment;
}

export function isUntrustedContentSegment(value) {
  return value !== null && typeof value === 'object' && issuedSegments.has(value);
}

/** Return data-only prompt parts; policy, capability, and role fields stay separate. */
export function toUntrustedPromptSegments(segments) {
  if (!Array.isArray(segments)) throw new TypeError('Untrusted prompt segments must be an array.');
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(segments);
    const keys = Reflect.ownKeys(descriptors).filter(key => key !== 'length');
    if (keys.length !== segments.length) throw new TypeError('Untrusted prompt segments must be dense.');
  } catch {
    throw new TypeError('Untrusted prompt segments are invalid.');
  }

  const result = [];
  for (let index = 0; index < segments.length; index += 1) {
    const descriptor = descriptors[index];
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable
      || !isUntrustedContentSegment(descriptor.value)) {
      throw new TypeError('Prompt data must originate from a server-labeled untrusted segment.');
    }
    const segment = descriptor.value;
    result.push(Object.freeze({
      kind: 'untrusted-content',
      sourceKind: segment.sourceKind,
      sourceRef: segment.sourceRef,
      trust: 'untrusted',
      contentType: 'data',
      text: segment.text,
    }));
  }
  return Object.freeze(result);
}
