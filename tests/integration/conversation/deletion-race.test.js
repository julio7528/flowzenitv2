import assert from 'node:assert/strict';
import test from 'node:test';
import { createConversationLifecycle } from '../../../server/agent/memory/lifecycle.js';
import { createDeletionService } from '../../../server/agent/memory/deletion-service.js';
import { createTurnCoordinator } from '../../../server/agent/memory/turn-coordinator.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';

const conversationId = '00000000-0000-4000-8000-000000000901';
const unrelatedConversationId = '00000000-0000-4000-8000-000000000902';
const turnId = '00000000-0000-4000-8000-000000000903';
const correlationId = '00000000-0000-4000-8000-000000000904';
const deleteRequestId = '00000000-0000-4000-8000-000000000905';
const ledgerRef = 'ledger-synthetic-delete-race-901';
const checkpointId = 'checkpoint-synthetic-delete-race-901';
const checkpointNs = 'synthetic:delete-race';
const now = new Date('2026-10-29T21:00:00.000Z');

function deferred() {
  let resolve;
  const promise = new Promise((finish) => { resolve = finish; });
  return { promise, resolve };
}

function openGate() {
  return Object.freeze({ run: (operation) => operation() });
}

function createSyntheticStorage() {
  const state = {
    conversations: new Map([
      [conversationId, {
        conversation_id: conversationId,
        lifecycle: 'active',
        active_turn_id: null,
        policy_version: 'dec005-spec003-v1',
      }],
      [unrelatedConversationId, {
        conversation_id: unrelatedConversationId,
        lifecycle: 'active',
        active_turn_id: null,
        policy_version: 'dec005-spec003-v1',
      }],
    ]),
    messages: [
      { conversation_id: conversationId, message_seq: '1', role: 'user', content: 'synthetic old request' },
      { conversation_id: conversationId, message_seq: '2', role: 'assistant', content: 'synthetic old response' },
      { conversation_id: unrelatedConversationId, message_seq: '1', role: 'user', content: 'unrelated fixture' },
    ],
    reservations: [],
    checkpoints: [],
    envelopes: [],
    blobs: [],
    writes: [],
    summaries: [
      { conversation_id: conversationId, summary: 'synthetic summary only' },
      { conversation_id: unrelatedConversationId, summary: 'unrelated synthetic summary' },
    ],
    deletionOperations: new Map(),
    transactionStatements: [],
  };

  const countArtifacts = (targetId) => ({
    messages: String(state.messages.filter((row) => row.conversation_id === targetId).length),
    turn_reservations: String(state.reservations.filter((row) => row.conversation_id === targetId).length),
    context_summaries: String(state.summaries.filter((row) => row.conversation_id === targetId).length),
    checkpoint_envelopes: String(state.envelopes.filter((row) => row.thread_id === targetId).length),
    checkpoints: String(state.checkpoints.filter((row) => row.thread_id === targetId).length),
    checkpoint_blobs: String(state.blobs.filter((row) => row.thread_id === targetId).length),
    checkpoint_writes: String(state.writes.filter((row) => row.thread_id === targetId).length),
  });

  async function query(statement, params = []) {
    const sql = statement.replace(/\s+/g, ' ').trim().toLowerCase();
    if (['begin', 'commit', 'rollback'].includes(sql)) {
      state.transactionStatements.push(sql.toUpperCase());
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
        .find(([, item]) => item.conversation_id === params[0] && item.status === 'deleting');
      return { rows: active ? [{ request_id: active[0] }] : [] };
    }

    if (sql.startsWith('insert into conversation_private.deletion_operations')) {
      const [requestId, targetId] = params;
      if (state.deletionOperations.has(requestId)) return { rows: [] };
      state.deletionOperations.set(requestId, {
        request_id: requestId,
        conversation_id: targetId,
        status: 'deleting',
      });
      return { rows: [{ request_id: requestId }] };
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
          .sort((left, right) => left.created_at - right.created_at)
          .map(({ turn_id, status }) => ({ turn_id, status })),
      };
    }

    if (sql.startsWith('select count(*)::text as count from conversation_private.checkpoints as c')) {
      const targetId = params[0];
      const bound = new Set(state.envelopes.map((row) => `${row.thread_id}:${row.checkpoint_ns}:${row.checkpoint_id}`));
      const unbound = state.checkpoints.filter((row) => row.thread_id === targetId
        && !bound.has(`${row.thread_id}:${row.checkpoint_ns}:${row.checkpoint_id}`)).length;
      return { rows: [{ count: String(unbound) }] };
    }

    if (sql.startsWith('select turn_id::text as turn_id, ledger_refs from conversation_private.checkpoint_envelopes')) {
      const [targetId, turnIds] = params;
      return {
        rows: state.envelopes
          .filter((row) => row.thread_id === targetId && turnIds.includes(row.turn_id))
          .map(({ turn_id, ledger_refs }) => ({ turn_id, ledger_refs })),
      };
    }

    if (sql.startsWith("update conversation_private.turn_reservations")
      && sql.includes("set status = 'cancelled'")) {
      const [targetId, targetTurnId] = params;
      const reservation = state.reservations.find((row) => row.conversation_id === targetId
        && row.turn_id === targetTurnId
        && ['reserved', 'running', 'uncertain'].includes(row.status));
      if (!reservation) return { rows: [] };
      reservation.status = 'cancelled';
      return { rows: [{ turn_id: targetTurnId }] };
    }

    if (sql.startsWith('update conversation_private.conversations')
      && sql.includes('set active_turn_id = null')) {
      const [targetId, expectedTurnId] = params;
      const conversation = state.conversations.get(targetId);
      if (!conversation || conversation.lifecycle !== 'deleting' || conversation.active_turn_id !== expectedTurnId) {
        return { rows: [] };
      }
      conversation.active_turn_id = null;
      return { rows: [{ conversation_id: targetId }] };
    }

    if (sql.startsWith('select count(*)::text as count from conversation_private.turn_reservations')) {
      const active = state.reservations.filter((row) => row.conversation_id === params[0]
        && ['reserved', 'running', 'uncertain'].includes(row.status)).length;
      return { rows: [{ count: String(active) }] };
    }

    if (sql.startsWith('select turn_id::text as turn_id from conversation_private.turn_reservations')) {
      const active = state.reservations
        .filter((row) => row.conversation_id === params[0]
          && ['reserved', 'running', 'uncertain'].includes(row.status))
        .map(({ turn_id }) => ({ turn_id }));
      return { rows: active };
    }

    if (sql.startsWith('delete from conversation_private.')
      && !sql.startsWith('delete from conversation_private.conversations')) {
      const targetId = params[0];
      const mapping = [
        ['checkpoint_writes', state.writes, 'thread_id'],
        ['checkpoint_blobs', state.blobs, 'thread_id'],
        ['checkpoint_envelopes', state.envelopes, 'thread_id'],
        ['checkpoints', state.checkpoints, 'thread_id'],
        ['context_summaries', state.summaries, 'conversation_id'],
        ['messages', state.messages, 'conversation_id'],
        ['turn_reservations', state.reservations, 'conversation_id'],
      ];
      const [, rows, field] = mapping.find(([table]) => sql.includes(`conversation_private.${table}`)) ?? [];
      if (!rows) throw new Error(`Unexpected synthetic DELETE: ${sql}`);
      const priorLength = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index][field] === targetId) rows.splice(index, 1);
      }
      return { rows: [], rowCount: priorLength - rows.length };
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
      const [requestId, targetId] = params;
      const operation = state.deletionOperations.get(requestId);
      if (!operation || operation.conversation_id !== targetId || operation.status !== 'deleting') return { rows: [] };
      operation.status = 'completed';
      operation.purge_after = '2026-11-28T21:00:00.000Z';
      return { rows: [{ request_id: requestId }] };
    }

    if (sql.startsWith('delete from conversation_private.conversations')) {
      const conversation = state.conversations.get(params[0]);
      if (!conversation || conversation.lifecycle !== 'deleted') return { rows: [], rowCount: 0 };
      state.conversations.delete(params[0]);
      return { rows: [{ conversation_id: params[0] }], rowCount: 1 };
    }

    throw new Error(`Unexpected synthetic SQL: ${sql}`);
  }

  const connection = { query, release() {} };
  return {
    state,
    pool: {
      query,
      async connect() { return connection; },
    },
  };
}

