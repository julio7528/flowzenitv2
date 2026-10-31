import { createHash, randomUUID } from 'node:crypto';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { canonicalizeActionValue, canonicalizePayload, canonicalizeTarget, fingerprintPreconditions } from './canonical-action.js';

assertServerOnlyRuntime();

export const CONFIRMATION_SUMMARY_VERSION = '1.0.0';
const OPERATION_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const GRANT_FIELDS = new Set([
  'conversationRef', 'operationName', 'operationVersion', 'target', 'payload',
  'preconditions', 'issuedAt', 'expiresAt', 'policyVersion',
]);
const ACTION_CANDIDATE_FIELDS = new Set([
  'conversationRef', 'operationName', 'operationVersion', 'target', 'payload',
]);
const issuedGrantBindings = new WeakSet();

function assertOperationIdentity(operationName, operationVersion) {
  if (typeof operationName !== 'string' || !OPERATION_IDENTIFIER.test(operationName)
    || typeof operationVersion !== 'string' || !SAFE_VERSION.test(operationVersion)) {
    throw new TypeError('A validated operation identity is required.');
  }
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function readGrantInput(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  try {
    const prototype = Object.getPrototypeOf(candidate);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(candidate).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const values = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!GRANT_FIELDS.has(key) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
      values[key] = descriptor.value;
    }
    return values;
  } catch {
    return null;
  }
}

function readActionCandidate(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  try {
    const prototype = Object.getPrototypeOf(candidate);
    if ((prototype !== Object.prototype && prototype !== null)
      || Object.getOwnPropertySymbols(candidate).length > 0) return null;
    const descriptors = Object.getOwnPropertyDescriptors(candidate);
    const action = Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!ACTION_CANDIDATE_FIELDS.has(key) || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return null;
      action[key] = descriptor.value;
    }
    if (typeof action.conversationRef !== 'string' || action.conversationRef.length === 0) return null;
    assertOperationIdentity(action.operationName, action.operationVersion);
    return action;
  } catch {
    return null;
  }
}

