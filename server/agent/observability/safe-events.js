const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOL_VERSION_PATTERN = /^\d{1,3}(?:\.\d{1,3}){0,2}$/;

const GRAPH_VERSIONS = new Set(['agent-turn-v1']);
const NODE_NAMES = new Set([
  'validate_request',
  'decide_access',
  'prepare_context',
  'invoke_model',
  'normalize_model_result',
  'validate_proposal',
  'authorize_tool',
  'execute_tool',
  'compose_response',
  'finish',
]);

const TOOL_NAMES = new Set([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

const OUTCOME_CATEGORIES = new Set([
  'completed',
  'needs-clarification',
  'denied',
  'refused',
  'timed-out',
  'cancelled',
  'failed',
  'transient',
  'permanent',
  'timeout',
  'configuration',
  'unsupported_response',
  'invalid_proposal',
  'not_found',
  'dependency_failure',
  'invalid_request',
  'capability_disabled',
  'deadline_exceeded',
  'budget_exhausted',
  'unknown',
]);

const BOUNDED_COUNTS = Object.freeze({
  graphSteps: 12,
  modelCalls: 3,
  toolCalls: 4,
  retryCount: 1,
});

function emptySafeEvent() {
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

function ownDataValue(source, field) {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return undefined;
    return descriptor.value;
  } catch {
    return undefined;
  }
}

function boundedInteger(value, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

/**
 * Create an immutable operational event using only SPEC-approved metadata.
 * This function does not log, serialize, or retain the supplied input.
 */
export function createSafeAgentEvent(input = {}) {
  if (!isPlainRecord(input)) return emptySafeEvent();

  const event = {};
  const correlationId = ownDataValue(input, 'correlationId');
  const graphVersion = ownDataValue(input, 'graphVersion');
  const nodeName = ownDataValue(input, 'nodeName');
  const toolName = ownDataValue(input, 'toolName');
  const toolVersion = ownDataValue(input, 'toolVersion');
  const outcomeCategory = ownDataValue(input, 'outcomeCategory');
  const elapsedMs = ownDataValue(input, 'elapsedMs');

  if (typeof correlationId === 'string' && CORRELATION_ID_PATTERN.test(correlationId)) {
    event.correlationId = correlationId;
  }
  if (typeof graphVersion === 'string' && GRAPH_VERSIONS.has(graphVersion)) {
    event.graphVersion = graphVersion;
  }
  if (typeof nodeName === 'string' && NODE_NAMES.has(nodeName)) event.nodeName = nodeName;
  if (typeof toolName === 'string' && TOOL_NAMES.has(toolName)) event.toolName = toolName;
  if (typeof toolVersion === 'string' && TOOL_VERSION_PATTERN.test(toolVersion)) {
    event.toolVersion = toolVersion;
  }
  if (typeof outcomeCategory === 'string' && OUTCOME_CATEGORIES.has(outcomeCategory)) {
    event.outcomeCategory = outcomeCategory;
  }
  if (boundedInteger(elapsedMs, 45_000)) event.elapsedMs = elapsedMs;

  for (const [field, maximum] of Object.entries(BOUNDED_COUNTS)) {
    const value = ownDataValue(input, field);
    if (boundedInteger(value, maximum)) event[field] = value;
  }

  return Object.freeze(event);
}
