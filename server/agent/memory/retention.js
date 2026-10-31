import { randomUUID } from 'node:crypto';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { validateConversationId } from './conversation-contracts.js';

assertServerOnlyRuntime();

export const CONVERSATION_RETENTION_POLICY = Object.freeze({
  version: 'dec005-spec003-v1',
  historyDays: 365,
  checkpointDays: 30,
});

export const CONVERSATION_MAINTENANCE_PROJECT_REF = 'twikxeloeftczwbpjvzr';
export const CONVERSATION_MAINTENANCE_LIMITS = Object.freeze({
  defaultBatchSize: 25,
  maxBatchSize: 100,
});

const VERIFIED_TARGETS = new WeakSet();
const TARGET_CONNECTION_STRINGS = new WeakMap();
const VERIFIED_POOL_TARGETS = new WeakMap();
const ARTIFACT_TABLES = Object.freeze([
  Object.freeze({ table: 'checkpoint_writes', key: 'thread_id' }),
  Object.freeze({ table: 'checkpoint_blobs', key: 'thread_id' }),
  Object.freeze({ table: 'checkpoint_envelopes', key: 'thread_id' }),
  Object.freeze({ table: 'checkpoints', key: 'thread_id' }),
  Object.freeze({ table: 'context_summaries', key: 'conversation_id' }),
  Object.freeze({ table: 'messages', key: 'conversation_id' }),
  Object.freeze({ table: 'turn_reservations', key: 'conversation_id' }),
]);

export class ConversationMaintenanceError extends Error {
  constructor() {
    super('Conversation maintenance target or storage is unavailable.');
    this.name = 'ConversationMaintenanceError';
    this.code = 'CONVERSATION_MAINTENANCE_UNAVAILABLE';
  }
}

function unavailable() {
  return new ConversationMaintenanceError();
}

function decodedUser(url) {
  try {
    return decodeURIComponent(url.username);
  } catch {
    throw unavailable();
  }
}

/**
 * Validate an explicit maintenance confirmation against the one authorized
 * development project. The returned capability omits the connection secret.
 */
export function validateConversationMaintenanceTarget({
  projectRef,
  confirmProjectRef,
  supabaseUrl,
  databaseUrl,
} = {}) {
  if (projectRef !== CONVERSATION_MAINTENANCE_PROJECT_REF
    || confirmProjectRef !== CONVERSATION_MAINTENANCE_PROJECT_REF
    || typeof supabaseUrl !== 'string'
    || typeof databaseUrl !== 'string') {
    throw unavailable();
  }

  let api;
  let database;
  try {
    api = new URL(supabaseUrl);
    database = new URL(databaseUrl);
  } catch {
    throw unavailable();
  }

  const expectedApiHost = CONVERSATION_MAINTENANCE_PROJECT_REF + '.supabase.co';
  if (api.protocol !== 'https:'
    || api.hostname.toLowerCase() !== expectedApiHost
    || api.username !== ''
    || api.password !== ''
    || api.pathname !== '/'
    || api.search !== ''
    || api.hash !== '') {
    throw unavailable();
  }

  const projectUser = decodedUser(database);
  const host = database.hostname.toLowerCase();
  const port = database.port === '' ? null : Number(database.port);
  const directHost = 'db.' + CONVERSATION_MAINTENANCE_PROJECT_REF + '.supabase.co';
  const directConnection = host === directHost
    && projectUser === 'postgres'
    && (port === null || port === 5432);
  const poolerConnection = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host)
    && projectUser === 'postgres.' + CONVERSATION_MAINTENANCE_PROJECT_REF
    && (port === 5432 || port === 6543);

  const supportedQueryKeys = new Set(['sslmode']);
  const queryKeys = [...database.searchParams.keys()];
  if (database.protocol !== 'postgres:' && database.protocol !== 'postgresql:') {
    throw unavailable();
  }
  if (!directConnection && !poolerConnection) throw unavailable();
  if (database.password.length === 0
    || database.pathname !== '/postgres'
    || database.hash !== ''
    || queryKeys.some((key) => !supportedQueryKeys.has(key))
    || (database.searchParams.has('sslmode')
      && !['require', 'verify-ca', 'verify-full'].includes(database.searchParams.get('sslmode')))) {
    throw unavailable();
  }

  const target = Object.freeze({
    projectRef: CONVERSATION_MAINTENANCE_PROJECT_REF,
    host,
    port,
    databaseUser: projectUser,
    databaseName: 'postgres',
  });
  VERIFIED_TARGETS.add(target);
  TARGET_CONNECTION_STRINGS.set(target, databaseUrl);
  return target;
}

