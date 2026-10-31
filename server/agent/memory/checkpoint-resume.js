import { CHECKPOINT_NOT_FOUND, assertCheckpointPort, assertExecutionLedgerPort, loadCheckpoint } from '../persistence/ports.js';
import { validateConversationId, validateTurnId } from './conversation-contracts.js';
import {
  CHECKPOINT_ENVELOPE_VERSION,
  CHECKPOINT_MAX_AGE_MS,
  createCheckpointEnvelope,
  validateCheckpointEnvelope,
} from './checkpoint-envelope.js';
import { memoryAccessGate } from './access-gate.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const CHECKPOINT_RESUME_OUTCOMES = Object.freeze([
  'READY',
  'NOT_FOUND',
  'INVALID_ID',
  'CORRUPT',
  'INCOMPATIBLE_GRAPH',
  'INCOMPATIBLE_STATE',
  'INCOMPATIBLE_SERIALIZER',
  'EXPIRED',
  'LEDGER_UNRESOLVED',
  'ACCESS_DISABLED',
  'CONVERSATION_DELETING',
  'DEPENDENCY_UNAVAILABLE',
]);

const POLICY_VERSION = 'dec005-spec003-v1';
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SAFE_LEDGER_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_OUTCOME_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const ACCESS_DISABLED = Object.freeze({ outcome: 'ACCESS_DISABLED' });
const DEPENDENCY_UNAVAILABLE = Object.freeze({ outcome: 'DEPENDENCY_UNAVAILABLE' });
const INVALID_ID = Object.freeze({ outcome: 'INVALID_ID' });
const CORRUPT = Object.freeze({ outcome: 'CORRUPT' });
const NOT_FOUND = Object.freeze({ outcome: 'NOT_FOUND' });
const MISSING = Symbol('missing');

export class CheckpointResumeError extends Error {
  constructor(code = 'DEPENDENCY_UNAVAILABLE') {
    super(code === 'INVALID_ID' ? 'Checkpoint request is invalid.' : 'Checkpoint dependency is unavailable.');
    this.name = 'CheckpointResumeError';
    this.code = code;
  }
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function ownValue(record, key) {
  if (!isPlainRecord(record)) return MISSING;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor) return MISSING;
    return Object.hasOwn(descriptor, 'value') ? descriptor.value : MISSING;
  } catch {
    return MISSING;
  }
}

function textIdentifier(value, { optional = false, allowEmpty = false } = {}) {
  if (optional && (value === undefined || value === MISSING)) return '';
  if (allowEmpty && value === '') return '';
  return typeof value === 'string' && OPAQUE_ID_PATTERN.test(value) ? value : null;
}

function checkpointText(value, { allowEmpty = false } = {}) {
  return typeof value === 'string'
    && (allowEmpty || value.length > 0)
    && Buffer.byteLength(value, 'utf8') <= 256
    && !value.includes('\0')
    ? value
    : null;
}

function isAccessDenied(value) {
  const outcome = ownValue(value, 'outcome');
  const error = ownValue(value, 'error');
  return outcome === 'ACCESS_DISABLED' || ownValue(error, 'code') === 'ACCESS_DISABLED';
}

async function runThroughGate(accessGate, operation) {
  if (!accessGate || typeof accessGate.run !== 'function') return { allowed: false };
  try {
    const value = await accessGate.run(operation);
    if (isAccessDenied(value)) return { allowed: false };
    return { allowed: true, value };
  } catch {
    return { allowed: true, failed: true };
  }
}

