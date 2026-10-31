import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { assertExecutionLedgerPort } from '../persistence/ports.js';
import { validateConversationId, validateTurnId } from './conversation-contracts.js';
import { memoryAccessGate } from './access-gate.js';

assertServerOnlyRuntime();

export const CONVERSATION_LIFECYCLE_STATES = Object.freeze(['active', 'deleting', 'deleted']);
export const CONVERSATION_LIFECYCLE_OUTCOMES = Object.freeze([
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

const POLICY_VERSION = 'dec005-spec003-v1';
const SAFE_LEDGER_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ACCESS_DISABLED = Object.freeze({ outcome: 'ACCESS_DISABLED' });
const INVALID_ID = Object.freeze({ outcome: 'INVALID_ID' });
const NOT_FOUND = Object.freeze({ outcome: 'NOT_FOUND' });
const CONFLICT = Object.freeze({ outcome: 'CONFLICT' });
const LEDGER_UNRESOLVED = Object.freeze({ outcome: 'LEDGER_UNRESOLVED' });
const DEPENDENCY_UNAVAILABLE = Object.freeze({ outcome: 'DEPENDENCY_UNAVAILABLE' });

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
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
  if (!isPlainRecord(value)) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function parseRequest(value) {
  if (!isPlainRecord(value)
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

function accessWasDenied(value) {
  return ownValue(value, 'outcome') === 'ACCESS_DISABLED'
    || ownValue(ownValue(value, 'error'), 'code') === 'ACCESS_DISABLED';
}

async function runGated(accessGate, operation) {
  try {
    const result = await accessGate.run(operation);
    return accessWasDenied(result) ? ACCESS_DISABLED : result;
  } catch {
    return DEPENDENCY_UNAVAILABLE;
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
      try { await connection.query('ROLLBACK'); } catch { /* preserve the content-free failure */ }
    }
    throw new Error('Conversation lifecycle storage is unavailable.');
  } finally {
    connection.release();
  }
}

function countValue(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  try {
    const count = BigInt(value);
    if (count < 0n || count > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(count);
  } catch {
    return null;
  }
}

function isSafeLedgerResult(value) {
  if (!isPlainRecord(value)) return null;
  const status = ownValue(value, 'status');
  if (status === 'not_started') return Object.freeze({ status });
  if (status === 'completed') {
    const safeOutcomeReference = ownValue(value, 'safeOutcomeReference');
    if (typeof safeOutcomeReference !== 'string' || !SAFE_LEDGER_REFERENCE.test(safeOutcomeReference)) return null;
    return Object.freeze({ status, safeOutcomeReference });
  }
  return null;
}

function parseEnvelopeLedgerRefs(value) {
  let references = value;
  if (typeof references === 'string') {
    try { references = JSON.parse(references); } catch { return null; }
  }
  if (!Array.isArray(references) || references.length > 64
    || references.some((reference) => (
      typeof reference !== 'string' || !SAFE_LEDGER_REFERENCE.test(reference)
    ))) return null;
  return Object.freeze([...new Set(references)]);
}

function artifactsRemain(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) return null;
  const row = result.rows[0];
  const counts = {};
  for (const key of [
    'messages', 'turn_reservations', 'context_summaries', 'checkpoint_envelopes',
    'checkpoints', 'checkpoint_blobs', 'checkpoint_writes',
  ]) {
    const count = countValue(row[key]);
    if (count === null) return null;
    counts[key] = count;
  }
  return Object.freeze({ counts: Object.freeze(counts), any: Object.values(counts).some((count) => count !== 0) });
}

/**
 * Manage conversation lifecycle transitions over an injected server-side Pool.
 * The fixed MemoryAccessGate is closed by default. No pool is constructed,
 * environment value is read, or schema object is created in this module.
 *
 * DeletionService owns artifact removal. This port starts the transition,
 * reconciles active reservations, and verifies the final empty state before
 * marking the content-free lifecycle metadata as deleted.
 */
export function createConversationLifecycle({
  pool,
  turnCoordinator,
  executionLedger,
  accessGate = memoryAccessGate,
} = {}) {
  assertServerOnlyRuntime();
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function'
    || !turnCoordinator || typeof turnCoordinator.cancelConversation !== 'function'
    || !accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('Conversation lifecycle dependencies are invalid.');
  }
  const ledger = assertExecutionLedgerPort(executionLedger);

  async function beginDeletion(requestValue) {
    const request = parseRequest(requestValue);
    if (!request) return INVALID_ID;
    return runGated(accessGate, async () => {
      try {
        return await withTransaction(pool, async (connection) => {
          const priorOperation = await connection.query(
            `SELECT conversation_id, status
               FROM conversation_private.deletion_operations
              WHERE request_id = $1::uuid
              FOR UPDATE`,
            [request.requestId],
          );
          if (!Array.isArray(priorOperation.rows) || priorOperation.rows.length > 1) {
            throw new Error('Invalid deletion operation result.');
          }
          if (priorOperation.rows.length === 1) {
            const prior = priorOperation.rows[0];
            if (prior.conversation_id !== request.conversationId) return CONFLICT;
            if (prior.status === 'completed') return Object.freeze({ outcome: 'DELETED' });
            if (prior.status !== 'deleting') throw new Error('Invalid deletion operation state.');
          }

          const locked = await connection.query(
            `SELECT lifecycle, active_turn_id::text AS active_turn_id, policy_version
               FROM conversation_private.conversations
              WHERE conversation_id = $1
              FOR UPDATE`,
            [request.conversationId],
          );
          if (!Array.isArray(locked.rows) || locked.rows.length > 1) {
            throw new Error('Invalid conversation result.');
          }
          if (locked.rows.length === 0) return NOT_FOUND;
          const conversation = locked.rows[0];
          if (conversation.policy_version !== POLICY_VERSION
            || !['active', 'deleting', 'deleted'].includes(conversation.lifecycle)) {
            throw new Error('Invalid conversation lifecycle.');
          }
          if (conversation.lifecycle === 'deleted') {
            return priorOperation.rows.length === 1 && priorOperation.rows[0].status === 'completed'
              ? Object.freeze({ outcome: 'DELETED' })
              : CONFLICT;
          }

          const activeOperation = await connection.query(
            `SELECT request_id::text AS request_id
               FROM conversation_private.deletion_operations
              WHERE conversation_id = $1 AND status = 'deleting'
              ORDER BY started_at ASC
              LIMIT 1
              FOR UPDATE`,
            [request.conversationId],
          );
          if (!Array.isArray(activeOperation.rows) || activeOperation.rows.length > 1) {
            throw new Error('Invalid active deletion result.');
          }
          const activeRequestId = activeOperation.rows[0]?.request_id;
          if (activeRequestId && activeRequestId !== request.requestId) return CONFLICT;

          if (priorOperation.rows.length === 0) {
            const inserted = await connection.query(
              `INSERT INTO conversation_private.deletion_operations
                 (request_id, conversation_id, status)
               VALUES ($1::uuid, $2, 'deleting')
               ON CONFLICT (request_id) DO NOTHING
               RETURNING request_id::text AS request_id`,
              [request.requestId, request.conversationId],
            );
            if (!Array.isArray(inserted.rows) || inserted.rows.length !== 1) return CONFLICT;
          }

          if (conversation.lifecycle === 'active') {
            const updated = await connection.query(
              `UPDATE conversation_private.conversations
                  SET lifecycle = 'deleting'
                WHERE conversation_id = $1 AND lifecycle = 'active'
                RETURNING active_turn_id::text AS active_turn_id`,
              [request.conversationId],
            );
            if (!Array.isArray(updated.rows) || updated.rows.length !== 1) {
              throw new Error('Conversation lifecycle transition failed.');
            }
          }

          return Object.freeze({
            outcome: 'DELETING',
            activeTurn: conversation.active_turn_id !== null,
          });
        });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
    });
  }

  async function reconcileActiveTurn(requestValue) {
    const request = parseRequest(requestValue);
    if (!request) return INVALID_ID;
    return runGated(accessGate, async () => {
      let snapshot;
      let shouldCancel = false;
      try {
        snapshot = await withTransaction(pool, async (connection) => {
          const operation = await connection.query(
            `SELECT status FROM conversation_private.deletion_operations
              WHERE request_id = $1::uuid AND conversation_id = $2
              FOR UPDATE`,
            [request.requestId, request.conversationId],
          );
          if (!Array.isArray(operation.rows) || operation.rows.length > 1) {
            throw new Error('Invalid deletion operation result.');
          }
          if (operation.rows.length === 0) return { outcome: 'NOT_FOUND' };
          if (operation.rows[0].status === 'completed') return { outcome: 'DELETED' };
          if (operation.rows[0].status !== 'deleting') return { outcome: 'CONFLICT' };

          const conversation = await connection.query(
            `SELECT lifecycle, active_turn_id::text AS active_turn_id, policy_version
               FROM conversation_private.conversations
              WHERE conversation_id = $1
              FOR UPDATE`,
            [request.conversationId],
          );
          if (!Array.isArray(conversation.rows) || conversation.rows.length !== 1) {
            return { outcome: 'NOT_FOUND' };
          }
          const row = conversation.rows[0];
          if (row.policy_version !== POLICY_VERSION || row.lifecycle !== 'deleting') {
            return { outcome: 'CONFLICT' };
          }
          shouldCancel = row.active_turn_id !== null;

          const reservations = await connection.query(
            `SELECT turn_id::text AS turn_id, status
               FROM conversation_private.turn_reservations
              WHERE conversation_id = $1
                AND (status IN ('reserved', 'running', 'uncertain')
                  OR turn_id = $2::uuid)
              ORDER BY created_at ASC, turn_id ASC
              FOR UPDATE`,
            [request.conversationId, row.active_turn_id],
          );
          if (!Array.isArray(reservations.rows)) throw new Error('Invalid reservation result.');
          const activeReservations = reservations.rows.filter((item) => (
            ['reserved', 'running', 'uncertain'].includes(item.status)
          ));
          shouldCancel ||= activeReservations.length > 0;
          const reservationMismatch = activeReservations.some((item) => item.turn_id !== row.active_turn_id)
            || (row.active_turn_id !== null
              && !reservations.rows.some((item) => item.turn_id === row.active_turn_id));

          const turnIds = [...new Set([
            ...(row.active_turn_id === null ? [] : [row.active_turn_id]),
            ...reservations.rows.map((item) => item.turn_id),
          ])];
          const unboundCheckpoints = await connection.query(
            `SELECT COUNT(*)::text AS count
               FROM conversation_private.checkpoints AS c
               LEFT JOIN conversation_private.checkpoint_envelopes AS e
                 ON e.thread_id = c.thread_id
                AND e.checkpoint_ns = c.checkpoint_ns
                AND e.checkpoint_id = c.checkpoint_id
              WHERE c.thread_id = $1 AND e.checkpoint_id IS NULL`,
            [request.conversationId],
          );
          const hasUnboundCheckpoints = countValue(unboundCheckpoints.rows?.[0]?.count) !== 0;

          let envelopes = [];
          if (turnIds.length > 0) {
            const envelopeRows = await connection.query(
              `SELECT turn_id::text AS turn_id, ledger_refs
                 FROM conversation_private.checkpoint_envelopes
                WHERE thread_id = $1 AND turn_id = ANY($2::uuid[])
                ORDER BY turn_id ASC, updated_at ASC, checkpoint_ns ASC, checkpoint_id ASC
                FOR UPDATE`,
              [request.conversationId, turnIds],
            );
            if (!Array.isArray(envelopeRows.rows)) throw new Error('Invalid checkpoint envelope result.');
            envelopes = envelopeRows.rows.map((item) => {
              let turnId;
              try { turnId = validateTurnId(item.turn_id); } catch { return null; }
              const ledgerRefs = parseEnvelopeLedgerRefs(item.ledger_refs);
              return ledgerRefs === null ? null : Object.freeze({ turnId, ledgerRefs });
            });
          }

          const envelopesByTurn = new Map();
          for (const envelope of envelopes.filter(Boolean)) {
            const prior = envelopesByTurn.get(envelope.turnId) ?? [];
            prior.push(...envelope.ledgerRefs);
            envelopesByTurn.set(envelope.turnId, prior);
          }
          const reconciliation = [];
          let missingEnvelope = envelopes.some((item) => item === null);
          for (const turnId of turnIds) {
            if (!envelopesByTurn.has(turnId)) {
              missingEnvelope = true;
              continue;
            }
            const ledgerRefs = [...new Set(envelopesByTurn.get(turnId))];
            reconciliation.push(Object.freeze({ turnId, ledgerRefs: Object.freeze(ledgerRefs) }));
          }
          return {
            outcome: reservationMismatch || hasUnboundCheckpoints || missingEnvelope ? 'LEDGER_UNRESOLVED' : 'READY',
            activeTurnId: row.active_turn_id,
            shouldCancel,
            reservations: reservations.rows.map((item) => ({
              turnId: item.turn_id,
              status: item.status,
            })),
            reconciliation,
          };
        });
      } catch {
        snapshot = { outcome: 'DEPENDENCY_UNAVAILABLE', shouldCancel };
      }

      if (snapshot.shouldCancel || shouldCancel) {
        let cancelled;
        try {
          cancelled = await turnCoordinator.cancelConversation(request.conversationId);
        } catch {
          return LEDGER_UNRESOLVED;
        }
        const cancelOutcome = ownValue(cancelled, 'outcome');
        if (cancelOutcome !== 'CANCELLED' && cancelOutcome !== 'NOT_FOUND') return LEDGER_UNRESOLVED;
      }
      if (snapshot.outcome !== 'READY') return Object.freeze({ outcome: snapshot.outcome });

      const resolved = [];
      for (const turn of snapshot.reconciliation) {
        let ledgerStatus = 'not_started';
        for (const reference of turn.ledgerRefs) {
          let ledgerResult;
          try {
            ledgerResult = await ledger.lookup(reference);
          } catch {
            return LEDGER_UNRESOLVED;
          }
          const parsedLedger = isSafeLedgerResult(ledgerResult);
          if (!parsedLedger) return LEDGER_UNRESOLVED;
          if (parsedLedger.status === 'completed') ledgerStatus = 'completed';
        }
        resolved.push({ turnId: turn.turnId, ledgerStatus });
      }

      try {
        return await withTransaction(pool, async (connection) => {
          const operation = await connection.query(
            `SELECT status FROM conversation_private.deletion_operations
              WHERE request_id = $1::uuid AND conversation_id = $2
              FOR UPDATE`,
            [request.requestId, request.conversationId],
          );
          if (!Array.isArray(operation.rows) || operation.rows.length !== 1) return NOT_FOUND;
          if (operation.rows[0].status !== 'deleting') return CONFLICT;

          const conversation = await connection.query(
            `SELECT lifecycle, active_turn_id::text AS active_turn_id
               FROM conversation_private.conversations
              WHERE conversation_id = $1
              FOR UPDATE`,
            [request.conversationId],
          );
          if (!Array.isArray(conversation.rows) || conversation.rows.length !== 1) return NOT_FOUND;
          const row = conversation.rows[0];
          if (row.lifecycle !== 'deleting'
            || row.active_turn_id !== null && row.active_turn_id !== snapshot.activeTurnId) return CONFLICT;

          for (const reservation of resolved) {
            const terminalStatus = reservation.ledgerStatus === 'completed' ? 'completed' : 'cancelled';
            const update = terminalStatus === 'completed'
              ? await connection.query(
                `UPDATE conversation_private.turn_reservations
                    SET status = 'completed', completed_at = COALESCE(completed_at, clock_timestamp()),
                        updated_at = clock_timestamp()
                  WHERE conversation_id = $1 AND turn_id = $2::uuid
                    AND status IN ('reserved', 'running', 'uncertain')
                  RETURNING turn_id`,
                [request.conversationId, reservation.turnId],
              )
              : await connection.query(
                `UPDATE conversation_private.turn_reservations
                    SET status = 'cancelled', updated_at = clock_timestamp()
                  WHERE conversation_id = $1 AND turn_id = $2::uuid
                    AND status IN ('reserved', 'running', 'uncertain')
                  RETURNING turn_id`,
                [request.conversationId, reservation.turnId],
              );
            if (!Array.isArray(update.rows)) throw new Error('Invalid reservation update.');
            if (update.rows.length === 0) {
              const current = await connection.query(
                `SELECT status FROM conversation_private.turn_reservations
                  WHERE conversation_id = $1 AND turn_id = $2::uuid`,
                [request.conversationId, reservation.turnId],
              );
              if (!Array.isArray(current.rows) || current.rows.length !== 1
                || !['completed', 'cancelled', 'failed'].includes(current.rows[0].status)) {
                return LEDGER_UNRESOLVED;
              }
            }
          }

          if (row.active_turn_id !== null) {
            const cleared = await connection.query(
              `UPDATE conversation_private.conversations
                  SET active_turn_id = NULL
                WHERE conversation_id = $1 AND lifecycle = 'deleting'
                  AND active_turn_id = $2::uuid`,
              [request.conversationId, row.active_turn_id],
            );
            if (!Array.isArray(cleared.rows) || cleared.rows.length !== 1) {
              throw new Error('Active turn changed during reconciliation.');
            }
          }

          const unsettled = await connection.query(
            `SELECT COUNT(*)::text AS count
               FROM conversation_private.turn_reservations
              WHERE conversation_id = $1 AND status IN ('reserved', 'running', 'uncertain')`,
            [request.conversationId],
          );
          const remaining = countValue(unsettled.rows?.[0]?.count);
          if (remaining !== 0) return LEDGER_UNRESOLVED;
          return Object.freeze({ outcome: 'READY_FOR_PURGE' });
        });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
    });
  }

  async function completeDeletion(requestValue) {
    const request = parseRequest(requestValue);
    if (!request) return INVALID_ID;
    return runGated(accessGate, async () => {
      try {
        return await withTransaction(pool, async (connection) => {
          const operation = await connection.query(
            `SELECT status FROM conversation_private.deletion_operations
              WHERE request_id = $1::uuid AND conversation_id = $2
              FOR UPDATE`,
            [request.requestId, request.conversationId],
          );
          if (!Array.isArray(operation.rows) || operation.rows.length > 1) {
            throw new Error('Invalid deletion operation result.');
          }
          if (operation.rows.length === 0) return NOT_FOUND;
          if (operation.rows[0].status === 'completed') return Object.freeze({ outcome: 'DELETED' });
          if (operation.rows[0].status !== 'deleting') return CONFLICT;

          const conversation = await connection.query(
            `SELECT lifecycle, active_turn_id::text AS active_turn_id, policy_version
               FROM conversation_private.conversations
              WHERE conversation_id = $1
              FOR UPDATE`,
            [request.conversationId],
          );
          if (!Array.isArray(conversation.rows) || conversation.rows.length !== 1) return NOT_FOUND;
          const row = conversation.rows[0];
          if (row.lifecycle !== 'deleting' || row.policy_version !== POLICY_VERSION) return CONFLICT;
          if (row.active_turn_id !== null) return LEDGER_UNRESOLVED;

          const countsResult = await connection.query(
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
          const checked = artifactsRemain(countsResult);
          if (!checked) throw new Error('Invalid artifact count result.');
          if (checked.any) return Object.freeze({ outcome: 'ARTIFACTS_REMAIN', artifacts: checked.counts });

          const updatedConversation = await connection.query(
            `UPDATE conversation_private.conversations
                SET lifecycle = 'deleted', active_turn_id = NULL
              WHERE conversation_id = $1 AND lifecycle = 'deleting'
              RETURNING conversation_id`,
            [request.conversationId],
          );
          if (!Array.isArray(updatedConversation.rows) || updatedConversation.rows.length !== 1) {
            throw new Error('Conversation completion transition failed.');
          }

          const updatedOperation = await connection.query(
            `UPDATE conversation_private.deletion_operations
                SET status = 'completed', completed_at = statement_timestamp(),
                    updated_at = statement_timestamp(),
                    purge_after = statement_timestamp() + interval '30 days'
              WHERE request_id = $1::uuid AND conversation_id = $2 AND status = 'deleting'
              RETURNING request_id`,
            [request.requestId, request.conversationId],
          );
          if (!Array.isArray(updatedOperation.rows) || updatedOperation.rows.length !== 1) {
            throw new Error('Deletion operation completion failed.');
          }
          const removedConversation = await connection.query(
            `DELETE FROM conversation_private.conversations
              WHERE conversation_id = $1 AND lifecycle = 'deleted'
              RETURNING conversation_id`,
            [request.conversationId],
          );
          if (!Array.isArray(removedConversation.rows) || removedConversation.rows.length !== 1) {
            throw new Error('Conversation removal failed.');
          }
          return Object.freeze({ outcome: 'DELETED', artifacts: checked.counts });
        });
      } catch {
        return DEPENDENCY_UNAVAILABLE;
      }
    });
  }

  return Object.freeze({ beginDeletion, reconcileActiveTurn, completeDeletion });
}
