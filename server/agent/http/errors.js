import {
  SAFE_PROVIDER_ERROR_CATEGORIES,
  TERMINAL_OUTCOMES,
} from '../runtime/state.js';

export { SAFE_PROVIDER_ERROR_CATEGORIES, TERMINAL_OUTCOMES };

/** Safe, bounded categories used to classify tool failures without exposing raw errors. */
export const SAFE_TOOL_ERROR_CATEGORIES = Object.freeze([
  'invalid_proposal',
  'not_found',
  'denied',
  'timeout',
  'cancelled',
  'dependency_failure',
  'unknown',
]);

/** Safe, bounded categories used to classify orchestration/runtime failures. */
export const SAFE_RUNTIME_ERROR_CATEGORIES = Object.freeze([
  'invalid_request',
  'capability_disabled',
  'deadline_exceeded',
  'budget_exhausted',
  'cancelled',
  'configuration',
  'dependency_failure',
  'unknown',
]);

export const SAFE_ERROR_CATEGORIES = Object.freeze({
  provider: SAFE_PROVIDER_ERROR_CATEGORIES,
  tool: SAFE_TOOL_ERROR_CATEGORIES,
  runtime: SAFE_RUNTIME_ERROR_CATEGORIES,
});

export const SAFE_ERROR_CODES = Object.freeze({
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INVALID_REQUEST: 'INVALID_REQUEST',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  CAPABILITY_DISABLED: 'CAPABILITY_DISABLED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/**
 * HTTP mapping approved by SPEC-002@2 plan.md. Every valid turn has exactly one
 * of the seven terminal outcomes; transport and closed-gate errors use the
 * separate safe error-code mapping below.
 */
export const HTTP_STATUS_BY_OUTCOME = Object.freeze({
  completed: 200,
  'needs-clarification': 200,
  denied: 403,
  refused: 200,
  'timed-out': 504,
  cancelled: 200,
  failed: 500,
});

export const HTTP_STATUS_BY_ERROR_CODE = Object.freeze({
  [SAFE_ERROR_CODES.METHOD_NOT_ALLOWED]: 405,
  [SAFE_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE]: 415,
  [SAFE_ERROR_CODES.INVALID_REQUEST]: 400,
  [SAFE_ERROR_CODES.PAYLOAD_TOO_LARGE]: 413,
  [SAFE_ERROR_CODES.CAPABILITY_DISABLED]: 403,
  [SAFE_ERROR_CODES.INTERNAL_ERROR]: 500,
});

const TERMINAL_OUTCOME_BY_ERROR_CATEGORY = Object.freeze({
  provider: Object.freeze({
    transient: 'failed',
    permanent: 'failed',
    timeout: 'timed-out',
    cancelled: 'cancelled',
    configuration: 'failed',
    unsupported_response: 'failed',
    unknown: 'failed',
  }),
  tool: Object.freeze({
    invalid_proposal: 'needs-clarification',
    not_found: 'failed',
    denied: 'denied',
    timeout: 'timed-out',
    cancelled: 'cancelled',
    dependency_failure: 'failed',
    unknown: 'failed',
  }),
  runtime: Object.freeze({
    invalid_request: 'failed',
    capability_disabled: 'denied',
    deadline_exceeded: 'timed-out',
    budget_exhausted: 'timed-out',
    cancelled: 'cancelled',
    configuration: 'failed',
    dependency_failure: 'failed',
    unknown: 'failed',
  }),
});

const SAFE_ERROR_MESSAGES = Object.freeze({
  [SAFE_ERROR_CODES.METHOD_NOT_ALLOWED]: 'Method not allowed',
  [SAFE_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE]: 'Unsupported content type',
  [SAFE_ERROR_CODES.INVALID_REQUEST]: 'Invalid request',
  [SAFE_ERROR_CODES.PAYLOAD_TOO_LARGE]: 'Payload too large',
  [SAFE_ERROR_CODES.CAPABILITY_DISABLED]: 'Capability unavailable',
  [SAFE_ERROR_CODES.INTERNAL_ERROR]: 'Request could not be completed',
});

const VALID_TERMINAL_OUTCOMES = new Set(TERMINAL_OUTCOMES);
const VALID_ERROR_CODES = new Set(Object.values(SAFE_ERROR_CODES));
const SAFE_CORRELATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Return the status for a terminal outcome; malformed outcomes fail closed. */
export function httpStatusForOutcome(outcome) {
  if (!VALID_TERMINAL_OUTCOMES.has(outcome)) return HTTP_STATUS_BY_OUTCOME.failed;
  return HTTP_STATUS_BY_OUTCOME[outcome];
}

/** Map only allowlisted provider/tool/runtime categories to a terminal outcome. */
export function terminalOutcomeForErrorCategory(source, category) {
  const sourceCategories = SAFE_ERROR_CATEGORIES[source];
  if (!sourceCategories?.includes(category)) return 'failed';
  return TERMINAL_OUTCOME_BY_ERROR_CATEGORY[source][category] ?? 'failed';
}

/** Resolve the approved HTTP status for an allowlisted error category. */
export function httpStatusForErrorCategory(source, category) {
  return httpStatusForOutcome(terminalOutcomeForErrorCategory(source, category));
}

/** Return the status for a known public error code without reflecting unknown input. */
export function httpStatusForErrorCode(code) {
  if (!VALID_ERROR_CODES.has(code)) return 500;
  return HTTP_STATUS_BY_ERROR_CODE[code];
}

/**
 * Build a public error envelope from an allowlisted code only. Raw exceptions,
 * messages, provider payloads, and tool details are intentionally not accepted.
 * The caller supplies the server-generated correlation ID.
 */
export function createSafeErrorResponse(code, correlationId) {
  const safeCode = VALID_ERROR_CODES.has(code) ? code : SAFE_ERROR_CODES.INTERNAL_ERROR;
  const safeCorrelationId = typeof correlationId === 'string' && SAFE_CORRELATION_ID.test(correlationId)
    ? correlationId
    : 'unavailable';

  return Object.freeze({
    status: HTTP_STATUS_BY_ERROR_CODE[safeCode],
    body: Object.freeze({
      error: Object.freeze({
        code: safeCode,
        message: SAFE_ERROR_MESSAGES[safeCode],
      }),
      correlationId: safeCorrelationId,
    }),
  });
}
