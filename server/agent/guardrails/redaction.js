import { z } from 'zod';
import { POLICY_OUTCOMES, POLICY_REASON_CATEGORIES } from './policy.js';
import { canonicalizePayload } from './canonical-action.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { RUNTIME_LIMITS } from '../runtime/limits.js';

assertServerOnlyRuntime();

export const REDACTED_VALUE = '[REDACTED]';

const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/;
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOG_FIELDS = Object.freeze([
  'eventId', 'correlationId', 'graphVersion', 'operationId', 'reasonCategory', 'decision',
  'elapsedMs', 'graphStepsUsed', 'modelCallsUsed', 'toolCallsUsed',
]);
const EVENT_FIELDS = Object.freeze([
  'eventId', 'correlationId', 'reasonCategory', 'eventClass', 'decision',
  'policyVersion', 'graphVersion', 'operationId', 'elapsedMs',
]);
const RESPONSE_FIELDS = new Set([
  'text', 'evidence', 'inference', 'missingEvidence', 'uncompletedActions',
  'completedActions', 'outcome', 'correlationId',
]);
const RESPONSE_OUTCOMES = new Set([
  'completed', 'needs-clarification', 'denied', 'refused', 'timed-out', 'cancelled', 'failed',
]);
const EVENT_CLASSES = new Set(['benign_validation_failure', 'suspicious_signal', 'confirmed_attack']);
const SENSITIVE_KEY_PARTS = Object.freeze([
  'authorization', 'accesstoken', 'refreshtoken', 'apikey', 'secret', 'password',
  'cookie', 'credential', 'prompt', 'reasoning', 'stacktrace', 'providerbody', 'rawerror',
  'transcript', 'sql', 'headers',
]);
const SAFE_ERROR_MESSAGES = Object.freeze({
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

function invalid(reason = 'invalid_value') {
  return Object.freeze({ success: false, reason });
}

function readJson(candidate) {
  try {
    const serialized = canonicalizePayload(candidate).serialized;
    if (Buffer.byteLength(serialized, 'utf8') > RUNTIME_LIMITS.maxResponseBytes) return null;
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, secrets) {
  let output = value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/\b(?:sk|rk|pk|sb_secret|sb_publishable)_[A-Za-z0-9_-]{8,}\b/gi, REDACTED_VALUE)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED_VALUE);
  for (const secret of secrets) output = output.split(secret).join(REDACTED_VALUE);
  return output;
}

function isSensitiveKey(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_KEY_PARTS.some(part => normalized.includes(part));
}

function project(value, allowlist, secrets, depth = 0) {
  if (depth > 32) return undefined;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return cleanText(value, secrets);
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    if (value.length > 256) return undefined;
    return value.map(item => project(item, allowlist, secrets, depth + 1)).filter(item => item !== undefined);
  }
  if (!isRecord(value) || !allowlist || typeof allowlist !== 'object') return undefined;

  const output = Object.create(null);
  for (const key of Object.keys(allowlist)) {
    if (isSensitiveKey(key) || !Object.hasOwn(value, key)) continue;
    const child = project(value[key], allowlist[key], secrets, depth + 1);
    if (child !== undefined) output[key] = child;
  }
  return output;
}

function projectRecord(source, allowedKeys, secrets) {
  const allowlist = Object.fromEntries(allowedKeys.map(key => [key, true]));
  return project(source, allowlist, secrets);
}

function readToken(value) {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : undefined;
}

function readUuid(value) {
  return typeof value === 'string' && SAFE_UUID.test(value) ? value : undefined;
}

