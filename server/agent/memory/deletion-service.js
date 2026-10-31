import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { memoryAccessGate } from './access-gate.js';
import { validateConversationId, validateTurnId } from './conversation-contracts.js';

assertServerOnlyRuntime();

export const CONVERSATION_DELETION_OUTCOMES = Object.freeze([
  'ACCESS_DISABLED',
  'INVALID_ID',
  'NOT_FOUND',
  'CONFLICT',
  'DELETING',
  'DELETED',
  'READY_FOR_PURGE',
  'LEDGER_UNRESOLVED',
  'ARTIFACTS_REMAIN',
  'DEPENDENCY_UNAVAILABLE',
]);

const ACCESS_DISABLED = Object.freeze({ outcome: 'ACCESS_DISABLED' });
const INVALID_ID = Object.freeze({ outcome: 'INVALID_ID' });
const NOT_FOUND = Object.freeze({ outcome: 'NOT_FOUND' });
const CONFLICT = Object.freeze({ outcome: 'CONFLICT' });
const LEDGER_UNRESOLVED = Object.freeze({ outcome: 'LEDGER_UNRESOLVED' });
const DEPENDENCY_UNAVAILABLE = Object.freeze({ outcome: 'DEPENDENCY_UNAVAILABLE' });
const SAFE_ARTIFACT_COUNTS = Object.freeze([
  'messages',
  'turn_reservations',
  'context_summaries',
  'checkpoint_envelopes',
  'checkpoints',
  'checkpoint_blobs',
  'checkpoint_writes',
]);

function isPlainDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && Object.getOwnPropertySymbols(value).length === 0
      && Object.values(Object.getOwnPropertyDescriptors(value))
        .every((descriptor) => Object.hasOwn(descriptor, 'value'));
  } catch {
    return false;
  }
}

