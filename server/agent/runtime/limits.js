import { z } from 'zod';

export const RUNTIME_LIMITS = Object.freeze({
  maxGraphSteps: 12,
  maxModelCalls: 3,
  maxToolCalls: 4,
  maxRetries: 1,
  modelTimeoutMs: 15_000,
  toolTimeoutMs: 5_000,
  deadlineMs: 45_000,
  maxRequestBytes: 8_192,
  maxResponseBytes: 16_384,
  maxOutputTokens: 2_048,
});

const RuntimeLimitsSchema = z.strictObject({
  maxGraphSteps: z.literal(RUNTIME_LIMITS.maxGraphSteps),
  maxModelCalls: z.literal(RUNTIME_LIMITS.maxModelCalls),
  maxToolCalls: z.literal(RUNTIME_LIMITS.maxToolCalls),
  maxRetries: z.literal(RUNTIME_LIMITS.maxRetries),
  modelTimeoutMs: z.literal(RUNTIME_LIMITS.modelTimeoutMs),
  toolTimeoutMs: z.literal(RUNTIME_LIMITS.toolTimeoutMs),
  deadlineMs: z.literal(RUNTIME_LIMITS.deadlineMs),
  maxRequestBytes: z.literal(RUNTIME_LIMITS.maxRequestBytes),
  maxResponseBytes: z.literal(RUNTIME_LIMITS.maxResponseBytes),
  maxOutputTokens: z.literal(RUNTIME_LIMITS.maxOutputTokens),
});

export class RuntimeLimitError extends Error {
  constructor(limitName) {
    super('The request exceeds a fixed runtime limit.');
    this.name = 'RuntimeLimitError';
    this.code = 'RUNTIME_LIMIT_EXCEEDED';
    this.limitName = limitName;
  }
}

/**
 * Returns the approved immutable limits. Runtime limits are not configuration:
 * any caller-supplied setting fails closed, including values equal to defaults.
 */
export function parseRuntimeLimits(candidate) {
  if (candidate === undefined) return RUNTIME_LIMITS;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('Runtime limits cannot be overridden.');
  }

  if (Object.keys(candidate).length !== 0) {
    throw new TypeError('Runtime limits cannot be overridden.');
  }

  return RuntimeLimitsSchema.parse(RUNTIME_LIMITS);
}

function byteLength(value) {
  if (typeof value === 'string') return Buffer.byteLength(value, 'utf8');
  if (value instanceof Uint8Array) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  throw new TypeError('A UTF-8 string or byte buffer is required.');
}

function assertByteLimit(value, limitName) {
  const limit = RUNTIME_LIMITS[limitName];
  const size = byteLength(value);
  if (size > limit) throw new RuntimeLimitError(limitName);
  return size;
}

export function assertRequestBodyWithinLimit(body) {
  return assertByteLimit(body, 'maxRequestBytes');
}

export function assertResponseBodyWithinLimit(body) {
  return assertByteLimit(body, 'maxResponseBytes');
}

export function assertOutputTokenLimit(tokenCount) {
  if (!Number.isSafeInteger(tokenCount) || tokenCount < 0) {
    throw new TypeError('A non-negative integer token count is required.');
  }
  if (tokenCount > RUNTIME_LIMITS.maxOutputTokens) {
    throw new RuntimeLimitError('maxOutputTokens');
  }
  return tokenCount;
}
