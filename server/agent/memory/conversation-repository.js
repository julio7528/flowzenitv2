import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { memoryAccessGate } from './access-gate.js';
import {
  CONVERSATION_MESSAGE_ROLES,
  parseHistoryCursorPayload,
  parseHistoryPage,
  parseHistoryRequest,
  validateConversationId,
  validateMessageSequence,
  validateTurnId,
} from './conversation-contracts.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const CONVERSATION_REPOSITORY_METHODS = Object.freeze([
  'getConversationMetadata',
  'getHistory',
  'reserveTurn',
  'appendTurn',
]);

export const CONVERSATION_LIFECYCLE_STATES = Object.freeze([
  'active',
  'deleting',
  'deleted',
]);

export const TURN_RESERVATION_OUTCOMES = Object.freeze([
  'reserved',
  'replayed',
  'conflict',
  'not_found',
  'deleting',
  'expired',
  'unavailable',
]);

export const TURN_APPEND_OUTCOMES = Object.freeze([
  'appended',
  'replayed',
  'conflict',
  'not_found',
  'deleting',
  'expired',
  'unavailable',
]);

const HISTORY_CURSOR_VERSION = 1;
const HISTORY_CURSOR_MAX_BYTES = 4096;
const IDEMPOTENCY_KEY_MAX_BYTES = 256;
const PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ConversationRepositoryError extends Error {
  constructor(code = 'UNAVAILABLE') {
    super(code === 'UNAVAILABLE' ? 'Conversation storage is unavailable.' : 'Conversation storage request is invalid.');
    this.name = 'ConversationRepositoryError';
    this.code = code;
  }
}

class InvalidHistoryCursor extends Error {}

function ownDataValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPool(value) {
  return value !== null && typeof value === 'object'
    && typeof value.query === 'function'
    && typeof value.connect === 'function';
}

function isCursorKey(value) {
  return value instanceof Uint8Array && value.byteLength >= 32 && value.byteLength <= 4096;
}

function normalizeTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new ConversationRepositoryError();
  return date.toISOString();
}

function normalizeBigint(value, { allowZero = false } = {}) {
  if (typeof value !== 'string') throw new ConversationRepositoryError();
  try {
    return validateMessageSequence(value, { allowZero });
  } catch {
    throw new ConversationRepositoryError();
  }
}

function historyFailure(outcome) {
  return Object.freeze({
    outcome,
    messages: Object.freeze([]),
    nextCursor: null,
    snapshotMaxMessageSeq: null,
  });
}

