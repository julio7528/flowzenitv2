import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import { createPostgresConversationRepository, createGuardedConversationRepository } from '../../../server/agent/memory/conversation-repository.js';
import { createConversationLifecycle } from '../../../server/agent/memory/lifecycle.js';
import { createDeletionService } from '../../../server/agent/memory/deletion-service.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';

const conversationId = '00000000-0000-4000-8000-000000000931';
const unrelatedConversationId = '00000000-0000-4000-8000-000000000932';
const requestId = '00000000-0000-4000-8000-000000000933';
const turnId = '00000000-0000-4000-8000-000000000934';
const unrelatedTurnId = '00000000-0000-4000-8000-000000000935';
const checkpointId = 'checkpoint-synthetic-recovery-931';
const checkpointNs = 'synthetic:recovery';
const now = new Date('2026-10-29T21:00:00.000Z');

function openGate() {
  return Object.freeze({ run: (operation) => operation() });
}

function clone(value) {
  return structuredClone(value);
}

function createSyntheticStorage() {
  const state = {
    conversations: new Map([
      [conversationId, {
        conversation_id: conversationId,
        lifecycle: 'active',
        active_turn_id: null,
        created_at: new Date('2026-10-29T20:00:00.000Z'),
        last_activity_at: new Date('2026-10-29T20:00:00.000Z'),
        expires_at: new Date('2027-10-29T20:00:00.000Z'),
        last_message_seq: '1',
        policy_version: 'dec005-spec003-v1',
      }],
      [unrelatedConversationId, {
        conversation_id: unrelatedConversationId,
        lifecycle: 'active',
        active_turn_id: null,
        created_at: new Date('2026-10-29T20:00:00.000Z'),
        last_activity_at: new Date('2026-10-29T20:00:00.000Z'),
        expires_at: new Date('2027-10-29T20:00:00.000Z'),
        last_message_seq: '1',
        policy_version: 'dec005-spec003-v1',
      }],
    ]),
    messages: [
      { conversation_id: conversationId, message_seq: '1', turn_id: turnId, role: 'user', content: 'synthetic target' },
      { conversation_id: unrelatedConversationId, message_seq: '1', turn_id: unrelatedTurnId, role: 'user', content: 'synthetic unrelated' },
    ],
    reservations: [
      { conversation_id: conversationId, turn_id: turnId, status: 'cancelled', idempotency_key: 'synthetic-target' },
      { conversation_id: unrelatedConversationId, turn_id: unrelatedTurnId, status: 'cancelled', idempotency_key: 'synthetic-unrelated' },
    ],
    checkpoints: [
      { thread_id: conversationId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId, checkpoint: { marker: 'target' } },
      { thread_id: unrelatedConversationId, checkpoint_ns: checkpointNs, checkpoint_id: 'checkpoint-unrelated-932', checkpoint: { marker: 'other' } },
    ],
    envelopes: [
      { thread_id: conversationId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId, turn_id: turnId, ledger_refs: [] },
      { thread_id: unrelatedConversationId, checkpoint_ns: checkpointNs, checkpoint_id: 'checkpoint-unrelated-932', turn_id: unrelatedTurnId, ledger_refs: [] },
    ],
    blobs: [
      { thread_id: conversationId, checkpoint_ns: checkpointNs, channel: 'target', version: '1' },
      { thread_id: unrelatedConversationId, checkpoint_ns: checkpointNs, channel: 'other', version: '1' },
    ],
    writes: [
      { thread_id: conversationId, checkpoint_ns: checkpointNs, task_id: 'target' },
      { thread_id: unrelatedConversationId, checkpoint_ns: checkpointNs, task_id: 'other' },
    ],
    summaries: [
      { conversation_id: conversationId, summary: 'synthetic target summary' },
      { conversation_id: unrelatedConversationId, summary: 'synthetic unrelated summary' },
    ],
    deletionOperations: new Map(),
    transactionStatements: [],
    deleteAttempts: [],
    rollbackCount: 0,
  };
  const failureControl = { failOnMessageDelete: true };

  function snapshotDatabaseState() {
    return clone({
      conversations: state.conversations,
      messages: state.messages,
      reservations: state.reservations,
      checkpoints: state.checkpoints,
      envelopes: state.envelopes,
      blobs: state.blobs,
      writes: state.writes,
      summaries: state.summaries,
      deletionOperations: state.deletionOperations,
    });
  }

  function restoreDatabaseState(snapshot) {
    for (const key of Object.keys(snapshot)) state[key] = snapshot[key];
  }

  function countArtifacts(targetId) {
    return {
      messages: String(state.messages.filter((row) => row.conversation_id === targetId).length),
      turn_reservations: String(state.reservations.filter((row) => row.conversation_id === targetId).length),
      context_summaries: String(state.summaries.filter((row) => row.conversation_id === targetId).length),
      checkpoint_envelopes: String(state.envelopes.filter((row) => row.thread_id === targetId).length),
      checkpoints: String(state.checkpoints.filter((row) => row.thread_id === targetId).length),
      checkpoint_blobs: String(state.blobs.filter((row) => row.thread_id === targetId).length),
      checkpoint_writes: String(state.writes.filter((row) => row.thread_id === targetId).length),
    };
  }

  let transactionSnapshot = null;
  async function query(statement, params = []) {
    const sql = statement.replace(/\s+/g, ' ').trim().toLowerCase();
    if (sql === 'begin') {
      transactionSnapshot = snapshotDatabaseState();
      state.transactionStatements.push('BEGIN');
      return { rows: [], rowCount: null };
    }
    if (sql === 'commit') {
      transactionSnapshot = null;
      state.transactionStatements.push('COMMIT');
      return { rows: [], rowCount: null };
    }
    if (sql === 'rollback') {
      if (transactionSnapshot) restoreDatabaseState(transactionSnapshot);
      transactionSnapshot = null;
      state.transactionStatements.push('ROLLBACK');
      state.rollbackCount += 1;
      return { rows: [], rowCount: null };
    }

    if (sql.startsWith('select conversation_id, status from conversation_private.deletion_operations')) {
      const operation = state.deletionOperations.get(params[0]);
      return { rows: operation ? [{ conversation_id: operation.conversation_id, status: operation.status }] : [] };
    }

    if (sql.startsWith('select status from conversation_private.deletion_operations')) {
      const operation = state.deletionOperations.get(params[0]);
      return {
        rows: operation && operation.conversation_id === params[1]
          ? [{ status: operation.status }]
          : [],
      };
    }

    if (sql.startsWith('select request_id::text as request_id from conversation_private.deletion_operations')) {
      const active = [...state.deletionOperations.entries()]
        .find(([, operation]) => operation.conversation_id === params[0] && operation.status === 'deleting');
      return { rows: active ? [{ request_id: active[0] }] : [] };
    }

    if (sql.startsWith('insert into conversation_private.deletion_operations')) {
      const [operationId, targetId] = params;
      if (state.deletionOperations.has(operationId)) return { rows: [] };
      state.deletionOperations.set(operationId, {
        request_id: operationId,
        conversation_id: targetId,
        status: 'deleting',
      });
      return { rows: [{ request_id: operationId }] };
    }

    if (sql.startsWith('select c.conversation_id, c.lifecycle, c.created_at')) {
      const targetId = params[0];
      const conversation = state.conversations.get(targetId);
      return {
        rows: conversation ? [{
          ...conversation,
          storage_now: now,
        }] : [],
      };
    }

    if (sql.startsWith('select lifecycle, active_turn_id::text as active_turn_id, policy_version')) {
      const conversation = state.conversations.get(params[0]);
      return { rows: conversation ? [{ ...conversation }] : [] };
    }

    if (sql.startsWith('select lifecycle, active_turn_id::text as active_turn_id')) {
      const conversation = state.conversations.get(params[0]);
      return { rows: conversation ? [{ ...conversation }] : [] };
    }

    if (sql.startsWith('select lifecycle from conversation_private.conversations')) {
      const conversation = state.conversations.get(params[0]);
      return { rows: conversation ? [{ lifecycle: conversation.lifecycle }] : [] };
    }

    if (sql.startsWith('update conversation_private.conversations') && sql.includes("set lifecycle = 'deleting'")) {
      const conversation = state.conversations.get(params[0]);
      if (!conversation || conversation.lifecycle !== 'active') return { rows: [] };
      conversation.lifecycle = 'deleting';
      return { rows: [{ active_turn_id: conversation.active_turn_id }] };
    }

    if (sql.startsWith('select turn_id::text as turn_id, status from conversation_private.turn_reservations')) {
      const [targetId, activeTurnId] = params;
      return {
        rows: state.reservations
          .filter((row) => row.conversation_id === targetId
            && (['reserved', 'running', 'uncertain'].includes(row.status) || row.turn_id === activeTurnId))
          .map(({ turn_id, status }) => ({ turn_id, status })),
      };
    }

    if (sql.startsWith('select count(*)::text as count from conversation_private.checkpoints as c')) {
      const targetId = params[0];
      const bound = new Set(state.envelopes.map((row) => `${row.thread_id}:${row.checkpoint_ns}:${row.checkpoint_id}`));
      const count = state.checkpoints.filter((row) => row.thread_id === targetId
        && !bound.has(`${row.thread_id}:${row.checkpoint_ns}:${row.checkpoint_id}`)).length;
      return { rows: [{ count: String(count) }] };
    }

    if (sql.startsWith('select turn_id::text as turn_id, ledger_refs from conversation_private.checkpoint_envelopes')) {
      const [targetId, turnIds] = params;
      return {
        rows: state.envelopes
          .filter((row) => row.thread_id === targetId && turnIds.includes(row.turn_id))
          .map(({ turn_id, ledger_refs }) => ({ turn_id, ledger_refs })),
      };
    }

    if (sql.startsWith("update conversation_private.conversations") && sql.includes('set active_turn_id = null')) {
      const [targetId, expectedTurnId] = params;
      const conversation = state.conversations.get(targetId);
      if (!conversation || conversation.lifecycle !== 'deleting' || conversation.active_turn_id !== expectedTurnId) {
        return { rows: [] };
      }
      conversation.active_turn_id = null;
      return { rows: [{ conversation_id: targetId }] };
    }

    if (sql.startsWith('select count(*)::text as count from conversation_private.turn_reservations')) {
      const count = state.reservations.filter((row) => row.conversation_id === params[0]
        && ['reserved', 'running', 'uncertain'].includes(row.status)).length;
      return { rows: [{ count: String(count) }] };
    }

    if (sql.startsWith('select turn_id::text as turn_id from conversation_private.turn_reservations')) {
      return {
        rows: state.reservations
          .filter((row) => row.conversation_id === params[0]
            && ['reserved', 'running', 'uncertain'].includes(row.status))
          .map(({ turn_id }) => ({ turn_id })),
      };
    }

    if (sql.startsWith('delete from conversation_private.')
      && !sql.startsWith('delete from conversation_private.conversations')) {
      const targetId = params[0];
      const tableRows = [
        ['checkpoint_writes', state.writes, 'thread_id'],
        ['checkpoint_blobs', state.blobs, 'thread_id'],
        ['checkpoint_envelopes', state.envelopes, 'thread_id'],
        ['checkpoints', state.checkpoints, 'thread_id'],
        ['context_summaries', state.summaries, 'conversation_id'],
        ['messages', state.messages, 'conversation_id'],
        ['turn_reservations', state.reservations, 'conversation_id'],
      ].find(([table]) => sql.includes(`conversation_private.${table}`));
      if (!tableRows) throw new Error(`Unexpected synthetic DELETE: ${sql}`);
      const [table, rows, field] = tableRows;
      state.deleteAttempts.push(table);
      if (table === 'messages' && failureControl.failOnMessageDelete) {
        failureControl.failOnMessageDelete = false;
        throw new Error('Synthetic one-time failure during message deletion.');
      }
      const originalLength = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index][field] === targetId) rows.splice(index, 1);
      }
      return { rows: [], rowCount: originalLength - rows.length };
    }

    if (sql.startsWith('select') && sql.includes('as messages') && sql.includes('as turn_reservations')) {
      return { rows: [countArtifacts(params[0])] };
    }

    if (sql.startsWith("update conversation_private.conversations") && sql.includes("set lifecycle = 'deleted'")) {
      const conversation = state.conversations.get(params[0]);
      if (!conversation || conversation.lifecycle !== 'deleting') return { rows: [] };
      conversation.lifecycle = 'deleted';
      conversation.active_turn_id = null;
      return { rows: [{ conversation_id: params[0] }] };
    }

    if (sql.startsWith('update conversation_private.deletion_operations')) {
      const [operationId, targetId] = params;
      const operation = state.deletionOperations.get(operationId);
      if (!operation || operation.conversation_id !== targetId || operation.status !== 'deleting') return { rows: [] };
      operation.status = 'completed';
      operation.completed_at = new Date('2026-10-29T21:01:00.000Z');
      operation.purge_after = new Date('2026-11-28T21:01:00.000Z');
      return { rows: [{ request_id: operationId }] };
    }

    if (sql.startsWith('delete from conversation_private.conversations')) {
      const conversation = state.conversations.get(params[0]);
      if (!conversation || conversation.lifecycle !== 'deleted') return { rows: [], rowCount: 0 };
      state.conversations.delete(params[0]);
      return { rows: [{ conversation_id: params[0] }], rowCount: 1 };
    }

    if (sql.startsWith('select c.conversation_id, c.lifecycle')) {
      const conversation = state.conversations.get(params[0]);
      return { rows: conversation ? [{ ...conversation, storage_now: now }] : [] };
    }

    throw new Error(`Unexpected synthetic SQL: ${sql}`);
  }

  const connection = { query, release() {} };
  const pool = {
    query,
    async connect() { return connection; },
  };
  return { state, pool };
}