async function openVerifiedPool({ target, databaseUrl, createPool } = {}) {
  if (!VERIFIED_TARGETS.has(target)
    || TARGET_CONNECTION_STRINGS.get(target) !== databaseUrl
    || typeof createPool !== 'function') {
    throw unavailable();
  }
  let pool;
  try {
    pool = await createPool(databaseUrl);
  } catch {
    throw unavailable();
  }
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw unavailable();
  }
  VERIFIED_POOL_TARGETS.set(pool, target);
  return pool;
}

function batchSizeValue(value) {
  const size = value ?? CONVERSATION_MAINTENANCE_LIMITS.defaultBatchSize;
  if (!Number.isSafeInteger(size)
    || size < 1
    || size > CONVERSATION_MAINTENANCE_LIMITS.maxBatchSize) {
    throw unavailable();
  }
  return size;
}

function safeCount(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  try {
    const result = BigInt(value);
    if (result < 0n || result > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(result);
  } catch {
    return null;
  }
}

function artifactCounts(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) throw unavailable();
  const row = result.rows[0];
  const counts = {};
  for (const artifact of ARTIFACT_TABLES) {
    const count = safeCount(row[artifact.table]);
    if (count === null) throw unavailable();
    counts[artifact.table] = count;
  }
  return Object.freeze(counts);
}

function totalArtifactCount(counts) {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

function assertAffectedRows(result) {
  if (!Number.isSafeInteger(result?.rowCount) || result.rowCount < 0) throw unavailable();
}

async function withTransaction(pool, operation) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '5s'");
    const result = await operation(client);
    await client.query('COMMIT');
    transactionOpen = false;
    return result;
  } catch {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch { /* keep the failure content-free */ }
    }
    throw unavailable();
  } finally {
    client.release();
  }
}

const ARTIFACT_COUNT_SQL = [
  'SELECT',
  ' (SELECT COUNT(*)::text FROM conversation_private.messages WHERE conversation_id = $1) AS messages,',
  ' (SELECT COUNT(*)::text FROM conversation_private.turn_reservations WHERE conversation_id = $1) AS turn_reservations,',
  ' (SELECT COUNT(*)::text FROM conversation_private.context_summaries WHERE conversation_id = $1) AS context_summaries,',
  ' (SELECT COUNT(*)::text FROM conversation_private.checkpoint_envelopes WHERE thread_id = $1) AS checkpoint_envelopes,',
  ' (SELECT COUNT(*)::text FROM conversation_private.checkpoints WHERE thread_id = $1) AS checkpoints,',
  ' (SELECT COUNT(*)::text FROM conversation_private.checkpoint_blobs WHERE thread_id = $1) AS checkpoint_blobs,',
  ' (SELECT COUNT(*)::text FROM conversation_private.checkpoint_writes WHERE thread_id = $1) AS checkpoint_writes',
].join('\n');