function readElapsed(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function readCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function projectSmallTextList(value, secrets, maxItems = 64) {
  if (!Array.isArray(value) || value.length > maxItems) return undefined;
  const result = [];
  for (const item of value) {
    if (typeof item === 'string') result.push(cleanText(item, secrets));
    else if (isRecord(item) && typeof item.claimId === 'string' && typeof item.text === 'string') {
      result.push(Object.freeze({ claimId: cleanText(item.claimId, secrets), text: cleanText(item.text, secrets) }));
    } else return undefined;
  }
  return Object.freeze(result);
}

function projectActionList(value, secrets, statuses, requiresOutcomeReference = false) {
  if (!Array.isArray(value) || value.length > 64) return undefined;
  const result = [];
  for (const item of value) {
    if (!isRecord(item)) return undefined;
    const actionReference = readToken(item.actionReference);
    if (!actionReference || !statuses.has(item.status)) return undefined;
    const projected = {
      actionReference: cleanText(actionReference, secrets),
      status: item.status,
    };
    if (requiresOutcomeReference) {
      const safeOutcomeReference = readToken(item.safeOutcomeReference);
      if (!safeOutcomeReference || safeOutcomeReference.startsWith('uncertain:')) return undefined;
      projected.safeOutcomeReference = cleanText(safeOutcomeReference, secrets);
    }
    result.push(Object.freeze(projected));
  }
  return Object.freeze(result);
}

function validateToolAllowlist(candidate) {
  if (!isRecord(candidate)) throw new TypeError('A tool result field allowlist is required.');
  const result = Object.create(null);
  for (const [toolKey, fields] of Object.entries(candidate)) {
    if (!SAFE_TOKEN.test(toolKey) || !isRecord(fields)) throw new TypeError('A tool result schema entry is invalid.');
    const validateTree = (tree, depth = 0) => {
      if (depth > 8 || !isRecord(tree)) throw new TypeError('A tool result field tree is invalid.');
      const validated = Object.create(null);
      for (const [field, child] of Object.entries(tree)) {
        if (!SAFE_TOKEN.test(field) || isSensitiveKey(field)) throw new TypeError('A sensitive tool field cannot be allowlisted.');
        if (child === true) validated[field] = true;
        else validated[field] = validateTree(child, depth + 1);
      }
      return Object.freeze(validated);
    };
    result[toolKey] = validateTree(fields);
  }
  return Object.freeze(result);
}

/** Create separate allowlist projections for client responses and operational records. */
export function createGuardrailRedactor({ toolResultFieldAllowlist = {}, secretSentinels = [] } = {}) {
  const toolFields = validateToolAllowlist(toolResultFieldAllowlist);
  const secrets = z.array(z.string().min(4).max(512)).max(64).parse(secretSentinels);
  const validReasons = new Set(POLICY_REASON_CATEGORIES);
  const validDecisions = new Set(POLICY_OUTCOMES);

  function redactResponse(candidate) {
    const source = readJson(candidate);
    if (!isRecord(source)) return invalid('invalid_response');
    const output = Object.create(null);
    for (const [key, value] of Object.entries(source)) {
      if (!RESPONSE_FIELDS.has(key) || isSensitiveKey(key)) continue;
      if (key === 'text') {
        if (typeof value !== 'string') return invalid('invalid_response');
        output.text = cleanText(value, secrets);
      } else if (key === 'outcome') {
        if (!RESPONSE_OUTCOMES.has(value)) return invalid('invalid_response');
        output.outcome = value;
      } else if (key === 'correlationId') {
        const correlationId = readUuid(value);
        if (correlationId) output.correlationId = correlationId;
      } else if (key === 'evidence') {
        if (!Array.isArray(value) || value.length > RUNTIME_LIMITS.maxToolCalls) return invalid('invalid_response');
        const evidence = [];
        for (const item of value) {
          if (!isRecord(item)) return invalid('invalid_response');
          const toolName = readToken(item.toolName);
          const toolVersion = readToken(item.toolVersion);
          const policy = toolName && toolVersion ? toolFields[`${toolName}@${toolVersion}`] : null;
          if (!policy) return invalid('tool_result_schema_unavailable');
          const projected = projectRecord(item, ['toolName', 'toolVersion'], secrets);
          const data = project(item, policy, secrets);
          evidence.push(Object.freeze({ ...projected, ...data }));
        }
        output.evidence = Object.freeze(evidence);
      } else if (key === 'inference' || key === 'missingEvidence') {
        const list = projectSmallTextList(value, secrets);
        if (!list) return invalid('invalid_response');
        output[key] = list;
      } else if (key === 'uncompletedActions') {
        const list = projectActionList(value, secrets,
          new Set(['denied', 'failed', 'uncertain', 'not-executed']));
        if (!list) return invalid('invalid_response');
        output.uncompletedActions = list;
      } else if (key === 'completedActions') {
        const list = projectActionList(value, secrets,
          new Set(['executed', 'replayed']), true);
        if (!list) return invalid('invalid_response');
        output.completedActions = list;
      }
    }
    return Object.freeze({ success: true, value: Object.freeze(output) });
  }

  function redactError(candidate) {
    const source = readJson(candidate);
    if (!isRecord(source)) return invalid('invalid_error');
    const category = validReasons.has(source.category) ? source.category : 'POLICY_DENIED';
    const correlationId = readUuid(source.correlationId);
    const error = Object.freeze({ category, message: SAFE_ERROR_MESSAGES[category] });
    return Object.freeze({
      success: true,
      value: Object.freeze({ error, ...(correlationId ? { correlationId } : {}) }),
    });
  }

  function redactLog(candidate) {
    const source = readJson(candidate);
    if (!isRecord(source)) return invalid('invalid_log');
    const output = Object.create(null);
    for (const key of LOG_FIELDS) {
      if (!Object.hasOwn(source, key) || isSensitiveKey(key)) continue;
      const value = source[key];
      if (key === 'eventId' || key === 'correlationId') {
        const uuid = readUuid(value);
        if (uuid) output[key] = uuid;
      } else if (key === 'reasonCategory') {
        if (validReasons.has(value)) output[key] = value;
      } else if (key === 'decision') {
        if (validDecisions.has(value)) output[key] = value;
      } else if (key === 'elapsedMs') {
        const elapsed = readElapsed(value);
        if (elapsed !== undefined) output[key] = elapsed;
      } else if (key.endsWith('Used')) {
        const count = readCount(value);
        if (count !== undefined) output[key] = count;
      } else {
        const token = readToken(value);
        if (token) output[key] = token;
      }
    }
    return Object.freeze({ success: true, value: Object.freeze(output) });
  }

  function redactSecurityEvent(candidate) {
    const source = readJson(candidate);
    if (!isRecord(source)) return invalid('invalid_security_event');
    const output = Object.create(null);
    for (const key of EVENT_FIELDS) {
      if (!Object.hasOwn(source, key) || isSensitiveKey(key)) continue;
      const value = source[key];
      if (key === 'eventId' || key === 'correlationId') {
        const uuid = readUuid(value);
        if (uuid) output[key] = uuid;
      } else if (key === 'reasonCategory') {
        if (validReasons.has(value)) output[key] = value;
      } else if (key === 'eventClass') {
        if (EVENT_CLASSES.has(value)) output[key] = value;
      } else if (key === 'decision') {
        if (validDecisions.has(value)) output[key] = value;
      } else if (key === 'elapsedMs') {
        const elapsed = readElapsed(value);
        if (elapsed !== undefined) output[key] = elapsed;
      } else {
        const token = readToken(value);
        if (token) output[key] = token;
      }
    }
    return Object.freeze({ success: true, value: Object.freeze(output) });
  }

  return Object.freeze({ redactResponse, redactError, redactLog, redactSecurityEvent });
}