function normalizeNow(now) {
  let value;
  try {
    value = now();
  } catch {
    throw new CheckpointResumeError();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new CheckpointResumeError();
  return date;
}

function parseCheckpointIdentityRequest(value, { payloadRequired = false } = {}) {
  if (!isPlainRecord(value)) return null;
  try {
    const conversationId = validateConversationId(ownValue(value, 'conversationId'));
    const turnId = validateTurnId(ownValue(value, 'turnId'));
    const correlationId = validateTurnId(ownValue(value, 'correlationId'));
    const checkpointNsValue = ownValue(value, 'checkpointNs');
    const checkpointIdValue = ownValue(value, 'checkpointId');
    const parentCheckpointIdValue = ownValue(value, 'parentCheckpointId');
    const checkpointNs = checkpointNsValue === MISSING ? '' : checkpointText(checkpointNsValue, { allowEmpty: true });
    const checkpointId = checkpointText(checkpointIdValue);
    const parentCheckpointId = parentCheckpointIdValue === MISSING || parentCheckpointIdValue === null
      ? null
      : checkpointText(parentCheckpointIdValue);
    if (checkpointNs === null || checkpointId === null || parentCheckpointIdValue !== MISSING
      && parentCheckpointIdValue !== null && parentCheckpointId === null) return null;

    const request = { conversationId, checkpointNs, checkpointId, parentCheckpointId, turnId, correlationId };
    if (payloadRequired) {
      const checkpointPayload = ownValue(value, 'checkpointPayload');
      const ledgerRefs = ownValue(value, 'ledgerRefs');
      if (checkpointPayload === MISSING || checkpointPayload === null
        || !Array.isArray(ledgerRefs === MISSING ? [] : ledgerRefs)) return null;
      request.checkpointPayload = checkpointPayload;
      request.ledgerRefs = ledgerRefs === MISSING ? [] : ledgerRefs;
    }
    return Object.freeze(request);
  } catch {
    return null;
  }
}

function normalizeEnvelopeRow(row, request) {
  if (!isPlainRecord(row)) return null;
  const conversationId = ownValue(row, 'conversationId') !== MISSING
    ? ownValue(row, 'conversationId') : ownValue(row, 'thread_id');
  const checkpointNs = ownValue(row, 'checkpointNs') !== MISSING
    ? ownValue(row, 'checkpointNs') : ownValue(row, 'checkpoint_ns');
  const checkpointId = ownValue(row, 'checkpointId') !== MISSING
    ? ownValue(row, 'checkpointId') : ownValue(row, 'checkpoint_id');
  const parentCheckpointId = ownValue(row, 'parentCheckpointId') !== MISSING
    ? ownValue(row, 'parentCheckpointId') : ownValue(row, 'parent_checkpoint_id');
  const graphVersion = ownValue(row, 'graphVersion') !== MISSING
    ? ownValue(row, 'graphVersion') : ownValue(row, 'graph_version');
  const stateSchemaVersion = ownValue(row, 'stateSchemaVersion') !== MISSING
    ? ownValue(row, 'stateSchemaVersion') : ownValue(row, 'state_schema_version');
  const serializerVersion = ownValue(row, 'serializerVersion') !== MISSING
    ? ownValue(row, 'serializerVersion') : ownValue(row, 'serializer_version');
  const turnId = ownValue(row, 'turnId') !== MISSING ? ownValue(row, 'turnId') : ownValue(row, 'turn_id');
  const correlationId = ownValue(row, 'correlationId') !== MISSING
    ? ownValue(row, 'correlationId') : ownValue(row, 'correlation_id');
  const ledgerRefs = ownValue(row, 'ledgerRefs') !== MISSING ? ownValue(row, 'ledgerRefs') : ownValue(row, 'ledger_refs');
  const payloadDigest = ownValue(row, 'payloadDigest') !== MISSING
    ? ownValue(row, 'payloadDigest') : ownValue(row, 'payload_digest');
  const updatedAt = ownValue(row, 'updatedAt') !== MISSING ? ownValue(row, 'updatedAt') : ownValue(row, 'updated_at');
  const expiresAt = ownValue(row, 'expiresAt') !== MISSING ? ownValue(row, 'expiresAt') : ownValue(row, 'expires_at');
  const envelopeVersion = ownValue(row, 'envelopeVersion') === MISSING
    ? CHECKPOINT_ENVELOPE_VERSION : ownValue(row, 'envelopeVersion');

  if (typeof ledgerRefs === 'string') {
    try {
      const parsed = JSON.parse(ledgerRefs);
      if (!Array.isArray(parsed)) return null;
      return normalizeEnvelopeRow({
        envelopeVersion,
        conversationId,
        checkpointNs,
        checkpointId,
        parentCheckpointId,
        graphVersion,
        stateSchemaVersion,
        serializerVersion,
        turnId,
        correlationId,
        ledgerRefs: parsed,
        payloadDigest,
        updatedAt,
        expiresAt,
      }, request);
    } catch {
      return null;
    }
  }

  const envelope = {
    envelopeVersion,
    conversationId,
    checkpointNs,
    checkpointId,
    parentCheckpointId: parentCheckpointId === undefined || parentCheckpointId === MISSING
      ? null : parentCheckpointId,
    graphVersion,
    stateSchemaVersion: typeof stateSchemaVersion === 'string' ? Number(stateSchemaVersion) : stateSchemaVersion,
    serializerVersion,
    turnId,
    correlationId,
    ledgerRefs,
    payloadDigest,
    updatedAt: normalizeTimestamp(updatedAt),
    expiresAt: normalizeTimestamp(expiresAt),
  };
  if (envelope.conversationId !== request.conversationId
    || envelope.checkpointNs !== request.checkpointNs
    || envelope.checkpointId !== request.checkpointId) return null;
  return envelope;
}

function normalizeTimestamp(value) {
  try {
    const time = value instanceof Date ? value.getTime() : Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : value;
  } catch {
    return value;
  }
}

function unpackCheckpointRecord(stored, request) {
  if (stored === CHECKPOINT_NOT_FOUND) return null;
  if (!isPlainRecord(stored)) return null;

  const config = ownValue(stored, 'config');
  const configurable = ownValue(config, 'configurable');
  const parentConfig = ownValue(stored, 'parentConfig');
  const parentConfigurable = ownValue(parentConfig, 'configurable');
  const metadata = ownValue(stored, 'metadata');
  const nestedCheckpoint = ownValue(stored, 'checkpoint');
  const checkpoint = nestedCheckpoint === MISSING ? stored : nestedCheckpoint;
  if (!isPlainRecord(checkpoint)) return null;

  const threadId = ownValue(stored, 'threadId') !== MISSING
    ? ownValue(stored, 'threadId')
    : ownValue(stored, 'thread_id') !== MISSING
      ? ownValue(stored, 'thread_id')
      : ownValue(configurable, 'thread_id');
  const checkpointId = ownValue(stored, 'checkpointId') !== MISSING
    ? ownValue(stored, 'checkpointId')
    : ownValue(stored, 'checkpoint_id') !== MISSING
      ? ownValue(stored, 'checkpoint_id')
      : ownValue(configurable, 'checkpoint_id') !== MISSING
        ? ownValue(configurable, 'checkpoint_id')
        : ownValue(checkpoint, 'id');
  const checkpointNs = ownValue(stored, 'checkpointNs') !== MISSING
    ? ownValue(stored, 'checkpointNs')
    : ownValue(stored, 'checkpoint_ns') !== MISSING
      ? ownValue(stored, 'checkpoint_ns')
      : ownValue(configurable, 'checkpoint_ns');
  const graphVersion = ownValue(stored, 'graphVersion') !== MISSING
    ? ownValue(stored, 'graphVersion')
    : ownValue(stored, 'graph_version') !== MISSING
      ? ownValue(stored, 'graph_version')
      : ownValue(metadata, 'graphVersion');
  const parentCheckpointId = ownValue(stored, 'parentCheckpointId') !== MISSING
    ? ownValue(stored, 'parentCheckpointId')
    : ownValue(stored, 'parent_checkpoint_id') !== MISSING
      ? ownValue(stored, 'parent_checkpoint_id')
      : parentConfigurable === MISSING || parentConfigurable === null
        ? null
        : ownValue(parentConfigurable, 'checkpoint_id');

  if (threadId !== MISSING && threadId !== request.conversationId) return null;
  if (checkpointId !== request.checkpointId || checkpointNs !== request.checkpointNs) return null;
  if (parentCheckpointId !== MISSING && parentCheckpointId !== (request.parentCheckpointId ?? null)) return null;
  if (graphVersion !== MISSING && graphVersion !== undefined && graphVersion !== request.graphVersion) {
    return { incompatibleGraph: true };
  }
  return { checkpoint, graphVersion, parentCheckpointId };
}

function validateVersionConfiguration({ graphVersion, stateSchemaVersion, serializerVersion, now }) {
  if (typeof graphVersion !== 'string' || !OPAQUE_ID_PATTERN.test(graphVersion)
    || !Number.isSafeInteger(stateSchemaVersion) || stateSchemaVersion < 1
    || typeof serializerVersion !== 'string' || !OPAQUE_ID_PATTERN.test(serializerVersion)
    || typeof now !== 'function') {
    throw new TypeError('Checkpoint resume configuration is invalid.');
  }
}

function isSafeOutcomeReference(value) {
  return typeof value === 'string' && SAFE_OUTCOME_REFERENCE_PATTERN.test(value);
}

async function inspectLedger(executionLedger, ledgerRefs) {
  const outcomes = [];
  for (const ledgerRef of ledgerRefs) {
    let result;
    try {
      result = await executionLedger.lookup(ledgerRef);
    } catch {
      return null;
    }
    if (!isPlainRecord(result)) return null;
    const status = ownValue(result, 'status');
    if (status === 'not_started') {
      outcomes.push(Object.freeze({ ledgerRef, status }));
      continue;
    }
    if (status === 'completed') {
      const safeOutcomeReference = ownValue(result, 'safeOutcomeReference');
      if (!isSafeOutcomeReference(safeOutcomeReference)) return null;
      outcomes.push(Object.freeze({ ledgerRef, status, safeOutcomeReference }));
      continue;
    }
    return null;
  }
  return Object.freeze(outcomes);
}

function metadataOutcome(metadata, request, nowDate) {
  if (metadata === null) return 'NOT_FOUND';
  const conversationId = ownValue(metadata, 'conversationId');
  const policyVersion = ownValue(metadata, 'policyVersion');
  const lifecycle = ownValue(metadata, 'lifecycle');
  const expiresAtValue = ownValue(metadata, 'expiresAt');
  if (!isPlainRecord(metadata)
    || conversationId !== request.conversationId
    || policyVersion !== POLICY_VERSION
    || !['active', 'deleting', 'deleted'].includes(lifecycle)) return 'CORRUPT';
  if (lifecycle === 'deleting') return 'CONVERSATION_DELETING';
  if (lifecycle === 'deleted') return 'NOT_FOUND';
  let expiresAt;
  try {
    expiresAt = Date.parse(expiresAtValue);
  } catch {
    return 'CORRUPT';
  }
  if (!Number.isFinite(expiresAt)) return 'CORRUPT';
  if (nowDate.getTime() >= expiresAt) return 'EXPIRED';
  return null;
}

function safeEnvelope(envelope) {
  return Object.freeze({
    thread_id: envelope.conversationId,
    checkpoint_ns: envelope.checkpointNs,
    checkpoint_id: envelope.checkpointId,
    parent_checkpoint_id: envelope.parentCheckpointId,
    graph_version: envelope.graphVersion,
    state_schema_version: envelope.stateSchemaVersion,
    serializer_version: envelope.serializerVersion,
    turn_id: envelope.turnId,
    correlation_id: envelope.correlationId,
    ledger_refs: envelope.ledgerRefs,
    payload_digest: envelope.payloadDigest,
    updated_at: envelope.updatedAt,
    expires_at: envelope.expiresAt,
  });
}

function validEnvelopeForStorage(envelope) {
  if (!isPlainRecord(envelope)) return false;
  try {
    validateConversationId(ownValue(envelope, 'conversationId'));
    validateTurnId(ownValue(envelope, 'turnId'));
    validateTurnId(ownValue(envelope, 'correlationId'));
  } catch {
    return false;
  }
  const checkpointNs = ownValue(envelope, 'checkpointNs');
  const checkpointId = ownValue(envelope, 'checkpointId');
  const parentCheckpointId = ownValue(envelope, 'parentCheckpointId');
  const graphVersion = ownValue(envelope, 'graphVersion');
  const stateSchemaVersion = ownValue(envelope, 'stateSchemaVersion');
  const serializerVersion = ownValue(envelope, 'serializerVersion');
  const ledgerRefs = ownValue(envelope, 'ledgerRefs');
  const payloadDigest = ownValue(envelope, 'payloadDigest');
  const updatedAt = ownValue(envelope, 'updatedAt');
  const expiresAt = ownValue(envelope, 'expiresAt');
  if (checkpointText(checkpointNs, { allowEmpty: true }) === null
    || checkpointText(checkpointId) === null
    || parentCheckpointId !== null && checkpointText(parentCheckpointId) === null
    || textIdentifier(graphVersion) === null
    || !Number.isSafeInteger(stateSchemaVersion) || stateSchemaVersion < 1
    || textIdentifier(serializerVersion) === null
    || !Array.isArray(ledgerRefs) || ledgerRefs.some((value) => (
      typeof value !== 'string' || !SAFE_LEDGER_REFERENCE_PATTERN.test(value)
    ))
    || typeof payloadDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(payloadDigest)) return false;
  let updatedMs;
  let expiresMs;
  try {
    updatedMs = Date.parse(updatedAt);
    expiresMs = Date.parse(expiresAt);
  } catch {
    return false;
  }
  return Number.isFinite(updatedMs) && Number.isFinite(expiresMs)
    && expiresMs > updatedMs && expiresMs <= updatedMs + CHECKPOINT_MAX_AGE_MS;
}

/**
 * Build a metadata-only envelope store for the pre-created private schema.
 * It never creates schema objects or invokes PostgresSaver setup. The caller
 * injects a server-side pg Pool; accessGate is checked before every query.
 */
export function createPostgresCheckpointEnvelopeStore({ pool, accessGate = memoryAccessGate } = {}) {
  assertServerOnlyRuntime();
  if (!pool || typeof pool.query !== 'function' || !accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('Checkpoint envelope store dependencies are invalid.');
  }

  async function load(request) {
    const conversationId = isPlainRecord(request) ? ownValue(request, 'threadId') : MISSING;
    const checkpointNs = isPlainRecord(request) ? ownValue(request, 'checkpointNs') : MISSING;
    const checkpointId = isPlainRecord(request) ? ownValue(request, 'checkpointId') : MISSING;
    if (typeof conversationId !== 'string' || checkpointText(checkpointNs, { allowEmpty: true }) === null
      || checkpointText(checkpointId) === null) return INVALID_ID;

    const gated = await runThroughGate(accessGate, async () => {
      const result = await pool.query(
        `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
                graph_version, state_schema_version, serializer_version,
                turn_id::text AS turn_id, correlation_id::text AS correlation_id,
                ledger_refs, payload_digest, updated_at, expires_at
           FROM conversation_private.checkpoint_envelopes
          WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3`,
        [conversationId, checkpointNs, checkpointId],
      );
      if (!Array.isArray(result?.rows) || result.rows.length > 1) throw new CheckpointResumeError();
      return result.rows[0] ?? null;
    });
    if (!gated.allowed) return ACCESS_DISABLED;
    if (gated.failed) return DEPENDENCY_UNAVAILABLE;
    return gated.value;
  }

  async function save(envelope) {
    if (!validEnvelopeForStorage(envelope)) return CORRUPT;
    const stored = safeEnvelope(envelope);
    const gated = await runThroughGate(accessGate, async () => {
      const inserted = await pool.query(
        `INSERT INTO conversation_private.checkpoint_envelopes
           (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
            graph_version, state_schema_version, serializer_version, turn_id,
            correlation_id, ledger_refs, payload_digest, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9::uuid, $10::jsonb,
                 $11, $12::timestamptz, $13::timestamptz)
         ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id) DO NOTHING
         RETURNING thread_id, checkpoint_ns, checkpoint_id`,
        [
          stored.thread_id,
          stored.checkpoint_ns,
          stored.checkpoint_id,
          stored.parent_checkpoint_id,
          stored.graph_version,
          stored.state_schema_version,
          stored.serializer_version,
          stored.turn_id,
          stored.correlation_id,
          JSON.stringify(stored.ledger_refs),
          stored.payload_digest,
          stored.updated_at,
          stored.expires_at,
        ],
      );
      if (!Array.isArray(inserted?.rows)) throw new CheckpointResumeError();
      if (inserted.rows.length === 1) return Object.freeze({ saved: true });

      const existing = await pool.query(
        `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
                graph_version, state_schema_version, serializer_version,
                turn_id::text AS turn_id, correlation_id::text AS correlation_id,
                ledger_refs, payload_digest, updated_at, expires_at
           FROM conversation_private.checkpoint_envelopes
          WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3`,
        [stored.thread_id, stored.checkpoint_ns, stored.checkpoint_id],
      );
      if (!Array.isArray(existing?.rows) || existing.rows.length !== 1) throw new CheckpointResumeError();
      const prior = normalizeEnvelopeRow(existing.rows[0], {
        conversationId: stored.thread_id,
        checkpointNs: stored.checkpoint_ns,
        checkpointId: stored.checkpoint_id,
      });
      const priorComparable = prior && safeEnvelope(prior);
      if (!priorComparable || JSON.stringify(priorComparable) !== JSON.stringify(stored)) {
        throw new CheckpointResumeError('CORRUPT');
      }
      return Object.freeze({ saved: true, replayed: true });
    });
    if (!gated.allowed) return ACCESS_DISABLED;
    if (gated.failed) return DEPENDENCY_UNAVAILABLE;
    return gated.value;
  }

  return Object.freeze({ load, save });
}

/**
 * Adapt an already-constructed LangGraph PostgresSaver to SPEC-002's port.
 * The checkpointer is injected, and setup()/Pool construction are deliberately
 * absent. Exact helpers preserve namespace/checkpoint binding for SPEC-003.
 */
export function createLangGraphPostgresCheckpointPort({ checkpointer, accessGate = memoryAccessGate } = {}) {
  assertServerOnlyRuntime();
  if (!checkpointer || typeof checkpointer.getTuple !== 'function'
    || typeof checkpointer.put !== 'function'
    || !accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('LangGraph PostgresSaver dependencies are invalid.');
  }

  async function loadExact(request) {
    if (!isPlainRecord(request)) return INVALID_ID;
    const threadId = ownValue(request, 'threadId');
    const checkpointNs = ownValue(request, 'checkpointNs');
    const checkpointId = ownValue(request, 'checkpointId');
    if (typeof threadId !== 'string' || checkpointText(checkpointNs, { allowEmpty: true }) === null
      || checkpointText(checkpointId) === null) return INVALID_ID;

    const gated = await runThroughGate(accessGate, async () => (
      await checkpointer.getTuple({
        configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId },
      }) ?? CHECKPOINT_NOT_FOUND
    ));
    if (!gated.allowed) return ACCESS_DISABLED;
    if (gated.failed) return DEPENDENCY_UNAVAILABLE;
    return gated.value;
  }

  async function saveExact(request) {
    if (!isPlainRecord(request)) return INVALID_ID;
    const threadId = ownValue(request, 'threadId');
    const checkpointNs = ownValue(request, 'checkpointNs');
    const checkpointId = ownValue(request, 'checkpointId');
    const parentCheckpointId = ownValue(request, 'parentCheckpointId');
    const graphVersion = ownValue(request, 'graphVersion');
    const checkpointPayload = ownValue(request, 'checkpointPayload');
    if (typeof threadId !== 'string' || checkpointText(checkpointNs, { allowEmpty: true }) === null
      || checkpointText(checkpointId) === null
      || parentCheckpointId !== null && checkpointText(parentCheckpointId) === null
      || textIdentifier(graphVersion) === null || !isPlainRecord(checkpointPayload)
      || ownValue(checkpointPayload, 'id') !== checkpointId
      || !isPlainRecord(ownValue(checkpointPayload, 'channel_versions'))) return INVALID_ID;

    const gated = await runThroughGate(accessGate, async () => {
      const parent = parentCheckpointId === null
        ? {}
        : { checkpoint_id: parentCheckpointId };
      const result = await checkpointer.put(
        { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, ...parent } },
        checkpointPayload,
        { source: 'loop', step: -1, writes: {}, graphVersion },
        ownValue(checkpointPayload, 'channel_versions'),
      );
      const configurable = ownValue(result, 'configurable');
      if (ownValue(configurable, 'thread_id') !== threadId
        || ownValue(configurable, 'checkpoint_ns') !== checkpointNs
        || ownValue(configurable, 'checkpoint_id') !== checkpointId) return CORRUPT;
      return Object.freeze({ threadId, checkpointNs, checkpointId, graphVersion });
    });
    if (!gated.allowed) return ACCESS_DISABLED;
    if (gated.failed) return DEPENDENCY_UNAVAILABLE;
    return gated.value;
  }

  async function load(threadId) {
    if (typeof threadId !== 'string' || threadId.length === 0) return INVALID_ID;
    const gated = await runThroughGate(accessGate, async () => (
      await checkpointer.getTuple({ configurable: { thread_id: threadId, checkpoint_ns: '' } })
        ?? CHECKPOINT_NOT_FOUND
    ));
    if (!gated.allowed) return ACCESS_DISABLED;
    if (gated.failed) return DEPENDENCY_UNAVAILABLE;
    return gated.value;
  }

  async function save(threadId, graphVersion, checkpointPayload) {
    const checkpointId = ownValue(checkpointPayload, 'id');
    if (typeof threadId !== 'string' || textIdentifier(graphVersion) === null
      || checkpointText(checkpointId) === null) return INVALID_ID;
    return saveExact({
      threadId,
      checkpointNs: '',
      checkpointId,
      parentCheckpointId: null,
      graphVersion,
      checkpointPayload,
    });
  }

  return Object.freeze({ load, save, loadExact, saveExact });
}