async function purgeExpiredConversation(pool, conversationId) {
  return withTransaction(pool, async (client) => {
    const locked = await client.query(
      "SELECT lifecycle, active_turn_id::text AS active_turn_id, policy_version, "
        + "expires_at <= clock_timestamp() AS expired "
        + "FROM conversation_private.conversations "
        + "WHERE conversation_id = $1 FOR UPDATE",
      [conversationId],
    );
    if (!Array.isArray(locked?.rows) || locked.rows.length > 1) throw unavailable();
    if (locked.rows.length === 0) return 'CHANGED';

    const conversation = locked.rows[0];
    if (conversation.policy_version !== CONVERSATION_RETENTION_POLICY.version
      || !['active', 'deleting'].includes(conversation.lifecycle)
      || conversation.expired !== true) {
      return 'CHANGED';
    }
    if (conversation.active_turn_id !== null) return 'UNRESOLVED_TURN';

    const activeTurns = await client.query(
      "SELECT turn_id::text AS turn_id "
        + "FROM conversation_private.turn_reservations "
        + "WHERE conversation_id = $1 AND status IN ('reserved', 'running', 'uncertain') "
        + "ORDER BY turn_id FOR UPDATE",
      [conversationId],
    );
    if (!Array.isArray(activeTurns?.rows)) throw unavailable();
    if (activeTurns.rows.length > 0) return 'UNRESOLVED_TURN';

    const pending = await client.query(
      "SELECT request_id::text AS request_id "
        + "FROM conversation_private.deletion_operations "
        + "WHERE conversation_id = $1 AND status = 'deleting' "
        + "ORDER BY started_at, request_id LIMIT 2 FOR UPDATE",
      [conversationId],
    );
    if (!Array.isArray(pending?.rows) || pending.rows.length > 1) throw unavailable();

    let requestId = pending.rows[0]?.request_id;
    if (requestId === undefined) {
      requestId = randomUUID();
      const inserted = await client.query(
        "INSERT INTO conversation_private.deletion_operations "
          + "(request_id, conversation_id, status) "
          + "VALUES ($1::uuid, $2, 'deleting') "
          + "ON CONFLICT (request_id) DO NOTHING RETURNING request_id::text AS request_id",
        [requestId, conversationId],
      );
      if (!Array.isArray(inserted?.rows) || inserted.rows.length !== 1) throw unavailable();
    }

    const marked = await client.query(
      "UPDATE conversation_private.conversations SET lifecycle = 'deleting' "
        + "WHERE conversation_id = $1 AND lifecycle IN ('active', 'deleting') "
        + "RETURNING conversation_id",
      [conversationId],
    );
    if (!Array.isArray(marked?.rows) || marked.rows.length !== 1) throw unavailable();

    for (const artifact of ARTIFACT_TABLES) {
      const deleted = await client.query(
        'DELETE FROM conversation_private.' + artifact.table + ' WHERE ' + artifact.key + ' = $1',
        [conversationId],
      );
      assertAffectedRows(deleted);
    }

    const counts = artifactCounts(await client.query(ARTIFACT_COUNT_SQL, [conversationId]));
    if (totalArtifactCount(counts) !== 0) return 'ARTIFACTS_REMAIN';

    const completedConversation = await client.query(
      "UPDATE conversation_private.conversations "
        + "SET lifecycle = 'deleted', active_turn_id = NULL "
        + "WHERE conversation_id = $1 AND lifecycle = 'deleting' "
        + "RETURNING conversation_id",
      [conversationId],
    );
    if (!Array.isArray(completedConversation?.rows) || completedConversation.rows.length !== 1) {
      throw unavailable();
    }

    const completedOperation = await client.query(
      "UPDATE conversation_private.deletion_operations "
        + "SET status = 'completed', completed_at = statement_timestamp(), "
        + "updated_at = statement_timestamp(), "
        + "purge_after = statement_timestamp() + interval '30 days' "
        + "WHERE request_id = $1::uuid AND conversation_id = $2 AND status = 'deleting' "
        + "RETURNING request_id",
      [requestId, conversationId],
    );
    if (!Array.isArray(completedOperation?.rows) || completedOperation.rows.length !== 1) {
      throw unavailable();
    }

    const removedConversation = await client.query(
      "DELETE FROM conversation_private.conversations "
        + "WHERE conversation_id = $1 AND lifecycle = 'deleted' "
        + "RETURNING conversation_id",
      [conversationId],
    );
    if (!Array.isArray(removedConversation?.rows) || removedConversation.rows.length !== 1) {
      throw unavailable();
    }
    return 'DELETED';
  });
}