function findApprovedConfirmationEntry(matrix, operationKey) {
  if (matrix === null || typeof matrix !== 'object' || Array.isArray(matrix)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(matrix);
    const version = descriptors.version?.value;
    const status = descriptors.status?.value;
    const entries = descriptors.entries?.value;
    if (!Object.hasOwn(descriptors.version || {}, 'value') || typeof version !== 'string'
      || version.length === 0 || status !== 'approved' || !entries
      || typeof entries !== 'object' || Array.isArray(entries)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(entries, operationKey);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return { version, entry: null };
    const entry = descriptor.value;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const entryDescriptors = Object.getOwnPropertyDescriptors(entry);
    if (Object.values(entryDescriptors).some(item => !Object.hasOwn(item, 'value'))
      || entry.outcome !== 'ALLOW' || entry.confirmationRequired !== true) return { version, entry: null };
    return { version, entry };
  } catch {
    return null;
  }
}

/** Build a canonical review request. This function grants no approval and runs no handler. */
export function createConfirmationRequestSummary({
  operationName,
  operationVersion,
  target,
  payload,
  preconditions,
  policyVersion,
  displayFields = {},
} = {}) {
  assertOperationIdentity(operationName, operationVersion);
  if (typeof policyVersion !== 'string' || !SAFE_VERSION.test(policyVersion)) {
    throw new TypeError('An approved policy version is required.');
  }

  const canonicalTarget = canonicalizeTarget(target);
  const targetFingerprint = createHash('sha256').update(canonicalTarget, 'utf8').digest('hex');
  const payloadHash = canonicalizePayload(payload).sha256;
  const preconditionFingerprint = fingerprintPreconditions(preconditions);
  const canonicalDisplayFields = deepFreeze(JSON.parse(canonicalizeActionValue(displayFields)));

  return Object.freeze({
    version: CONFIRMATION_SUMMARY_VERSION,
    state: 'confirmation_required',
    operation: Object.freeze({ name: operationName, version: operationVersion }),
    target: deepFreeze(JSON.parse(canonicalTarget)),
    targetFingerprint,
    payloadHash,
    preconditionFingerprint,
    policyVersion,
    displayFields: canonicalDisplayFields,
    notice: 'This action has not been approved or executed.',
  });
}

/** Create a server-owned action binding without choosing grant persistence or TTL policy. */
export function createConfirmationGrantIssuer({ idempotencyKeyPort } = {}) {
  if (!idempotencyKeyPort || typeof idempotencyKeyPort.createKey !== 'function') {
    throw new TypeError('A server idempotency-key port is required.');
  }

  async function issue(candidate) {
    const action = readGrantInput(candidate);
    if (!action || typeof action.conversationRef !== 'string' || action.conversationRef.length === 0
      || !Number.isSafeInteger(action.issuedAt) || !Number.isSafeInteger(action.expiresAt)
      || action.expiresAt <= action.issuedAt
      || typeof action.policyVersion !== 'string' || !SAFE_VERSION.test(action.policyVersion)) {
      throw new TypeError('A validated action and externally selected expiry are required.');
    }
    assertOperationIdentity(action.operationName, action.operationVersion);

    const canonicalTarget = canonicalizeTarget(action.target);
    const payloadHash = canonicalizePayload(action.payload).sha256;
    const preconditionFingerprint = fingerprintPreconditions(action.preconditions);
    const actionHash = canonicalizePayload({
      conversationRef: action.conversationRef,
      operationName: action.operationName,
      operationVersion: action.operationVersion,
      canonicalTarget,
      payloadHash,
      preconditionFingerprint,
      policyVersion: action.policyVersion,
    }).sha256;

    let idempotencyKey;
    try {
      idempotencyKey = await idempotencyKeyPort.createKey(Object.freeze({ actionHash }));
    } catch {
      throw new TypeError('The server idempotency-key port is unavailable.');
    }
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
      throw new TypeError('The server idempotency-key port returned no key.');
    }

    const grant = Object.freeze({
      grantRef: randomUUID(),
      conversationRef: action.conversationRef,
      operationName: action.operationName,
      operationVersion: action.operationVersion,
      canonicalTarget,
      payloadHash,
      preconditionFingerprint,
      issuedAt: action.issuedAt,
      expiresAt: action.expiresAt,
      nonce: randomUUID(),
      policyVersion: action.policyVersion,
      idempotencyKey,
      actionHash,
    });
    issuedGrantBindings.add(grant);
    return grant;
  }

  return Object.freeze({ issue });
}

export function isActionBoundConfirmationGrant(value) {
  return value !== null && typeof value === 'object' && issuedGrantBindings.has(value);
}

