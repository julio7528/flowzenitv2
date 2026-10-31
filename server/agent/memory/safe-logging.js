import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set([
  'access_denied',
  'history_read',
  'message_append',
  'checkpoint_saved',
  'checkpoint_resume',
  'context_built',
  'deletion',
  'retention',
]);
const OUTCOMES = new Set([
  'success',
  'denied',
  'expired',
  'deleted',
  'deleting',
  'invalid',
  'not_found',
  'conflict',
  'corrupt',
  'incompatible',
  'ledger_unresolved',
  'unavailable',
  'failed',
  'skipped',
]);
const POLICY_VERSION = 'dec005-spec003-v1';
const GRAPH_VERSIONS = new Set(['agent-turn-v1']);

function emptyEvent() {
  return Object.freeze({});
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownDataValue(source, key) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return undefined;
    return descriptor.value;
  } catch {
    return undefined;
  }
}

function boundedInteger(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

/**
 * Retain only SPEC-003 operational metadata. Conversation IDs, messages,
 * prompts, summaries, checkpoint bytes, ledger references, tool payloads,
 * arbitrary error text, and caller-supplied extras are intentionally omitted.
 */
export function createSafeMemoryEvent(input = {}) {
  if (!isPlainRecord(input)) return emptyEvent();

  const event = {};
  const eventType = ownDataValue(input, 'eventType');
  const outcome = ownDataValue(input, 'outcome');
  const correlationId = ownDataValue(input, 'correlationId');
  const elapsedMs = ownDataValue(input, 'elapsedMs');
  const pageSize = ownDataValue(input, 'pageSize');
  const messageCount = ownDataValue(input, 'messageCount');
  const checkpointVersion = ownDataValue(input, 'checkpointVersion');
  const graphVersion = ownDataValue(input, 'graphVersion');
  const policyVersion = ownDataValue(input, 'policyVersion');

  if (typeof eventType === 'string' && EVENT_TYPES.has(eventType)) event.eventType = eventType;
  if (typeof outcome === 'string' && OUTCOMES.has(outcome)) event.outcome = outcome;
  if (typeof correlationId === 'string' && CORRELATION_ID_PATTERN.test(correlationId)) {
    event.correlationId = correlationId;
  }
  if (boundedInteger(elapsedMs, 0, 45_000)) event.elapsedMs = elapsedMs;
  if (boundedInteger(pageSize, 1, 100)) event.pageSize = pageSize;
  if (boundedInteger(messageCount, 0, 100)) event.messageCount = messageCount;
  if (boundedInteger(checkpointVersion, 1, 99)) event.checkpointVersion = checkpointVersion;
  if (typeof graphVersion === 'string' && GRAPH_VERSIONS.has(graphVersion)) event.graphVersion = graphVersion;
  if (policyVersion === POLICY_VERSION) event.policyVersion = policyVersion;

  if (Object.keys(event).length === 0) return emptyEvent();
  return Object.freeze(event);
}

/**
 * Send only the sanitized event to an injected logger. Logger errors are
 * swallowed so error text cannot escape through a logging fallback.
 */
export function writeSafeMemoryEvent(logger, input) {
  const event = createSafeMemoryEvent(input);
  if (Object.keys(event).length === 0 || !logger || typeof logger !== 'object') return false;

  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(logger, 'info');
  } catch {
    return false;
  }
  const write = descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  if (typeof write !== 'function') return false;
  try {
    write.call(logger, event);
    return true;
  } catch {
    return false;
  }
}