const CHECKPOINT_CANDIDATES_SQL = [
  'WITH checkpoint_candidates AS (',
  " SELECT 'expired_envelope'::text AS kind, e.thread_id, e.checkpoint_ns, e.checkpoint_id, 0 AS priority",
  '   FROM conversation_private.checkpoint_envelopes AS e',
  '   JOIN conversation_private.conversations AS c ON c.conversation_id = e.thread_id',
  '  WHERE c.lifecycle = \'active\' AND c.policy_version = $1',
  '    AND c.expires_at > clock_timestamp() AND e.expires_at <= clock_timestamp()',
  ' UNION ALL',
  " SELECT 'unbound_checkpoint'::text AS kind, cp.thread_id, cp.checkpoint_ns, cp.checkpoint_id, 1 AS priority",
  '   FROM conversation_private.checkpoints AS cp',
  '   JOIN conversation_private.conversations AS c ON c.conversation_id = cp.thread_id',
  '   LEFT JOIN conversation_private.checkpoint_envelopes AS e',
  '     ON e.thread_id = cp.thread_id AND e.checkpoint_ns = cp.checkpoint_ns',
  '    AND e.checkpoint_id = cp.checkpoint_id',
  '  WHERE e.thread_id IS NULL AND c.lifecycle = \'active\' AND c.policy_version = $1',
  '    AND c.expires_at > clock_timestamp()',
  ' UNION ALL',
  " SELECT 'orphan_write'::text AS kind, w.thread_id, w.checkpoint_ns, w.checkpoint_id, 2 AS priority",
  '   FROM conversation_private.checkpoint_writes AS w',
  '   JOIN conversation_private.conversations AS c ON c.conversation_id = w.thread_id',
  '   LEFT JOIN conversation_private.checkpoints AS cp',
  '     ON cp.thread_id = w.thread_id AND cp.checkpoint_ns = w.checkpoint_ns',
  '    AND cp.checkpoint_id = w.checkpoint_id',
  '   LEFT JOIN conversation_private.checkpoint_envelopes AS e',
  '     ON e.thread_id = w.thread_id AND e.checkpoint_ns = w.checkpoint_ns',
  '    AND e.checkpoint_id = w.checkpoint_id',
  '  WHERE cp.thread_id IS NULL AND e.thread_id IS NULL',
  '    AND c.lifecycle = \'active\' AND c.policy_version = $1',
  '    AND c.expires_at > clock_timestamp()',
  '), deduplicated AS (',
  ' SELECT DISTINCT ON (thread_id, checkpoint_ns, checkpoint_id)',
  '        kind, thread_id, checkpoint_ns, checkpoint_id, priority',
  '   FROM checkpoint_candidates',
  '  ORDER BY thread_id, checkpoint_ns, checkpoint_id, priority',
  ')',
  'SELECT kind, thread_id, checkpoint_ns, checkpoint_id',
  '  FROM deduplicated',
  ' ORDER BY priority, thread_id, checkpoint_ns, checkpoint_id',
  ' LIMIT $2',
].join('\n');