function ownValue(value, key) {
  if (!isPlainDataRecord(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function parseRequest(value) {
  if (!isPlainDataRecord(value)
    || Object.keys(value).some((key) => !['conversationId', 'requestId'].includes(key))) return null;
  try {
    return Object.freeze({
      conversationId: validateConversationId(ownValue(value, 'conversationId')),
      requestId: validateTurnId(ownValue(value, 'requestId')),
    });
  } catch {
    return null;
  }
}

function isAccessDenied(value) {
  return ownValue(value, 'outcome') === 'ACCESS_DISABLED'
    || ownValue(ownValue(value, 'error'), 'code') === 'ACCESS_DISABLED';
}

async function runGated(accessGate, operation) {
  try {
    const result = await accessGate.run(operation);
    if (isAccessDenied(result)) return ACCESS_DISABLED;
    if (result === undefined || result === null) return DEPENDENCY_UNAVAILABLE;
    return result;
  } catch {
    return DEPENDENCY_UNAVAILABLE;
  }
}

function parseCount(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  try {
    const count = BigInt(value);
    if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(count);
  } catch {
    return null;
  }
}

function parseArtifactCounts(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) return null;
  const row = result.rows[0];
  const counts = {};
  for (const category of SAFE_ARTIFACT_COUNTS) {
    const count = parseCount(row[category]);
    if (count === null) return null;
    counts[category] = count;
  }
  return Object.freeze({
    counts: Object.freeze(counts),
    any: Object.values(counts).some((count) => count !== 0),
  });
}

function requireDeleteResult(result) {
  if (!Number.isSafeInteger(result?.rowCount) || result.rowCount < 0) {
    throw new Error('Conversation deletion did not return an affected-row count.');
  }
}

async function withTransaction(pool, operation) {
  const connection = await pool.connect();
  let began = false;
  try {
    await connection.query('BEGIN');
    began = true;
    const result = await operation(connection);
    await connection.query('COMMIT');
    began = false;
    return result;
  } catch {
    if (began) {
      try { await connection.query('ROLLBACK'); } catch { /* preserve a content-free error */ }
    }
    throw new Error('Conversation deletion storage is unavailable.');
  } finally {
    connection.release();
  }
}

/**
 * Purge conversation-owned content after the lifecycle has blocked access and
 * reconciled active turns. This service never creates a pool or reads config;
 * its default access gate denies the operation before SQL is executed.
 */
export function createDeletionService({ pool, lifecycle, accessGate = memoryAccessGate } = {}) {
  assertServerOnlyRuntime();
  if (!pool || typeof pool.connect !== 'function' || typeof pool.query !== 'function'
    || !lifecycle
    || typeof lifecycle.beginDeletion !== 'function'
    || typeof lifecycle.reconcileActiveTurn !== 'function'
    || typeof lifecycle.completeDeletion !== 'function'
    || !accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('Conversation deletion dependencies are invalid.');
  }

  async function deleteConversation(value) {
    const request = parseRequest(value);
    if (!request) return INVALID_ID;

    return runGated(accessGate, async () => {
      let begun;
      try {
        begun = await lifecycle.beginDeletion(request);
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      if (isAccessDenied(begun)) return ACCESS_DISABLED;
      const beginOutcome = ownValue(begun, 'outcome');
      if (beginOutcome === 'DELETED') return Object.freeze({ outcome: 'DELETED' });
      if (beginOutcome !== 'DELETING') return mapLifecycleOutcome(beginOutcome);

      let reconciled;
      try {
        reconciled = await lifecycle.reconcileActiveTurn(request);
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      if (isAccessDenied(reconciled)) return ACCESS_DISABLED;
      const reconcileOutcome = ownValue(reconciled, 'outcome');
      if (reconcileOutcome === 'DELETED') return Object.freeze({ outcome: 'DELETED' });
      if (reconcileOutcome !== 'READY_FOR_PURGE') return mapLifecycleOutcome(reconcileOutcome);

      let purge;
      try {
        purge = await withTransaction(pool, async (connection) => {
          const operation = await connection.query(
            `SELECT status
               FROM conversation_private.deletion_operations
              WHERE request_id = $1::uuid AND conversation_id = $2
              FOR UPDATE`,
            [request.requestId, request.conversationId],
          );
          if (!Array.isArray(operation?.rows)) {
            throw new Error('Conversation deletion operation query returned an invalid result.');
          }
          if (operation.rows.length === 0) return NOT_FOUND;
          if (operation.rows.length !== 1) {
            throw new Error('Conversation deletion operation query returned an invalid result.');
          }
          const operationRows = operation.rows;
          if (operationRows[0].status === 'completed') return Object.freeze({ outcome: 'DELETED' });
          if (operationRows[0].status !== 'deleting') return CONFLICT;

          // Lock order matches lifecycle completion: operation first, then a
          // non-locking lifecycle read. A row lock here could deadlock with a
          // different request that holds the conversation while checking the
          // active deletion operation.
          const conversation = await connection.query(
            `SELECT lifecycle
               FROM conversation_private.conversations
              WHERE conversation_id = $1`,
            [request.conversationId],
          );
          if (!Array.isArray(conversation?.rows)) {
            throw new Error('Conversation deletion state query returned an invalid result.');
          }
          if (conversation.rows.length === 0) return NOT_FOUND;
          if (conversation.rows.length !== 1) {
            throw new Error('Conversation deletion state query returned an invalid result.');
          }
          const conversationRows = conversation.rows;
          if (conversationRows[0].lifecycle !== 'deleting') return CONFLICT;

          const activeReservations = await connection.query(
            `SELECT turn_id::text AS turn_id
               FROM conversation_private.turn_reservations
              WHERE conversation_id = $1
                AND status IN ('reserved', 'running', 'uncertain')
              FOR UPDATE`,
            [request.conversationId],
          );
          if (!Array.isArray(activeReservations?.rows)) {
            throw new Error('Conversation reservation query returned an invalid result.');
          }
          if (activeReservations.rows.length > 0) return LEDGER_UNRESOLVED;

          const deletes = [
            `DELETE FROM conversation_private.checkpoint_writes WHERE thread_id = $1`,
            `DELETE FROM conversation_private.checkpoint_blobs WHERE thread_id = $1`,
            `DELETE FROM conversation_private.checkpoint_envelopes WHERE thread_id = $1`,
            `DELETE FROM conversation_private.checkpoints WHERE thread_id = $1`,
            `DELETE FROM conversation_private.context_summaries WHERE conversation_id = $1`,
            `DELETE FROM conversation_private.messages WHERE conversation_id = $1`,
            `DELETE FROM conversation_private.turn_reservations WHERE conversation_id = $1`,
          ];
          for (const statement of deletes) {
            requireDeleteResult(await connection.query(statement, [request.conversationId]));
          }

          const remaining = await connection.query(
            `SELECT
               (SELECT COUNT(*)::text FROM conversation_private.messages WHERE conversation_id = $1) AS messages,
               (SELECT COUNT(*)::text FROM conversation_private.turn_reservations WHERE conversation_id = $1) AS turn_reservations,
               (SELECT COUNT(*)::text FROM conversation_private.context_summaries WHERE conversation_id = $1) AS context_summaries,
               (SELECT COUNT(*)::text FROM conversation_private.checkpoint_envelopes WHERE thread_id = $1) AS checkpoint_envelopes,
               (SELECT COUNT(*)::text FROM conversation_private.checkpoints WHERE thread_id = $1) AS checkpoints,
               (SELECT COUNT(*)::text FROM conversation_private.checkpoint_blobs WHERE thread_id = $1) AS checkpoint_blobs,
               (SELECT COUNT(*)::text FROM conversation_private.checkpoint_writes WHERE thread_id = $1) AS checkpoint_writes`,
            [request.conversationId],
          );
          const artifacts = parseArtifactCounts(remaining);
          if (!artifacts) throw new Error('Conversation artifact verification failed.');
          if (artifacts.any) {
            return Object.freeze({ outcome: 'ARTIFACTS_REMAIN', artifacts: artifacts.counts });
          }
          return Object.freeze({ outcome: 'READY_FOR_PURGE', artifacts: artifacts.counts });
        });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }

      const purgeOutcome = ownValue(purge, 'outcome');
      if (purgeOutcome !== 'READY_FOR_PURGE') return purge;

      let completed;
      try {
        completed = await lifecycle.completeDeletion(request);
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
      if (isAccessDenied(completed)) return ACCESS_DISABLED;
      const completeOutcome = ownValue(completed, 'outcome');
      if (completeOutcome === 'DELETED') {
        return Object.freeze({ outcome: 'DELETED', artifacts: purge.artifacts });
      }
      return mapLifecycleOutcome(completeOutcome);
    });
  }

  return Object.freeze({ deleteConversation });
}

function mapLifecycleOutcome(outcome) {
  if (outcome === 'ACCESS_DISABLED') return ACCESS_DISABLED;
  if (outcome === 'INVALID_ID') return INVALID_ID;
  if (outcome === 'NOT_FOUND') return NOT_FOUND;
  if (outcome === 'CONFLICT') return CONFLICT;
  if (outcome === 'LEDGER_UNRESOLVED') return LEDGER_UNRESOLVED;
  if (outcome === 'ARTIFACTS_REMAIN') return Object.freeze({ outcome: 'ARTIFACTS_REMAIN' });
  if (outcome === 'DEPENDENCY_UNAVAILABLE') return DEPENDENCY_UNAVAILABLE;
  if (outcome === 'DELETING') return Object.freeze({ outcome: 'DELETING' });
  if (outcome === 'DELETED') return Object.freeze({ outcome: 'DELETED' });
  if (outcome === 'READY_FOR_PURGE') return Object.freeze({ outcome: 'READY_FOR_PURGE' });
  return DEPENDENCY_UNAVAILABLE;
}
