import { createHash } from 'node:crypto';

export const CHECKPOINT_ENVELOPE_VERSION = 1;
export const CHECKPOINT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const CHECKPOINT_LEDGER_REFERENCE_MAX_LENGTH = 128;

const REQUIRED_TEXT_FIELDS = [
  'conversationId',
  'checkpointNs',
  'checkpointId',
  'graphVersion',
  'serializerVersion',
  'turnId',
  'correlationId',
];
const LEDGER_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export class CheckpointEnvelopeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CheckpointEnvelopeError';
    this.code = code;
  }
}

function canonicalJson(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CheckpointEnvelopeError('INVALID_PAYLOAD');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new CheckpointEnvelopeError('INVALID_PAYLOAD');
    seen.add(value);
    const result = `[${value.map((item) => canonicalJson(item, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      throw new CheckpointEnvelopeError('INVALID_PAYLOAD');
    }
    seen.add(value);
    const result = `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key], seen)}`
    )).join(',')}}`;
    seen.delete(value);
    return result;
  }
  throw new CheckpointEnvelopeError('INVALID_PAYLOAD');
}

export function digestCheckpointPayload(payload) {
  let bytes;
  if (typeof payload === 'string') bytes = Buffer.from(payload, 'utf8');
  else if (payload instanceof Uint8Array) bytes = Buffer.from(payload);
  else bytes = Buffer.from(canonicalJson(payload), 'utf8');
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseTime(value, code = 'INVALID_ENVELOPE') {
  const result = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(result)) throw new CheckpointEnvelopeError(code);
  return result;
}

function requiredText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeLedgerReference(value) {
  return typeof value === 'string'
    && value.length <= CHECKPOINT_LEDGER_REFERENCE_MAX_LENGTH
    && LEDGER_REFERENCE_PATTERN.test(value);
}

function minimumTime(...values) {
  return Math.min(...values);
}

export function createCheckpointEnvelope({
  conversationId,
  checkpointNs,
  checkpointId,
  parentCheckpointId = null,
  graphVersion,
  stateSchemaVersion,
  serializerVersion,
  turnId,
  correlationId,
  ledgerRefs = [],
  checkpointPayload,
  updatedAt,
  conversationExpiresAt,
}) {
  const fields = { conversationId, checkpointNs, checkpointId, graphVersion, serializerVersion, turnId, correlationId };
  if (Object.values(fields).some((value) => !requiredText(value))) {
    throw new CheckpointEnvelopeError('INVALID_ENVELOPE');
  }
  if (!Number.isSafeInteger(stateSchemaVersion) || stateSchemaVersion < 1) {
    throw new CheckpointEnvelopeError('INVALID_ENVELOPE');
  }
  if (parentCheckpointId !== null && !requiredText(parentCheckpointId)) {
    throw new CheckpointEnvelopeError('INVALID_ENVELOPE');
  }
  if (!Array.isArray(ledgerRefs) || ledgerRefs.some((ref) => !isSafeLedgerReference(ref))) {
    throw new CheckpointEnvelopeError('INVALID_ENVELOPE');
  }

  const updatedMs = parseTime(updatedAt);
  const conversationExpiryMs = parseTime(conversationExpiresAt);
  const expiresMs = minimumTime(updatedMs + CHECKPOINT_MAX_AGE_MS, conversationExpiryMs);
  if (expiresMs <= updatedMs) throw new CheckpointEnvelopeError('CONVERSATION_EXPIRED');

  return Object.freeze({
    envelopeVersion: CHECKPOINT_ENVELOPE_VERSION,
    conversationId,
    checkpointNs,
    checkpointId,
    parentCheckpointId,
    graphVersion,
    stateSchemaVersion,
    serializerVersion,
    turnId,
    correlationId,
    ledgerRefs: Object.freeze([...new Set(ledgerRefs)]),
    payloadDigest: digestCheckpointPayload(checkpointPayload),
    updatedAt: new Date(updatedMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
  });
}

function invalid(outcome = 'CORRUPT') {
  return Object.freeze({ outcome });
}

export function validateCheckpointEnvelope({
  envelope,
  checkpointPayload,
  expected = {},
  now = new Date(),
}) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return invalid();
  if (envelope.envelopeVersion !== CHECKPOINT_ENVELOPE_VERSION) return invalid();
  if (REQUIRED_TEXT_FIELDS.some((field) => !requiredText(envelope[field]))) return invalid();
  if (!Number.isSafeInteger(envelope.stateSchemaVersion) || envelope.stateSchemaVersion < 1) return invalid();
  if (envelope.parentCheckpointId !== null && !requiredText(envelope.parentCheckpointId)) return invalid();
  if (!Array.isArray(envelope.ledgerRefs) || envelope.ledgerRefs.some((ref) => !isSafeLedgerReference(ref))) return invalid();

  let updatedMs;
  let expiresMs;
  let nowMs;
  try {
    updatedMs = parseTime(envelope.updatedAt);
    expiresMs = parseTime(envelope.expiresAt);
    nowMs = typeof now === 'string' ? parseTime(now) : now instanceof Date ? now.getTime() : Number.NaN;
  } catch {
    return invalid();
  }
  if (!Number.isFinite(nowMs) || expiresMs <= updatedMs || expiresMs > updatedMs + CHECKPOINT_MAX_AGE_MS) return invalid();
  if (expected.conversationExpiresAt) {
    try {
      if (expiresMs > parseTime(expected.conversationExpiresAt)) return invalid();
    } catch {
      return invalid();
    }
  }

  for (const field of ['conversationId', 'checkpointNs', 'checkpointId', 'turnId', 'correlationId']) {
    if (expected[field] !== undefined && envelope[field] !== expected[field]) return invalid();
  }
  if (expected.graphVersion !== undefined && envelope.graphVersion !== expected.graphVersion) {
    return invalid('INCOMPATIBLE_GRAPH');
  }
  if (expected.stateSchemaVersion !== undefined && envelope.stateSchemaVersion !== expected.stateSchemaVersion) {
    return invalid('INCOMPATIBLE_STATE');
  }
  if (expected.serializerVersion !== undefined && envelope.serializerVersion !== expected.serializerVersion) {
    return invalid('INCOMPATIBLE_SERIALIZER');
  }

  let digest;
  try {
    digest = digestCheckpointPayload(checkpointPayload);
  } catch {
    return invalid();
  }
  if (envelope.payloadDigest !== digest) return invalid();
  if (nowMs >= expiresMs) return invalid('EXPIRED');
  return Object.freeze({ outcome: 'READY' });
}
