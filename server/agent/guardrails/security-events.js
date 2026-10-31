import { randomUUID } from 'node:crypto';
import { POLICY_OUTCOMES, POLICY_REASON_CATEGORIES } from './policy.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const SECURITY_EVENT_CLASSES = Object.freeze([
  'benign_validation_failure',
  'suspicious_signal',
  'confirmed_attack',
]);

const validReasons = new Set(POLICY_REASON_CATEGORIES);
const validDecisions = new Set(POLICY_OUTCOMES);
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const SAFE_CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT_FIELDS = new Set([
  'reasonCategory', 'decision', 'eventType', 'classifierSignal', 'independentEvidence',
  'correlationId', 'policyVersion', 'graphVersion', 'operationId', 'elapsedMs',
]);

const SAFE_MESSAGES = Object.freeze({
  INVALID_INPUT: 'The proposed action is invalid.',
  CAPABILITY_DISABLED: 'The requested capability is unavailable.',
  POLICY_DENIED: 'The proposed action is not allowed.',
  POLICY_ALLOWED: 'The proposed action passed policy checks.',
  POLICY_UNAVAILABLE: 'The action policy is unavailable.',
  CONFIRMATION_REQUIRED: 'Explicit confirmation is required.',
  CONFIRMATION_INVALID: 'The confirmation is no longer valid.',
  STALE_PRECONDITION: 'The action state changed and must be reviewed.',
  IDEMPOTENCY_CONFLICT: 'The action outcome could not be safely verified.',
  BUDGET_EXHAUSTED: 'The request limit has been reached.',
  DEPENDENCY_UNAVAILABLE: 'A required security check is unavailable.',
});

function safeToken(value) {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined;
}

function safeElapsed(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readSafeInput(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return Object.create(null);
  try {
    const prototype = Object.getPrototypeOf(candidate);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(candidate).length > 0) return Object.create(null);
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const safe = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return Object.create(null);
      if (INPUT_FIELDS.has(key)) safe[key] = descriptor.value;
    }
    return safe;
  } catch {
    return Object.create(null);
  }
}

/**
 * Build allowlisted security events. Confirmed attack events require a
 * separately injected independent-evidence verifier; classifier output alone
 * is always classified as a suspicious signal.
 */
export function createSecurityEventFactory({ independentEvidenceVerifier = () => false } = {}) {
  if (typeof independentEvidenceVerifier !== 'function') {
    throw new TypeError('An independent-evidence verifier is required.');
  }

  function create(candidate = {}) {
    const input = readSafeInput(candidate);
    const reasonCategory = validReasons.has(input.reasonCategory) ? input.reasonCategory : 'POLICY_DENIED';
    const decision = validDecisions.has(input.decision) ? input.decision : 'DENY';
    let eventClass = 'benign_validation_failure';

    if (input.classifierSignal === true || input.eventType === 'suspicious_signal') {
      eventClass = 'suspicious_signal';
    } else if (input.eventType === 'confirmed_attack') {
      try {
        eventClass = independentEvidenceVerifier(input.independentEvidence) === true
          ? 'confirmed_attack'
          : 'suspicious_signal';
      } catch {
        eventClass = 'suspicious_signal';
      }
    }

    const suppliedCorrelation = input.correlationId;
    const correlationId = typeof suppliedCorrelation === 'string' && SAFE_CORRELATION_ID.test(suppliedCorrelation)
      ? suppliedCorrelation
      : randomUUID();
    const event = {
      eventId: randomUUID(),
      correlationId,
      reasonCategory,
      eventClass,
      decision,
    };

    const policyVersion = safeToken(input.policyVersion);
    const graphVersion = safeToken(input.graphVersion);
    const operationId = safeToken(input.operationId);
    const elapsedMs = safeElapsed(input.elapsedMs);
    if (policyVersion) event.policyVersion = policyVersion;
    if (graphVersion) event.graphVersion = graphVersion;
    if (operationId) event.operationId = operationId;
    if (elapsedMs !== undefined) event.elapsedMs = elapsedMs;

    return Object.freeze(event);
  }

  return Object.freeze({ create });
}

export const securityEventFactory = createSecurityEventFactory();

export function createSafeGuardrailError(candidate = {}) {
  const input = readSafeInput(candidate);
  const { reasonCategory, correlationId } = input;
  const category = validReasons.has(reasonCategory) ? reasonCategory : 'POLICY_DENIED';
  const safeCorrelationId = typeof correlationId === 'string' && SAFE_CORRELATION_ID.test(correlationId)
    ? correlationId
    : randomUUID();
  return Object.freeze({
    error: Object.freeze({ category, message: SAFE_MESSAGES[category] }),
    correlationId: safeCorrelationId,
  });
}
