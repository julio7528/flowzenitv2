import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPERATION_ID_PATTERN = /^[a-z][a-z0-9_.:-]{0,63}$/i;
const SENSITIVE_OPERATION_ID = /(secret|credential|token|password|cookie|authorization|prompt|transcript|private|record|row|bearer|api[-_.]?key)/i;
const OUTCOMES = new Set([
  'success',
  'empty',
  'invalid',
  'dependency_unavailable',
  'capability_disabled',
  'denied',
  'retry',
  'internal',
]);
const DEPENDENCIES = new Set([
  'supabase',
  'deepseek',
  'gemini',
  'langsmith',
  'runtime',
  'internal',
]);

export function createRequestId() {
  return randomUUID();
}

export function isValidRequestId(value) {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function ownDataValue(source, key) {
  if (!source || typeof source !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function safeOperationId(value) {
  if (typeof value !== 'string' || !OPERATION_ID_PATTERN.test(value)) return undefined;
  if (SENSITIVE_OPERATION_ID.test(value)) return undefined;
  return value;
}

export function createSafeLogContext(input = {}) {
  const requestId = ownDataValue(input, 'requestId');
  const context = {
    requestId: isValidRequestId(requestId) ? requestId : createRequestId(),
  };

  const operationId = safeOperationId(ownDataValue(input, 'operationId'));
  const outcome = ownDataValue(input, 'outcome');
  const durationMs = ownDataValue(input, 'durationMs');
  const dependency = ownDataValue(input, 'dependency');

  if (operationId) context.operationId = operationId;
  if (typeof outcome === 'string' && OUTCOMES.has(outcome)) context.outcome = outcome;
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) {
    context.durationMs = durationMs;
  }
  if (typeof dependency === 'string' && DEPENDENCIES.has(dependency)) {
    context.dependency = dependency;
  }

  return context;
}