/** Revalidate an issued grant against current server policy and domain state. */
export function createConfirmationGrantValidator({
  accessGate,
  matrixProvider,
  actionValidator,
  currentPreconditionsProvider,
  clock = Date,
} = {}) {
  const closedGate = { allowsAction: async () => false };
  const effectiveGate = accessGate || closedGate;
  if (typeof effectiveGate.allowsAction !== 'function'
    || typeof matrixProvider !== 'function'
    || typeof actionValidator !== 'function'
    || typeof currentPreconditionsProvider !== 'function'
    || !clock || typeof clock.now !== 'function') {
    throw new TypeError('Server confirmation validation dependencies are required.');
  }

  async function validate({ grant, actionCandidate } = {}) {
    if (!isActionBoundConfirmationGrant(grant)) return Object.freeze({ valid: false, reason: 'invalid' });
    const candidate = readActionCandidate(actionCandidate);
    if (!candidate) return Object.freeze({ valid: false, reason: 'invalid' });

    let now;
    try { now = clock.now(); } catch { return Object.freeze({ valid: false, reason: 'unavailable' }); }
    if (!Number.isSafeInteger(now)) return Object.freeze({ valid: false, reason: 'unavailable' });
    if (now < grant.issuedAt || now >= grant.expiresAt) return Object.freeze({ valid: false, reason: 'expired' });

    let canonicalInputTarget;
    try { canonicalInputTarget = canonicalizeTarget(candidate.target); }
    catch { return Object.freeze({ valid: false, reason: 'invalid' }); }
    let accessAllowed = false;
    try {
      accessAllowed = await effectiveGate.allowsAction(Object.freeze({
        operationName: candidate.operationName,
        operationVersion: candidate.operationVersion,
        canonicalTarget: canonicalInputTarget,
      }));
    } catch {
      return Object.freeze({ valid: false, reason: 'unavailable' });
    }
    if (accessAllowed !== true) return Object.freeze({ valid: false, reason: 'access_denied' });

    let validated;
    try { validated = await actionValidator(candidate); }
    catch { return Object.freeze({ valid: false, reason: 'unavailable' }); }
    if (!validated || validated.valid !== true
      || validated.operationName !== candidate.operationName
      || validated.operationVersion !== candidate.operationVersion
      || typeof validated.capability !== 'string' || validated.capability.length === 0
      || typeof validated.conversationRef !== 'string' || validated.conversationRef.length === 0) {
      return Object.freeze({ valid: false, reason: 'invalid' });
    }

    let canonicalTarget;
    let payloadHash;
    try {
      canonicalTarget = canonicalizeTarget(validated.target);
      payloadHash = canonicalizePayload(validated.payload).sha256;
    } catch {
      return Object.freeze({ valid: false, reason: 'invalid' });
    }
    if (canonicalTarget !== canonicalInputTarget) return Object.freeze({ valid: false, reason: 'action_changed' });

    let matrix;
    try { matrix = await matrixProvider(); }
    catch { return Object.freeze({ valid: false, reason: 'unavailable' }); }
    const matrixResult = findApprovedConfirmationEntry(matrix, `${candidate.operationName}@${candidate.operationVersion}`);
    if (!matrixResult || !matrixResult.entry) return Object.freeze({ valid: false, reason: 'policy_changed' });
    if (matrixResult.version !== grant.policyVersion) return Object.freeze({ valid: false, reason: 'policy_changed' });

    let currentPreconditions;
    try {
      currentPreconditions = await currentPreconditionsProvider(Object.freeze({
        capability: validated.capability,
        operationName: validated.operationName,
        operationVersion: validated.operationVersion,
        canonicalTarget,
        payloadHash,
      }));
    } catch {
      return Object.freeze({ valid: false, reason: 'unavailable' });
    }
    if (!currentPreconditions || currentPreconditions.available !== true
      || !Object.hasOwn(currentPreconditions, 'snapshot')) {
      return Object.freeze({ valid: false, reason: 'unavailable' });
    }
    let preconditionFingerprint;
    try { preconditionFingerprint = fingerprintPreconditions(currentPreconditions.snapshot); }
    catch { return Object.freeze({ valid: false, reason: 'unavailable' }); }

    const matches = grant.conversationRef === validated.conversationRef
      && grant.operationName === validated.operationName
      && grant.operationVersion === validated.operationVersion
      && grant.canonicalTarget === canonicalTarget
      && grant.payloadHash === payloadHash
      && grant.preconditionFingerprint === preconditionFingerprint
      && grant.policyVersion === matrixResult.version;
    if (!matches) {
      return Object.freeze({
        valid: false,
        reason: grant.preconditionFingerprint !== preconditionFingerprint ? 'stale' : 'action_changed',
      });
    }

    return Object.freeze({
      valid: true,
      reason: 'valid',
      policyVersion: matrixResult.version,
      actionHash: grant.actionHash,
    });
  }

  return Object.freeze({ validate });
}