function createConversationRepository(state) {
  return Object.freeze({
    async getConversationMetadata() { return null; },
    async getHistory() {
      return { outcome: 'empty', messages: [], nextCursor: null, snapshotMaxMessageSeq: '0' };
    },
    async reserveTurn(request) {
      const conversation = state.conversations.get(request.conversationId);
      if (!conversation) return { outcome: 'not_found' };
      if (conversation.lifecycle === 'deleting') return { outcome: 'deleting' };
      if (conversation.lifecycle !== 'active' || conversation.active_turn_id !== null) {
        return { outcome: 'conflict' };
      }
      conversation.active_turn_id = request.turnId;
      state.reservations.push({
        conversation_id: request.conversationId,
        idempotency_key: request.idempotencyKey,
        turn_id: request.turnId,
        status: 'reserved',
        created_at: now,
      });
      state.checkpoints.push({
        thread_id: request.conversationId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      });
      state.envelopes.push({
        thread_id: request.conversationId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
        turn_id: request.turnId,
        ledger_refs: [ledgerRef],
      });
      state.blobs.push({ thread_id: request.conversationId, channel: 'synthetic' });
      state.writes.push({ thread_id: request.conversationId, task_id: 'synthetic-task' });
      return { outcome: 'reserved' };
    },
    async appendTurn(request) {
      const conversation = state.conversations.get(request.conversationId);
      if (!conversation) return { outcome: 'not_found' };
      if (conversation.lifecycle === 'deleting') return { outcome: 'deleting' };
      const reservation = state.reservations.find((row) => (
        row.conversation_id === request.conversationId && row.turn_id === request.turnId
      ));
      if (conversation.lifecycle !== 'active' || conversation.active_turn_id !== request.turnId
        || !reservation || reservation.status !== 'reserved') return { outcome: 'conflict' };
      state.messages.push(...request.messages.map((message) => ({
        conversation_id: request.conversationId,
        turn_id: request.turnId,
        ...message,
      })));
      reservation.status = 'completed';
      conversation.active_turn_id = null;
      return { outcome: 'appended', messages: request.messages };
    },
  });
}