/**
 * Compose SPEC-002's unchanged CheckpointPort and ExecutionLedger with the
 * versioned envelope and conversation metadata. No pool, provider, or schema
 * is created here. The default gate is permanently closed by DEC-001.
 */
export function createCheckpointResume({
  checkpointPort,
  envelopeStore,
  conversationRepository,
  executionLedger,
  accessGate = memoryAccessGate,
  graphVersion,
  stateSchemaVersion,
  serializerVersion,
  now = () => new Date(),
} = {}) {
  assertServerOnlyRuntime();
  validateVersionConfiguration({ graphVersion, stateSchemaVersion, serializerVersion, now });
  const checkpoint = assertCheckpointPort(checkpointPort);
  const ledger = assertExecutionLedgerPort(executionLedger);
  if (!envelopeStore || typeof envelopeStore.load !== 'function' || typeof envelopeStore.save !== 'function'
    || !conversationRepository || typeof conversationRepository.getConversationMetadata !== 'function'
    || !accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('Checkpoint resume dependencies are invalid.');
  }

  async function verify(request) {
    let nowDate;
    try {
      nowDate = normalizeNow(now);
    } catch {
      return DEPENDENCY_UNAVAILABLE;
    }

    let metadata;
    try {
      metadata = await conversationRepository.getConversationMetadata({ conversationId: request.conversationId });
    } catch {
      return DEPENDENCY_UNAVAILABLE;
    }
    const lifecycle = metadataOutcome(metadata, request, nowDate);
    if (lifecycle) return Object.freeze({ outcome: lifecycle });

    let storedEnvelope;
    try {
      storedEnvelope = await envelopeStore.load({
        threadId: request.conversationId,
        checkpointNs: request.checkpointNs,
        checkpointId: request.checkpointId,
      });
    } catch {
      return DEPENDENCY_UNAVAILABLE;
    }
    if (isAccessDenied(storedEnvelope)) return ACCESS_DISABLED;
    if (storedEnvelope === null || storedEnvelope === undefined || storedEnvelope === CHECKPOINT_NOT_FOUND) return NOT_FOUND;
    const envelopeStoreOutcome = ownValue(storedEnvelope, 'outcome');
    if (envelopeStoreOutcome === 'DEPENDENCY_UNAVAILABLE') return DEPENDENCY_UNAVAILABLE;
    if (envelopeStoreOutcome === 'INVALID_ID') return INVALID_ID;

    const envelope = normalizeEnvelopeRow(storedEnvelope, request);
    if (!envelope) return CORRUPT;

    let storedCheckpoint;
    try {
      storedCheckpoint = typeof checkpoint.loadExact === 'function'
        ? await checkpoint.loadExact({
          threadId: request.conversationId,
          checkpointNs: request.checkpointNs,
          checkpointId: request.checkpointId,
        })
        : await loadCheckpoint(checkpoint, request.conversationId);
    } catch {
      return DEPENDENCY_UNAVAILABLE;
    }
    if (isAccessDenied(storedCheckpoint)) return ACCESS_DISABLED;
    const checkpointPortOutcome = ownValue(storedCheckpoint, 'outcome');
    if (checkpointPortOutcome === 'DEPENDENCY_UNAVAILABLE') return DEPENDENCY_UNAVAILABLE;
    if (checkpointPortOutcome === 'INVALID_ID') return INVALID_ID;
    if (checkpointPortOutcome === 'CORRUPT') return CORRUPT;
    if (storedCheckpoint === CHECKPOINT_NOT_FOUND) return NOT_FOUND;
    const checkpointRecord = unpackCheckpointRecord(storedCheckpoint, {
      ...request,
      parentCheckpointId: envelope.parentCheckpointId,
      graphVersion,
    });
    if (!checkpointRecord) return CORRUPT;
    if (checkpointRecord.incompatibleGraph) return Object.freeze({ outcome: 'INCOMPATIBLE_GRAPH' });
    if (checkpointRecord.parentCheckpointId !== MISSING
      && checkpointRecord.parentCheckpointId !== envelope.parentCheckpointId) return CORRUPT;

    const validated = validateCheckpointEnvelope({
      envelope,
      checkpointPayload: checkpointRecord.checkpoint,
      expected: {
        conversationId: request.conversationId,
        checkpointNs: request.checkpointNs,
        checkpointId: request.checkpointId,
        graphVersion,
        stateSchemaVersion,
        serializerVersion,
        turnId: request.turnId,
        correlationId: request.correlationId,
        conversationExpiresAt: ownValue(metadata, 'expiresAt'),
      },
      now: nowDate,
    });
    if (validated.outcome !== 'READY') return Object.freeze({ outcome: validated.outcome });

    const ledgerOutcomes = await inspectLedger(ledger, envelope.ledgerRefs);
    if (ledgerOutcomes === null) return Object.freeze({ outcome: 'LEDGER_UNRESOLVED' });
    return Object.freeze({
      outcome: 'READY',
      checkpoint: checkpointRecord.checkpoint,
      envelope,
      ledgerOutcomes,
      conversationExpiresAt: ownValue(metadata, 'expiresAt'),
    });
  }

  async function runOperation(operation) {
    const gated = await runThroughGate(accessGate, operation);
    if (!gated.allowed) return ACCESS_DISABLED;
    if (gated.failed) return DEPENDENCY_UNAVAILABLE;
    return gated.value;
  }

  async function save(value) {
    const request = parseCheckpointIdentityRequest(value, { payloadRequired: true });
    if (!request) return INVALID_ID;
    return runOperation(async () => {
      let nowDate;
      try {
        nowDate = normalizeNow(now);
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }

      let metadata;
      try {
        metadata = await conversationRepository.getConversationMetadata({ conversationId: request.conversationId });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      const lifecycle = metadataOutcome(metadata, request, nowDate);
      if (lifecycle) return Object.freeze({ outcome: lifecycle });

      let envelope;
      try {
        envelope = createCheckpointEnvelope({
          ...request,
          graphVersion,
          stateSchemaVersion,
          serializerVersion,
          checkpointPayload: request.checkpointPayload,
          updatedAt: nowDate.toISOString(),
          conversationExpiresAt: ownValue(metadata, 'expiresAt'),
        });
      } catch (error) {
        if (error?.code === 'CONVERSATION_EXPIRED') return Object.freeze({ outcome: 'EXPIRED' });
        return CORRUPT;
      }

      let safeReference;
      try {
        if (typeof checkpoint.saveExact === 'function') {
          safeReference = await checkpoint.saveExact({
            threadId: request.conversationId,
            checkpointNs: request.checkpointNs,
            checkpointId: request.checkpointId,
            parentCheckpointId: request.parentCheckpointId,
            graphVersion,
            checkpointPayload: request.checkpointPayload,
          });
        } else {
          if (request.checkpointNs !== '' || request.parentCheckpointId !== null) {
            return DEPENDENCY_UNAVAILABLE;
          }
          safeReference = await checkpoint.save(request.conversationId, graphVersion, request.checkpointPayload);
        }
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      if (safeReference === undefined || safeReference === null || isAccessDenied(safeReference)) {
        return isAccessDenied(safeReference) ? ACCESS_DISABLED : DEPENDENCY_UNAVAILABLE;
      }
      const checkpointSaveOutcome = ownValue(safeReference, 'outcome');
      if (checkpointSaveOutcome === 'ACCESS_DISABLED') return ACCESS_DISABLED;
      if (checkpointSaveOutcome === 'DEPENDENCY_UNAVAILABLE') return DEPENDENCY_UNAVAILABLE;
      if (checkpointSaveOutcome === 'INVALID_ID') return INVALID_ID;
      if (checkpointSaveOutcome === 'CORRUPT') return CORRUPT;
      if (isPlainRecord(safeReference)) {
        const referenceThreadId = ownValue(safeReference, 'threadId');
        const referenceGraphVersion = ownValue(safeReference, 'graphVersion');
        const referenceCheckpointId = ownValue(safeReference, 'checkpointId');
        const referenceCheckpointNs = ownValue(safeReference, 'checkpointNs');
        if (referenceThreadId !== MISSING && referenceThreadId !== request.conversationId
          || referenceGraphVersion !== MISSING && referenceGraphVersion !== graphVersion
          || referenceCheckpointId !== MISSING && referenceCheckpointId !== request.checkpointId
          || referenceCheckpointNs !== MISSING && referenceCheckpointNs !== request.checkpointNs) return CORRUPT;
      }
      if (!isPlainRecord(safeReference)
        || ownValue(safeReference, 'threadId') !== request.conversationId
        || ownValue(safeReference, 'graphVersion') !== graphVersion
        || ownValue(safeReference, 'checkpointId') !== request.checkpointId
        || ownValue(safeReference, 'checkpointNs') !== request.checkpointNs) return CORRUPT;

      let saveResult;
      try {
        saveResult = await envelopeStore.save(envelope);
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      if (isAccessDenied(saveResult)) return ACCESS_DISABLED;
      const envelopeSaveOutcome = ownValue(saveResult, 'outcome');
      if (envelopeSaveOutcome === 'DEPENDENCY_UNAVAILABLE') return DEPENDENCY_UNAVAILABLE;
      if (envelopeSaveOutcome === 'CORRUPT') return CORRUPT;
      if (envelopeSaveOutcome === 'INVALID_ID') return INVALID_ID;
      if (saveResult === false || saveResult === null || saveResult === undefined) return DEPENDENCY_UNAVAILABLE;

      return Object.freeze({
        outcome: 'READY',
        envelopeReference: Object.freeze({
          conversationId: request.conversationId,
          checkpointNs: request.checkpointNs,
          checkpointId: request.checkpointId,
        }),
      });
    });
  }

  async function preflight(value) {
    const request = parseCheckpointIdentityRequest(value);
    if (!request) return INVALID_ID;
    const checked = await runOperation(() => verify(request));
    if (checked?.outcome !== 'READY') return checked;
    // The checkpoint and safe ledger references remain private to this module.
    return Object.freeze({ outcome: 'READY' });
  }

  async function resume(value, invokeGraph) {
    const request = parseCheckpointIdentityRequest(value);
    if (!request) return INVALID_ID;
    if (typeof invokeGraph !== 'function') return CORRUPT;
    return runOperation(async () => {
      const checked = await verify(request);
      if (checked.outcome !== 'READY') return checked;
      try {
        const result = await invokeGraph(checked.checkpoint, Object.freeze({
          conversationId: request.conversationId,
          checkpointNs: request.checkpointNs,
          checkpointId: request.checkpointId,
          turnId: request.turnId,
          correlationId: request.correlationId,
          graphVersion,
          stateSchemaVersion,
          serializerVersion,
          ledgerOutcomes: checked.ledgerOutcomes,
        }));
        return Object.freeze({ outcome: 'READY', result });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
    });
  }

  return Object.freeze({ save, preflight, resume });
}