async function purgeExpiredCheckpoint(pool, candidate) {
  let conversationId;
  const kind = candidate?.kind;
  const checkpointNs = candidate?.checkpoint_ns;
  const checkpointId = candidate?.checkpoint_id;
  try {
    conversationId = validateConversationId(candidate?.thread_id);
  } catch {
    throw unavailable();
  }
  if (!['expired_envelope', 'unbound_checkpoint', 'orphan_write'].includes(kind)
    || typeof checkpointNs !== 'string'
    || checkpointNs.length > 4096
    || typeof checkpointId !== 'string'
    || checkpointId.length < 1
    || checkpointId.length > 4096) {
    throw unavailable();
  }

  return withTransaction(pool, async (client) => {
    const locked = await client.query(
      'SELECT lifecycle, active_turn_id::text AS active_turn_id, policy_version, '
        + 'expires_at <= clock_timestamp() AS expired '
        + 'FROM conversation_private.conversations '
        + 'WHERE conversation_id = $1 FOR UPDATE',
      [conversationId],
    );
    if (!Array.isArray(locked?.rows) || locked.rows.length > 1) throw unavailable();
    if (locked.rows.length === 0) return Object.freeze({ outcome: 'CHANGED' });
    const conversation = locked.rows[0];
    if (conversation.policy_version !== CONVERSATION_RETENTION_POLICY.version
      || conversation.lifecycle !== 'active'
      || conversation.expired === true) {
      return Object.freeze({ outcome: 'CHANGED' });
    }
    if (conversation.active_turn_id !== null) {
      return Object.freeze({ outcome: 'UNRESOLVED_TURN' });
    }

    const activeTurns = await client.query(
      "SELECT turn_id::text AS turn_id "
        + "FROM conversation_private.turn_reservations "
        + "WHERE conversation_id = $1 AND status IN ('reserved', 'running', 'uncertain') "
        + 'ORDER BY turn_id FOR UPDATE',
      [conversationId],
    );
    if (!Array.isArray(activeTurns?.rows)) throw unavailable();
    if (activeTurns.rows.length > 0) {
      return Object.freeze({ outcome: 'UNRESOLVED_TURN' });
    }

    if (kind === 'expired_envelope') {
      const envelope = await client.query(
        'SELECT expires_at <= clock_timestamp() AS expired '
          + 'FROM conversation_private.checkpoint_envelopes '
          + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3 '
          + 'FOR UPDATE',
        [conversationId, checkpointNs, checkpointId],
      );
      if (!Array.isArray(envelope?.rows) || envelope.rows.length > 1) throw unavailable();
      if (envelope.rows.length === 0 || envelope.rows[0].expired !== true) {
        return Object.freeze({ outcome: 'CHANGED' });
      }
    } else {
      const state = await client.query(
        'SELECT EXISTS (SELECT 1 FROM conversation_private.checkpoints '
          + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3) AS has_checkpoint, '
          + 'EXISTS (SELECT 1 FROM conversation_private.checkpoint_envelopes '
          + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3) AS has_envelope, '
          + 'EXISTS (SELECT 1 FROM conversation_private.checkpoint_writes '
          + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3) AS has_writes',
        [conversationId, checkpointNs, checkpointId],
      );
      if (!Array.isArray(state?.rows) || state.rows.length !== 1) throw unavailable();
      const row = state.rows[0];
      if (row.has_envelope === true
        || (kind === 'unbound_checkpoint' && row.has_checkpoint !== true)
        || (kind === 'orphan_write' && (row.has_checkpoint === true || row.has_writes !== true))) {
        return Object.freeze({ outcome: 'CHANGED' });
      }
    }

    const writes = await client.query(
      'DELETE FROM conversation_private.checkpoint_writes '
        + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3',
      [conversationId, checkpointNs, checkpointId],
    );
    assertAffectedRows(writes);
    const envelope = await client.query(
      'DELETE FROM conversation_private.checkpoint_envelopes '
        + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3',
      [conversationId, checkpointNs, checkpointId],
    );
    assertAffectedRows(envelope);
    const checkpoint = await client.query(
      'DELETE FROM conversation_private.checkpoints '
        + 'WHERE thread_id = $1 AND checkpoint_ns = $2 AND checkpoint_id = $3',
      [conversationId, checkpointNs, checkpointId],
    );
    assertAffectedRows(checkpoint);
    const blobs = await client.query(
      'DELETE FROM conversation_private.checkpoint_blobs AS blob '
        + 'WHERE blob.thread_id = $1 AND blob.checkpoint_ns = $2 '
        + 'AND NOT EXISTS ('
        + ' SELECT 1 FROM conversation_private.checkpoints AS cp '
        + '  WHERE cp.thread_id = blob.thread_id AND cp.checkpoint_ns = blob.checkpoint_ns '
        + '    AND cp.checkpoint -> \'channel_versions\' ->> blob.channel = blob.version'
        + ') RETURNING blob.channel',
      [conversationId, checkpointNs],
    );
    if (!Array.isArray(blobs?.rows)) throw unavailable();

    return Object.freeze({
      outcome: 'PURGED',
      writes: writes.rowCount,
      envelopes: envelope.rowCount,
      checkpoints: checkpoint.rowCount,
      blobs: blobs.rows.length,
    });
  });
}

async function purgeExpiredDeletionMetadata(pool, batchSize) {
  const result = await pool.query(
    "WITH expired_operations AS ("
      + " SELECT request_id FROM conversation_private.deletion_operations "
      + " WHERE status = 'completed' AND purge_after <= clock_timestamp() "
      + " ORDER BY purge_after, request_id LIMIT $1 FOR UPDATE SKIP LOCKED"
      + ") "
      + "DELETE FROM conversation_private.deletion_operations AS operation "
      + "USING expired_operations "
      + "WHERE operation.request_id = expired_operations.request_id "
      + "RETURNING operation.request_id",
    [batchSize],
  );
  if (!Array.isArray(result?.rows) || result.rows.length > batchSize) throw unavailable();
  return result.rows.length;
}

