import { z } from 'zod';
import { validateLocalDate } from '../../domain/read/contracts.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { parseRuntimeLimits } from '../runtime/limits.js';

assertServerOnlyRuntime();

export const SAFE_INPUT_FAILURES = Object.freeze({
  invalid: Object.freeze({ success: false, reason: 'invalid_input' }),
  oversized: Object.freeze({ success: false, reason: 'input_too_large' }),
  limitsUnavailable: Object.freeze({ success: false, reason: 'policy_unavailable' }),
});

const JsonScalarSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

function copyJsonValue(value, ancestors, remainingBytes) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    remainingBytes.value -= Buffer.byteLength(value, 'utf8');
    if (remainingBytes.value < 0) throw SAFE_INPUT_FAILURES.oversized;
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw SAFE_INPUT_FAILURES.invalid;
    return value;
  }
  if (typeof value !== 'object') throw SAFE_INPUT_FAILURES.invalid;
  if (ancestors.has(value)) throw SAFE_INPUT_FAILURES.invalid;
  ancestors.add(value);

  let copied;
  if (Array.isArray(value)) {
    if (value.length > remainingBytes.value) throw SAFE_INPUT_FAILURES.oversized;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors).filter(key => key !== 'length');
    if (keys.length !== value.length) throw SAFE_INPUT_FAILURES.invalid;
    copied = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[index];
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw SAFE_INPUT_FAILURES.invalid;
      }
      copied.push(copyJsonValue(descriptor.value, ancestors, remainingBytes));
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw SAFE_INPUT_FAILURES.invalid;
    if (Object.getOwnPropertySymbols(value).length > 0) throw SAFE_INPUT_FAILURES.invalid;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Object.keys(descriptors);
    if (names.length > remainingBytes.value) throw SAFE_INPUT_FAILURES.oversized;
    copied = Object.create(null);
    for (const key of names) {
      const descriptor = descriptors[key];
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        throw SAFE_INPUT_FAILURES.invalid;
      }
      remainingBytes.value -= Buffer.byteLength(key, 'utf8');
      if (remainingBytes.value < 0) throw SAFE_INPUT_FAILURES.oversized;
      copied[key] = copyJsonValue(descriptor.value, ancestors, remainingBytes);
    }
  }

  ancestors.delete(value);
  return copied;
}

function normalizeJsonDto(candidate, maxBytes) {
  const remainingBytes = { value: maxBytes };
  const copied = copyJsonValue(candidate, new WeakSet(), remainingBytes);
  const serialized = JSON.stringify(copied);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) return SAFE_INPUT_FAILURES.oversized;
  return copied;
}

/**
 * Validate a JSON DTO against its owning strict schema and the immutable
 * request-size limit selected by SPEC-002. Content strings are preserved as
 * data; schema/domain validators own any field-specific normalization.
 */
export function validateInputDto({ schema, candidate, runtimeLimits } = {}) {
  let limits;
  try {
    limits = parseRuntimeLimits(runtimeLimits);
    if (!Number.isSafeInteger(limits.maxRequestBytes) || limits.maxRequestBytes < 1) {
      return SAFE_INPUT_FAILURES.limitsUnavailable;
    }
  } catch {
    return SAFE_INPUT_FAILURES.limitsUnavailable;
  }

  if (!schema || typeof schema.safeParse !== 'function') return SAFE_INPUT_FAILURES.limitsUnavailable;

  let value;
  try {
    value = normalizeJsonDto(candidate, limits.maxRequestBytes);
  } catch (error) {
    return Object.values(SAFE_INPUT_FAILURES).includes(error)
      ? error
      : SAFE_INPUT_FAILURES.invalid;
  }
  if (Object.values(SAFE_INPUT_FAILURES).includes(value)) return value;

  try {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return SAFE_INPUT_FAILURES.invalid;
    return Object.freeze({ success: true, value: parsed.data });
  } catch {
    return SAFE_INPUT_FAILURES.invalid;
  }
}

/** Canonical Gregorian date validation shared by owning tool schemas. */
export function validateGuardrailLocalDate(value) {
  try {
    return validateLocalDate(value);
  } catch {
    throw new TypeError('Invalid local date.');
  }
}

export const JsonDtoScalarSchema = JsonScalarSchema;