function encodeCursor(payload, key) {
  const body = Buffer.from(JSON.stringify({
    cursorVersion: HISTORY_CURSOR_VERSION,
    conversationId: payload.conversationId,
    pageSize: payload.pageSize,
    snapshotMaxMessageSeq: payload.snapshotMaxMessageSeq,
    lastMessageSeq: payload.lastMessageSeq,
  }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', key).update(body, 'ascii').digest('base64url');
  const cursor = `${body}.${signature}`;
  if (Buffer.byteLength(cursor, 'utf8') > HISTORY_CURSOR_MAX_BYTES) throw new ConversationRepositoryError();
  return cursor;
}

function decodeCursor(cursor, key) {
  if (typeof cursor !== 'string' || Buffer.byteLength(cursor, 'utf8') > HISTORY_CURSOR_MAX_BYTES) {
    throw new InvalidHistoryCursor();
  }
  const segments = cursor.split('.');
  if (segments.length !== 2 || !segments[0] || !segments[1]) throw new InvalidHistoryCursor();
  const [body, encodedSignature] = segments;
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    throw new InvalidHistoryCursor();
  }

  let suppliedSignature;
  try {
    suppliedSignature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new InvalidHistoryCursor();
  }
  if (suppliedSignature.toString('base64url') !== encodedSignature) throw new InvalidHistoryCursor();
  const expectedSignature = createHmac('sha256', key).update(body, 'ascii').digest();
  if (suppliedSignature.byteLength !== expectedSignature.byteLength
    || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    throw new InvalidHistoryCursor();
  }

  let decoded;
  try {
    const bytes = Buffer.from(body, 'base64url');
    if (bytes.toString('base64url') !== body) throw new InvalidHistoryCursor();
    decoded = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new InvalidHistoryCursor();
  }

  try {
    return parseHistoryCursorPayload(decoded);
  } catch {
    throw new InvalidHistoryCursor();
  }
}

function normalizedMessage(row, conversationId) {
  if (!row || typeof row !== 'object') throw new ConversationRepositoryError();
  if (typeof row.message_id !== 'string' || !UUID_PATTERN.test(row.message_id)
    || typeof row.turn_id !== 'string' || !UUID_PATTERN.test(row.turn_id)
    || typeof row.content !== 'string'
    || !CONVERSATION_MESSAGE_ROLES.includes(row.role)) {
    throw new ConversationRepositoryError();
  }
  return {
    messageId: row.message_id.toLowerCase(),
    conversationId,
    messageSeq: normalizeBigint(row.message_seq),
    turnId: row.turn_id.toLowerCase(),
    role: row.role,
    content: row.content,
    createdAt: normalizeTime(row.created_at),
  };
}

function normalizedMetadata(row) {
  if (!row || typeof row !== 'object'
    || !['active', 'deleting', 'deleted'].includes(row.lifecycle)
    || typeof row.conversation_id !== 'string'
    || !UUID_PATTERN.test(row.conversation_id)
    || row.policy_version !== 'dec005-spec003-v1') {
    throw new ConversationRepositoryError();
  }
  const activeTurnId = row.active_turn_id === null ? null : validateTurnId(row.active_turn_id);
  return Object.freeze({
    conversationId: row.conversation_id.toLowerCase(),
    lifecycle: row.lifecycle,
    createdAt: normalizeTime(row.created_at),
    lastActivityAt: normalizeTime(row.last_activity_at),
    expiresAt: normalizeTime(row.expires_at),
    lastMessageSeq: normalizeBigint(row.last_message_seq, { allowZero: true }),
    policyVersion: row.policy_version,
    activeTurnId,
  });
}

function safeReservationStatus(row) {
  return typeof row?.status === 'string'
    && ['reserved', 'running', 'completed', 'uncertain', 'failed', 'cancelled'].includes(row.status);
}

function invalidRepositoryRequest() {
  return new ConversationRepositoryError('INVALID_REQUEST');
}

function getNowIso(now) {
  try {
    const value = now();
    return normalizeTime(value instanceof Date ? value : new Date(value));
  } catch {
    throw new ConversationRepositoryError();
  }
}

function isValidIdempotencyKey(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\0')
    && Buffer.byteLength(value, 'utf8') <= IDEMPOTENCY_KEY_MAX_BYTES;
}

function parseReservationRequest(value) {
  if (!isPlainRecord(value)) throw invalidRepositoryRequest();
  try {
    const conversationId = validateConversationId(ownDataValue(value, 'conversationId'));
    const idempotencyKey = ownDataValue(value, 'idempotencyKey');
    const payloadHash = ownDataValue(value, 'payloadHash');
    const turnId = validateTurnId(ownDataValue(value, 'turnId'));
    const correlationId = validateTurnId(ownDataValue(value, 'correlationId'));
    if (!isValidIdempotencyKey(idempotencyKey)
      || typeof payloadHash !== 'string'
      || !PAYLOAD_HASH_PATTERN.test(payloadHash)) {
      throw invalidRepositoryRequest();
    }
    return Object.freeze({
      conversationId,
      idempotencyKey,
      payloadHash,
      turnId,
      correlationId,
    });
  } catch {
    throw invalidRepositoryRequest();
  }
}

function parseAppendRequest(value) {
  if (!isPlainRecord(value)) throw invalidRepositoryRequest();
  try {
    const conversationId = validateConversationId(ownDataValue(value, 'conversationId'));
    const turnId = validateTurnId(ownDataValue(value, 'turnId'));
    const sourceMessages = ownDataValue(value, 'messages');
    if (!Array.isArray(sourceMessages) || sourceMessages.length === 0) {
      throw invalidRepositoryRequest();
    }
    const messages = sourceMessages.map((message) => {
      if (!isPlainRecord(message)) throw invalidRepositoryRequest();
      const role = ownDataValue(message, 'role');
      const content = ownDataValue(message, 'content');
      if (!CONVERSATION_MESSAGE_ROLES.includes(role)
        || typeof content !== 'string'
        || content.includes('\0')) {
        throw invalidRepositoryRequest();
      }
      return Object.freeze({ role, content });
    });
    return Object.freeze({ conversationId, turnId, messages: Object.freeze(messages) });
  } catch {
    throw invalidRepositoryRequest();
  }
}

function sameCanonicalMessages(left, right) {
  return left.length === right.length && left.every((message, index) => (
    message.role === right[index].role && message.content === right[index].content
  ));
}

function publicTurnMessages(messages) {
  return Object.freeze(messages.map((message) => Object.freeze({ ...message })));
}

function repositoryConfigDependencies(config) {
  if (!isPlainRecord(config)) throw new TypeError('Conversation memory configuration is invalid.');
  const pool = ownDataValue(config, 'pool');
  const now = ownDataValue(config, 'now');
  const privateAccessAllowed = ownDataValue(config, 'privateAccessAllowed');
  const policyVersion = ownDataValue(config, 'policyVersion');
  const getCursorHmacKey = ownDataValue(config, 'getCursorHmacKey');
  if (!isPool(pool) || typeof now !== 'function' || privateAccessAllowed !== false
    || policyVersion !== 'dec005-spec003-v1' || typeof getCursorHmacKey !== 'function') {
    throw new TypeError('Conversation memory configuration is invalid.');
  }
  let cursorKey;
  try {
    const configuredKey = getCursorHmacKey.call(config);
    if (configuredKey !== undefined) {
      if (!isCursorKey(configuredKey)) throw new TypeError();
      cursorKey = Buffer.from(configuredKey);
    }
  } catch {
    throw new TypeError('Conversation memory configuration is invalid.');
  }
  return Object.freeze({ pool, now, cursorKey });
}

function conversationStateOutcome(metadata, nowIso) {
  if (metadata.lifecycle === 'deleting') return 'deleting';
  if (metadata.lifecycle === 'deleted') return 'not_found';
  if (Date.parse(metadata.expiresAt) <= Date.parse(nowIso)) return 'expired';
  return null;
}

function effectiveNowIso(configuredNowIso, databaseNowValue) {
  if (databaseNowValue === undefined || databaseNowValue === null) return configuredNowIso;
  const databaseNowIso = normalizeTime(databaseNowValue);
  return Date.parse(databaseNowIso) > Date.parse(configuredNowIso)
    ? databaseNowIso
    : configuredNowIso;
}

function transactionMetadataQuery(lockMode = 'UPDATE') {
  const lockClause = lockMode === 'SHARE' ? 'FOR SHARE OF c' : 'FOR UPDATE OF c';
  return `SELECT c.conversation_id, c.lifecycle, c.created_at, c.last_activity_at,
                 c.expires_at, c.last_message_seq::text AS last_message_seq,
                 c.policy_version, c.active_turn_id::text AS active_turn_id,
                 clock_timestamp() AS storage_now
            FROM conversation_private.conversations AS c
           WHERE c.conversation_id = $1
           ${lockClause}`;
}

function normalizedHistoryRequest(request) {
  try {
    return parseHistoryRequest(request);
  } catch {
    return null;
  }
}

async function withTransaction(pool, work) {
  const connection = await pool.connect();
  let began = false;
  try {
    await connection.query('BEGIN');
    began = true;
    const result = await work(connection);
    await connection.query('COMMIT');
    began = false;
    return result;
  } catch {
    if (began) {
      try {
        await connection.query('ROLLBACK');
      } catch {
        // Preserve the content-free storage failure.
      }
    }
    throw new ConversationRepositoryError();
  } finally {
    connection.release();
  }
}

async function readTurnMessages(connection, conversationId, turnId) {
  const result = await connection.query(
    `SELECT message_id::text, message_seq::text, turn_id::text, role, content, created_at
       FROM conversation_private.messages
      WHERE conversation_id = $1 AND turn_id = $2
      ORDER BY message_seq ASC`,
    [conversationId, turnId],
  );
  return result.rows.map((row) => normalizedMessage(row, conversationId));
}

/**
 * @typedef {object} ConversationMetadata
 * @property {string} conversationId Opaque UUID locator, never an identity.
 * @property {'active'|'deleting'|'deleted'} lifecycle
 * @property {string} createdAt UTC timestamp.
 * @property {string} lastActivityAt UTC timestamp.
 * @property {string} expiresAt UTC timestamp under dec005-spec003-v1.
 * @property {string} lastMessageSeq Canonical PostgreSQL bigint decimal text.
 * @property {'dec005-spec003-v1'} policyVersion
 * @property {string|null} activeTurnId Server-generated active turn UUID.
 */

/**
 * @typedef {object} TurnReservationRequest
 * @property {string} conversationId
 * @property {string} idempotencyKey Server-generated key, not browser identity.
 * @property {string} payloadHash Canonical SHA-256 hex digest.
 * @property {string} turnId Server-generated turn UUID.
 * @property {string} correlationId Server-generated correlation UUID.
 */

/**
 * @typedef {object} TurnAppendRequest
 * @property {string} conversationId
 * @property {string} turnId
 * @property {Array<{role:'user'|'assistant'|'tool_summary',content:string}>} messages
 */

/**
 * @typedef {object} ConversationRepository
 * @property {(request:{conversationId:string})=>Promise<ConversationMetadata|null>} getConversationMetadata
 * @property {(request:{conversationId:string,pageSize?:number,cursor?:string})=>Promise<object>} getHistory
 * @property {(request:TurnReservationRequest)=>Promise<object>} reserveTurn
 * @property {(request:TurnAppendRequest)=>Promise<object>} appendTurn
 *
 * The port describes canonical conversation storage only. The PostgreSQL
 * implementation below accepts an injected Pool; it contains no pool
 * construction or schema setup logic. Reservation and append serialize on the conversation
 * row, enforce conversation lifecycle/expiry, preserve messageSeq as decimal
 * text, and return only canonical messages or a content-free outcome.
 */

/** Check an injected storage adapter without constructing or querying it. */
export function assertConversationRepository(repository) {
  if (!repository || typeof repository !== 'object' || Array.isArray(repository)) {
    throw new TypeError('ConversationRepository must be an injected object.');
  }

  for (const method of CONVERSATION_REPOSITORY_METHODS) {
    if (typeof repository[method] !== 'function') {
      throw new TypeError('ConversationRepository is missing a required method.');
    }
  }

  return repository;
}

/**
 * Wrap an injected adapter with the immutable DEC-001 gate used by runtime
 * callers. The gate runs before any repository method; with the current closed
 * gate, none of the supplied storage functions is invoked. Tests may inject
 * isolated synthetic adapters and a test gate without enabling a product path.
 */
export function createGuardedConversationRepository({
  repository,
  accessGate = memoryAccessGate,
}) {
  const adapter = assertConversationRepository(repository);
  if (!accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('MemoryAccessGate must provide a run method.');
  }

  const guarded = Object.fromEntries(CONVERSATION_REPOSITORY_METHODS.map((method) => [
    method,
    async (...args) => accessGate.run(() => adapter[method](...args)),
  ]));

  return Object.freeze(guarded);
}

/**
 * Create the private PostgreSQL adapter from already-injected server config.
 * This function never constructs a Pool, reads environment variables, runs DDL,
 * or opens DEC-001. Runtime consumers must use the guarded wrapper above.
 */
export function createPostgresConversationRepository({ config } = {}) {
  const { pool, now, cursorKey } = repositoryConfigDependencies(config);

  async function getConversationMetadata(request) {
    if (!isPlainRecord(request)) throw invalidRepositoryRequest();
    let conversationId;
    try {
      conversationId = validateConversationId(ownDataValue(request, 'conversationId'));
    } catch {
      throw invalidRepositoryRequest();
    }

    try {
      const result = await pool.query(
        `SELECT c.conversation_id, c.lifecycle, c.created_at, c.last_activity_at,
                c.expires_at, c.last_message_seq::text AS last_message_seq,
                c.policy_version, c.active_turn_id::text AS active_turn_id
           FROM conversation_private.conversations AS c
          WHERE c.conversation_id = $1`,
        [conversationId],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1) throw new ConversationRepositoryError();
      return normalizedMetadata(result.rows[0]);
    } catch {
      throw new ConversationRepositoryError();
    }
  }

  async function getHistory(request) {
    const parsedRequest = normalizedHistoryRequest(request);
    if (parsedRequest === null) return historyFailure('invalid_id');
    if (cursorKey === undefined) return historyFailure('unavailable');

    let cursorPayload = null;
    if (parsedRequest.cursor !== undefined) {
      try {
        cursorPayload = decodeCursor(parsedRequest.cursor, cursorKey);
      } catch {
        return historyFailure('invalid_id');
      }
      if (cursorPayload.conversationId !== parsedRequest.conversationId
        || cursorPayload.pageSize !== parsedRequest.pageSize) {
        return historyFailure('invalid_id');
      }
    }

    const nowIso = getNowIso(now);
    try {
      return await withTransaction(pool, async (connection) => {
        const conversationResult = await connection.query(
          transactionMetadataQuery('SHARE'),
          [parsedRequest.conversationId],
        );
        if (conversationResult.rows.length === 0) return historyFailure('not_found');
        if (conversationResult.rows.length !== 1) throw new ConversationRepositoryError();

        const metadata = normalizedMetadata(conversationResult.rows[0]);
        const stateOutcome = conversationStateOutcome(
          metadata,
          effectiveNowIso(nowIso, conversationResult.rows[0].storage_now),
        );
        if (stateOutcome === 'expired') return historyFailure('expired');
        if (stateOutcome !== null) return historyFailure('not_found');

        const snapshotMaxMessageSeq = cursorPayload?.snapshotMaxMessageSeq ?? metadata.lastMessageSeq;
        const lastMessageSeq = cursorPayload?.lastMessageSeq ?? '0';
        if (BigInt(snapshotMaxMessageSeq) > BigInt(metadata.lastMessageSeq)) {
          return historyFailure('unavailable');
        }

        if (BigInt(lastMessageSeq) === BigInt(snapshotMaxMessageSeq)) {
          return parseHistoryPage({
            outcome: 'empty',
            conversationId: parsedRequest.conversationId,
            messages: [],
            nextCursor: null,
            snapshotMaxMessageSeq,
          });
        }

        const messageResult = await connection.query(
          `SELECT m.message_id::text AS message_id,
                  m.message_seq::text AS message_seq,
                  m.turn_id::text AS turn_id,
                  m.role, m.content, m.created_at
             FROM conversation_private.messages AS m
            WHERE m.conversation_id = $1
              AND m.message_seq > $2::bigint
              AND m.message_seq <= $3::bigint
            ORDER BY m.message_seq ASC
            LIMIT $4::integer`,
          [
            parsedRequest.conversationId,
            lastMessageSeq,
            snapshotMaxMessageSeq,
            parsedRequest.pageSize + 1,
          ],
        );
        if (messageResult.rows.length === 0) return historyFailure('unavailable');

        const hasMore = messageResult.rows.length > parsedRequest.pageSize;
        const selectedRows = hasMore
          ? messageResult.rows.slice(0, parsedRequest.pageSize)
          : messageResult.rows;
        const messages = selectedRows.map((row) => normalizedMessage(row, parsedRequest.conversationId));
        const nextCursor = hasMore
          ? encodeCursor({
            conversationId: parsedRequest.conversationId,
            pageSize: parsedRequest.pageSize,
            snapshotMaxMessageSeq,
            lastMessageSeq: messages[messages.length - 1].messageSeq,
          }, cursorKey)
          : null;

        return parseHistoryPage({
          outcome: 'ok',
          conversationId: parsedRequest.conversationId,
          messages,
          nextCursor,
          snapshotMaxMessageSeq,
        });
      });
    } catch {
      return historyFailure('unavailable');
    }
  }

  async function reserveTurn(request) {
    const parsedRequest = parseReservationRequest(request);
    const nowIso = getNowIso(now);
    try {
      return await withTransaction(pool, async (connection) => {
        const conversationResult = await connection.query(
          transactionMetadataQuery(),
          [parsedRequest.conversationId],
        );
        if (conversationResult.rows.length === 0) return Object.freeze({ outcome: 'not_found' });
        if (conversationResult.rows.length !== 1) throw new ConversationRepositoryError();
        const metadata = normalizedMetadata(conversationResult.rows[0]);
        const stateOutcome = conversationStateOutcome(
          metadata,
          effectiveNowIso(nowIso, conversationResult.rows[0].storage_now),
        );
        if (stateOutcome !== null) return Object.freeze({ outcome: stateOutcome });

        const existingResult = await connection.query(
          `SELECT r.payload_hash, r.turn_id::text AS turn_id,
                  r.correlation_id::text AS correlation_id, r.status
             FROM conversation_private.turn_reservations AS r
            WHERE r.conversation_id = $1 AND r.idempotency_key = $2
            FOR UPDATE OF r`,
          [parsedRequest.conversationId, parsedRequest.idempotencyKey],
        );
        if (existingResult.rows.length > 1) throw new ConversationRepositoryError();
        if (existingResult.rows.length === 1) {
          const existing = existingResult.rows[0];
          if (existing.payload_hash !== parsedRequest.payloadHash || !safeReservationStatus(existing)) {
            return Object.freeze({ outcome: 'conflict' });
          }
          if (existing.status !== 'completed') return Object.freeze({ outcome: 'conflict' });
          const messages = await readTurnMessages(connection, parsedRequest.conversationId, existing.turn_id);
          if (messages.length === 0) throw new ConversationRepositoryError();
          return Object.freeze({
            outcome: 'replayed',
            conversationId: parsedRequest.conversationId,
            turnId: existing.turn_id.toLowerCase(),
            correlationId: existing.correlation_id.toLowerCase(),
            messages: publicTurnMessages(messages),
          });
        }

        if (metadata.activeTurnId !== null) return Object.freeze({ outcome: 'conflict' });
        const inserted = await connection.query(
          `INSERT INTO conversation_private.turn_reservations
             (conversation_id, idempotency_key, payload_hash, turn_id, correlation_id, status)
           VALUES ($1, $2, $3, $4, $5, 'reserved')
           ON CONFLICT (conversation_id, idempotency_key) DO NOTHING
           RETURNING turn_id::text AS turn_id, correlation_id::text AS correlation_id, status`,
          [
            parsedRequest.conversationId,
            parsedRequest.idempotencyKey,
            parsedRequest.payloadHash,
            parsedRequest.turnId,
            parsedRequest.correlationId,
          ],
        );
        if (inserted.rows.length !== 1 || inserted.rows[0].status !== 'reserved') {
          return Object.freeze({ outcome: 'conflict' });
        }

        const updated = await connection.query(
          `UPDATE conversation_private.conversations AS c
              SET active_turn_id = $2::uuid
            WHERE c.conversation_id = $1
              AND c.active_turn_id IS NULL
              AND c.lifecycle = 'active'
              AND c.expires_at > GREATEST($3::timestamptz, clock_timestamp())
            RETURNING c.active_turn_id::text AS active_turn_id`,
          [parsedRequest.conversationId, parsedRequest.turnId, nowIso],
        );
        if (updated.rows.length !== 1 || updated.rows[0].active_turn_id.toLowerCase() !== parsedRequest.turnId) {
          throw new ConversationRepositoryError();
        }

        return Object.freeze({
          outcome: 'reserved',
          conversationId: parsedRequest.conversationId,
          turnId: parsedRequest.turnId,
          correlationId: parsedRequest.correlationId,
        });
      });
    } catch {
      return Object.freeze({ outcome: 'unavailable' });
    }
  }

  async function appendTurn(request) {
    const parsedRequest = parseAppendRequest(request);
    const nowIso = getNowIso(now);
    try {
      return await withTransaction(pool, async (connection) => {
        const conversationResult = await connection.query(
          transactionMetadataQuery(),
          [parsedRequest.conversationId],
        );
        if (conversationResult.rows.length === 0) return Object.freeze({ outcome: 'not_found' });
        if (conversationResult.rows.length !== 1) throw new ConversationRepositoryError();
        const metadata = normalizedMetadata(conversationResult.rows[0]);
        const stateOutcome = conversationStateOutcome(
          metadata,
          effectiveNowIso(nowIso, conversationResult.rows[0].storage_now),
        );
        if (stateOutcome !== null) return Object.freeze({ outcome: stateOutcome });

        const reservationResult = await connection.query(
          `SELECT r.idempotency_key, r.turn_id::text AS turn_id, r.status
             FROM conversation_private.turn_reservations AS r
            WHERE r.conversation_id = $1 AND r.turn_id = $2::uuid
            FOR UPDATE OF r`,
          [parsedRequest.conversationId, parsedRequest.turnId],
        );
        if (reservationResult.rows.length === 0) return Object.freeze({ outcome: 'conflict' });
        if (reservationResult.rows.length !== 1) throw new ConversationRepositoryError();
        const reservation = reservationResult.rows[0];
        if (!safeReservationStatus(reservation)) throw new ConversationRepositoryError();

        if (reservation.status === 'completed') {
          const existingMessages = await readTurnMessages(
            connection,
            parsedRequest.conversationId,
            parsedRequest.turnId,
          );
          if (existingMessages.length === 0) throw new ConversationRepositoryError();
          if (!sameCanonicalMessages(
            existingMessages.map(({ role, content }) => ({ role, content })),
            parsedRequest.messages,
          )) {
            return Object.freeze({ outcome: 'conflict' });
          }
          return Object.freeze({
            outcome: 'replayed',
            conversationId: parsedRequest.conversationId,
            turnId: parsedRequest.turnId,
            messages: publicTurnMessages(existingMessages),
          });
        }

        if (reservation.status !== 'reserved' && reservation.status !== 'running') {
          return Object.freeze({ outcome: 'conflict' });
        }
        if (metadata.activeTurnId !== parsedRequest.turnId) return Object.freeze({ outcome: 'conflict' });

        const messageIds = parsedRequest.messages.map(() => randomUUID());
        const rowResult = await connection.query(
          `WITH activity AS MATERIALIZED (
             SELECT clock_timestamp() AS at
           ), updated AS (
             UPDATE conversation_private.conversations AS c
                SET last_message_seq = c.last_message_seq + $2::bigint,
                    last_activity_at = activity.at,
                    expires_at = activity.at + interval '365 days',
                    active_turn_id = NULL
               FROM activity
              WHERE c.conversation_id = $1
                AND c.lifecycle = 'active'
                AND c.expires_at > GREATEST($3::timestamptz, clock_timestamp())
                AND c.active_turn_id = $4::uuid
              RETURNING c.last_message_seq, c.last_activity_at
           ), inserted AS (
             INSERT INTO conversation_private.messages
               (message_id, conversation_id, message_seq, turn_id, idempotency_key,
                role, content, created_at)
             SELECT data.message_id::uuid, $1,
                    updated.last_message_seq - $2::bigint + data.ordinality,
                    $4::uuid, $5::text, data.role, data.content,
                    updated.last_activity_at
               FROM updated
               CROSS JOIN unnest($6::uuid[], $7::text[], $8::text[])
                 WITH ORDINALITY AS data(message_id, role, content, ordinality)
             RETURNING message_id::text AS message_id,
                       conversation_id,
                       message_seq::text AS message_seq,
                       turn_id::text AS turn_id,
                       role, content, created_at
           )
           SELECT * FROM inserted ORDER BY message_seq::bigint ASC`,
          [
            parsedRequest.conversationId,
            parsedRequest.messages.length,
            nowIso,
            parsedRequest.turnId,
            reservation.idempotency_key,
            messageIds,
            parsedRequest.messages.map((message) => message.role),
            parsedRequest.messages.map((message) => message.content),
          ],
        );
        if (rowResult.rows.length !== parsedRequest.messages.length) {
          throw new ConversationRepositoryError();
        }
        const messages = rowResult.rows.map((row) => normalizedMessage(row, parsedRequest.conversationId));
        const completed = await connection.query(
          `UPDATE conversation_private.turn_reservations AS r
              SET status = 'completed',
                  completed_at = $3::timestamptz,
                  updated_at = $3::timestamptz,
                  replay_message_id = $4::uuid
            WHERE r.conversation_id = $1
              AND r.turn_id = $2::uuid
              AND r.status IN ('reserved', 'running')
            RETURNING r.turn_id::text AS turn_id`,
          [
            parsedRequest.conversationId,
            parsedRequest.turnId,
            messages[messages.length - 1].createdAt,
            messages[messages.length - 1].messageId,
          ],
        );
        if (completed.rows.length !== 1) throw new ConversationRepositoryError();

        return Object.freeze({
          outcome: 'appended',
          conversationId: parsedRequest.conversationId,
          turnId: parsedRequest.turnId,
          messages: publicTurnMessages(messages),
        });
      });
    } catch {
      return Object.freeze({ outcome: 'unavailable' });
    }
  }

  return Object.freeze({ getConversationMetadata, getHistory, reserveTurn, appendTurn });
}