async function countExpiredCheckpointArtifacts(pool) {
  const result = await pool.query(
    'SELECT '
      + '(SELECT COUNT(*)::text FROM conversation_private.checkpoint_envelopes AS e '
      + ' JOIN conversation_private.conversations AS c ON c.conversation_id = e.thread_id '
      + ' WHERE c.lifecycle = \'active\' AND c.policy_version = $1 '
      + ' AND c.expires_at > clock_timestamp() AND e.expires_at <= clock_timestamp()) AS expired_envelopes, '
      + '(SELECT COUNT(*)::text FROM conversation_private.checkpoints AS cp '
      + ' JOIN conversation_private.conversations AS c ON c.conversation_id = cp.thread_id '
      + ' LEFT JOIN conversation_private.checkpoint_envelopes AS e '
      + ' ON e.thread_id = cp.thread_id AND e.checkpoint_ns = cp.checkpoint_ns '
      + ' AND e.checkpoint_id = cp.checkpoint_id '
      + ' WHERE e.thread_id IS NULL AND c.lifecycle = \'active\' '
      + ' AND c.policy_version = $1 AND c.expires_at > clock_timestamp()) AS unbound_checkpoints, '
      + '(SELECT COUNT(*)::text FROM conversation_private.checkpoint_writes AS w '
      + ' JOIN conversation_private.conversations AS c ON c.conversation_id = w.thread_id '
      + ' LEFT JOIN conversation_private.checkpoints AS cp '
      + ' ON cp.thread_id = w.thread_id AND cp.checkpoint_ns = w.checkpoint_ns '
      + ' AND cp.checkpoint_id = w.checkpoint_id '
      + ' LEFT JOIN conversation_private.checkpoint_envelopes AS e '
      + ' ON e.thread_id = w.thread_id AND e.checkpoint_ns = w.checkpoint_ns '
      + ' AND e.checkpoint_id = w.checkpoint_id '
      + ' WHERE cp.thread_id IS NULL AND e.thread_id IS NULL '
      + ' AND c.lifecycle = \'active\' AND c.policy_version = $1 '
      + ' AND c.expires_at > clock_timestamp()) AS orphan_writes',
    [CONVERSATION_RETENTION_POLICY.version],
  );
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) throw unavailable();
  const counts = {
    expiredEnvelopes: safeCount(result.rows[0].expired_envelopes),
    unboundCheckpoints: safeCount(result.rows[0].unbound_checkpoints),
    orphanWrites: safeCount(result.rows[0].orphan_writes),
  };
  if (Object.values(counts).some((value) => value === null)) throw unavailable();
  return Object.freeze(counts);
}

/**
 * Create a bounded manual retention operation after project validation.
 * This module does not create a pool, read environment variables, or log data.
 */