function createExecutionLedger() {
  let lookupCount = 0;
  return {
    async reserve() { return { status: 'reserved' }; },
    async recordStarted() { return { acknowledged: true }; },
    async recordOutcome() { return { acknowledged: true }; },
    async lookup(reference) {
      assert.equal(reference, ledgerRef);
      lookupCount += 1;
      return { status: 'not_started' };
    },
    get lookupCount() { return lookupCount; },
  };
}

test('deletion cancels an active turn, purges only its artifacts, and blocks a late append', async () => {
  const synthetic = createSyntheticStorage();
  const gate = openGate();
  const ledger = createExecutionLedger();
  const coordinator = createTurnCoordinator({
    conversationRepository: createConversationRepository(synthetic.state),
    executionLedger: ledger,
    accessGate: gate,
  });
  const lifecycle = createConversationLifecycle({
    pool: synthetic.pool,
    turnCoordinator: coordinator,
    executionLedger: ledger,
    accessGate: gate,
  });
  const deletionService = createDeletionService({
    pool: synthetic.pool,
    lifecycle,
    accessGate: gate,
  });

  assert.equal(memoryAccessGate.isOpen(), false);

  const executorStarted = deferred();
  const executorAborted = deferred();
  const releaseExecutor = deferred();
  let turnSignal;
  const runningTurn = coordinator.run({
    conversationId,
    turnId,
    correlationId,
    idempotencyKey: 'synthetic-delete-race-request-901',
    message: 'synthetic request in progress',
  }, async ({ signal }) => {
    turnSignal = signal;
    executorStarted.resolve();
    if (signal.aborted) executorAborted.resolve();
    else signal.addEventListener('abort', () => executorAborted.resolve(), { once: true });
    await executorAborted.promise;
    await releaseExecutor.promise;
    return { messages: [{ role: 'assistant', content: 'synthetic late response' }] };
  }, { ledgerRefs: [ledgerRef] });

  await executorStarted.promise;
  assert.equal(synthetic.state.conversations.get(conversationId).active_turn_id, turnId);
  assert.equal(synthetic.state.reservations[0].status, 'reserved');
  assert.ok(synthetic.state.messages.some((row) => row.conversation_id === conversationId));

  const deletion = deletionService.deleteConversation({ conversationId, requestId: deleteRequestId });
  await executorAborted.promise;
  const deletionResult = await deletion;

  assert.equal(turnSignal.aborted, true);
  assert.equal(deletionResult.outcome, 'DELETED');
  assert.equal(synthetic.state.conversations.has(conversationId), false);
  assert.equal(synthetic.state.deletionOperations.get(deleteRequestId).status, 'completed');
  assert.deepEqual(Object.keys(synthetic.state.deletionOperations.get(deleteRequestId)).sort(), [
    'conversation_id', 'purge_after', 'request_id', 'status',
  ]);
  assert.deepEqual(synthetic.state.messages.map((row) => row.conversation_id), [unrelatedConversationId]);
  assert.equal(synthetic.state.reservations.some((row) => row.conversation_id === conversationId), false);
  assert.equal(synthetic.state.summaries.some((row) => row.conversation_id === conversationId), false);
  assert.equal(synthetic.state.checkpoints.some((row) => row.thread_id === conversationId), false);
  assert.equal(synthetic.state.envelopes.some((row) => row.thread_id === conversationId), false);
  assert.equal(synthetic.state.blobs.some((row) => row.thread_id === conversationId), false);
  assert.equal(synthetic.state.writes.some((row) => row.thread_id === conversationId), false);
  assert.equal(synthetic.state.conversations.has(unrelatedConversationId), true);
  assert.equal(synthetic.state.messages.some((row) => row.conversation_id === unrelatedConversationId), true);

  releaseExecutor.resolve();
  const turnResult = await runningTurn;
  assert.equal(turnResult.outcome, 'NOT_FOUND');
  assert.equal(synthetic.state.messages.some((row) => row.conversation_id === conversationId), false);
  assert.equal(ledger.lookupCount, 3, 'turn preflight, delete reconciliation, and turn postflight used the durable ledger');
  assert.equal(synthetic.state.transactionStatements.filter((statement) => statement === 'BEGIN').length,
    synthetic.state.transactionStatements.filter((statement) => statement === 'COMMIT').length);
});