function createLedger() {
  return {
    async reserve() { return { status: 'reserved' }; },
    async recordStarted() { return { acknowledged: true }; },
    async recordOutcome() { return { acknowledged: true }; },
    async lookup() { return { status: 'not_started' }; },
  };
}

function artifactSnapshot(state, targetId) {
  return {
    messages: state.messages.filter((row) => row.conversation_id === targetId).map((row) => clone(row)),
    reservations: state.reservations.filter((row) => row.conversation_id === targetId).map((row) => clone(row)),
    summaries: state.summaries.filter((row) => row.conversation_id === targetId).map((row) => clone(row)),
    envelopes: state.envelopes.filter((row) => row.thread_id === targetId).map((row) => clone(row)),
    checkpoints: state.checkpoints.filter((row) => row.thread_id === targetId).map((row) => clone(row)),
    blobs: state.blobs.filter((row) => row.thread_id === targetId).map((row) => clone(row)),
    writes: state.writes.filter((row) => row.thread_id === targetId).map((row) => clone(row)),
  };
}

test('failed partial purge stays inaccessible in deleting and safely completes on idempotent retry', async () => {
  const synthetic = createSyntheticStorage();
  const gate = openGate();
  const ledger = createLedger();
  const lifecycle = createConversationLifecycle({
    pool: synthetic.pool,
    turnCoordinator: { async cancelConversation() { return { outcome: 'NOT_FOUND' }; } },
    executionLedger: ledger,
    accessGate: gate,
  });
  const deletionService = createDeletionService({ pool: synthetic.pool, lifecycle, accessGate: gate });
  const repository = createGuardedConversationRepository({
    repository: createPostgresConversationRepository({
      config: createConversationMemoryConfig({
        pool: synthetic.pool,
        cursorHmacKey: Buffer.alloc(32, 0x31),
        now: () => now,
      }),
    }),
    accessGate: gate,
  });
  const targetArtifacts = artifactSnapshot(synthetic.state, conversationId);
  const unrelatedArtifacts = artifactSnapshot(synthetic.state, unrelatedConversationId);

  assert.equal(memoryAccessGate.isOpen(), false);
  assert.deepEqual(await deletionService.deleteConversation({ conversationId, requestId }), {
    outcome: 'DEPENDENCY_UNAVAILABLE',
  });

  assert.equal(synthetic.state.rollbackCount, 1, 'the interrupted purge rolled its transaction back');
  assert.deepEqual(artifactSnapshot(synthetic.state, conversationId), targetArtifacts,
    'all target artifacts survive the partial purge failure');
  assert.equal(synthetic.state.conversations.get(conversationId).lifecycle, 'deleting');
  assert.equal(synthetic.state.deletionOperations.get(requestId).status, 'deleting');
  assert.deepEqual(synthetic.state.deleteAttempts, [
    'checkpoint_writes', 'checkpoint_blobs', 'checkpoint_envelopes', 'checkpoints', 'context_summaries', 'messages',
  ]);

  const metadata = await repository.getConversationMetadata({ conversationId });
  assert.equal(metadata.lifecycle, 'deleting');
  assert.equal((await repository.getHistory({ conversationId })).outcome, 'not_found');
  assert.equal((await repository.reserveTurn({
    conversationId,
    idempotencyKey: 'synthetic-recovery-reserve-931',
    payloadHash: 'a'.repeat(64),
    turnId: '00000000-0000-4000-8000-000000000936',
    correlationId: '00000000-0000-4000-8000-000000000937',
  })).outcome, 'deleting');
  assert.equal((await repository.appendTurn({
    conversationId,
    turnId,
    messages: [{ role: 'assistant', content: 'synthetic blocked append' }],
  })).outcome, 'deleting');

  const retryResult = await deletionService.deleteConversation({ conversationId, requestId });
  assert.equal(retryResult.outcome, 'DELETED');
  assert.equal(synthetic.state.conversations.has(conversationId), false);
  assert.equal(synthetic.state.deletionOperations.get(requestId).status, 'completed');
  assert.deepEqual(Object.keys(synthetic.state.deletionOperations.get(requestId)).sort(), [
    'completed_at', 'conversation_id', 'purge_after', 'request_id', 'status',
  ]);
  assert.deepEqual(artifactSnapshot(synthetic.state, conversationId), {
    messages: [], reservations: [], summaries: [], envelopes: [], checkpoints: [], blobs: [], writes: [],
  });
  assert.deepEqual(artifactSnapshot(synthetic.state, unrelatedConversationId), unrelatedArtifacts,
    'retry deletes only the exact target conversation and leaves unrelated artifacts intact');
  assert.equal(synthetic.state.conversations.get(unrelatedConversationId).lifecycle, 'active');
  assert.equal(synthetic.state.rollbackCount, 1);
  assert.equal(synthetic.state.transactionStatements.filter((statement) => statement === 'BEGIN').length,
    synthetic.state.transactionStatements.filter((statement) => statement === 'COMMIT').length + 1,
    'only the injected mid-purge transaction rolled back');
});