export function createConversationRetention({ pool, target } = {}) {
  assertServerOnlyRuntime();
  if (!VERIFIED_TARGETS.has(target)
    || VERIFIED_POOL_TARGETS.get(pool) !== target
    || !pool
    || typeof pool.query !== 'function'
    || typeof pool.connect !== 'function') {
    throw unavailable();
  }

  async function runOnce({ batchSize: requestedBatchSize } = {}) {
    const batchSize = batchSizeValue(requestedBatchSize);
    const identity = await pool.query(
      'SELECT current_database() AS database_name, current_user AS database_user',
    );
    if (!Array.isArray(identity?.rows)
      || identity.rows.length !== 1
      || identity.rows[0].database_name !== target.databaseName
      || identity.rows[0].database_user !== target.databaseUser) {
      throw unavailable();
    }

    const candidates = await pool.query(
      "SELECT conversation_id "
        + "FROM conversation_private.conversations "
        + "WHERE lifecycle IN ('active', 'deleting') "
        + "AND policy_version = $1 "
        + "AND expires_at <= clock_timestamp() "
        + "ORDER BY expires_at, conversation_id LIMIT $2",
      [CONVERSATION_RETENTION_POLICY.version, batchSize],
    );
    if (!Array.isArray(candidates?.rows) || candidates.rows.length > batchSize) throw unavailable();

    let deleted = 0;
    let skippedUnresolvedTurn = 0;
    let skippedChanged = 0;
    let failed = 0;
    for (const candidate of candidates.rows) {
      let conversationId;
      try {
        conversationId = validateConversationId(candidate.conversation_id);
      } catch {
        failed += 1;
        continue;
      }
      try {
        const outcome = await purgeExpiredConversation(pool, conversationId);
        if (outcome === 'DELETED') deleted += 1;
        else if (outcome === 'UNRESOLVED_TURN') skippedUnresolvedTurn += 1;
        else if (outcome === 'ARTIFACTS_REMAIN') failed += 1;
        else skippedChanged += 1;
      } catch {
        failed += 1;
      }
    }

    const checkpointCandidates = await pool.query(CHECKPOINT_CANDIDATES_SQL, [
      CONVERSATION_RETENTION_POLICY.version,
      batchSize,
    ]);
    if (!Array.isArray(checkpointCandidates?.rows)
      || checkpointCandidates.rows.length > batchSize) throw unavailable();

    let checkpointsPurged = 0;
    let checkpointEnvelopesPurged = 0;
    let checkpointWritesPurged = 0;
    let checkpointBlobsPurged = 0;
    for (const candidate of checkpointCandidates.rows) {
      try {
        const result = await purgeExpiredCheckpoint(pool, candidate);
        if (result.outcome === 'PURGED') {
          checkpointsPurged += result.checkpoints;
          checkpointEnvelopesPurged += result.envelopes;
          checkpointWritesPurged += result.writes;
          checkpointBlobsPurged += result.blobs;
        } else if (result.outcome === 'UNRESOLVED_TURN') {
          skippedUnresolvedTurn += 1;
        } else {
          skippedChanged += 1;
        }
      } catch {
        failed += 1;
      }
    }

    const metadataPurged = await purgeExpiredDeletionMetadata(pool, batchSize);
    const residual = await pool.query(
      "SELECT COUNT(*)::text AS count "
        + "FROM conversation_private.conversations "
        + "WHERE lifecycle IN ('active', 'deleting') "
        + "AND policy_version = $1 "
        + "AND expires_at <= clock_timestamp()",
      [CONVERSATION_RETENTION_POLICY.version],
    );
    if (!Array.isArray(residual?.rows) || residual.rows.length !== 1) throw unavailable();
    const remainingExpired = safeCount(residual.rows[0].count);
    if (remainingExpired === null) throw unavailable();
    const checkpointResidue = await countExpiredCheckpointArtifacts(pool);

    return Object.freeze({
      policyVersion: CONVERSATION_RETENTION_POLICY.version,
      batchSize,
      candidates: candidates.rows.length,
      deleted,
      checkpointCandidates: checkpointCandidates.rows.length,
      checkpointsPurged,
      checkpointEnvelopesPurged,
      checkpointWritesPurged,
      checkpointBlobsPurged,
      skippedUnresolvedTurn,
      skippedChanged,
      failed,
      metadataPurged,
      remainingExpired,
      remainingExpiredCheckpointEnvelopes: checkpointResidue.expiredEnvelopes,
      remainingUnboundCheckpoints: checkpointResidue.unboundCheckpoints,
      remainingOrphanCheckpointWrites: checkpointResidue.orphanWrites,
    });
  }

  return Object.freeze({ runOnce });
}

/**
 * Validate all operator-supplied target data before the first pool call.
 */
export async function runConversationMaintenance({
  createPool,
  projectRef,
  confirmProjectRef,
  supabaseUrl,
  databaseUrl,
  batchSize,
} = {}) {
  const target = validateConversationMaintenanceTarget({
    projectRef,
    confirmProjectRef,
    supabaseUrl,
    databaseUrl,
  });
  const pool = await openVerifiedPool({ target, databaseUrl, createPool });
  try {
    const retention = createConversationRetention({ pool, target });
    return await retention.runOnce({ batchSize });
  } finally {
    if (typeof pool.end === 'function') {
      try { await pool.end(); } catch { /* no database details leave this module */ }
    }
  }
}
