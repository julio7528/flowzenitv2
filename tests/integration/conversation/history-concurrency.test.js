import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import { createPostgresConversationRepository } from '../../../server/agent/memory/conversation-repository.js';
import { createTurnCoordinator } from '../../../server/agent/memory/turn-coordinator.js';

const NOW = new Date('2026-10-29T20:00:00.000Z');
const CONVERSATION_ID = '780ea11b-fc8a-466b-92a4-f83233bd9001';

function deferred() {
  let resolve;
  const promise = new Promise((finish) => { resolve = finish; });
  return { promise, resolve };
}

function makeMessageRow({ messageId, sequence, turnId, role, content, createdAt }) {
  return {
    message_id: messageId,
    conversation_id: CONVERSATION_ID,
    message_seq: String(sequence),
    turn_id: turnId,
    role,
    content,
    created_at: createdAt,
  };
}

function createSyntheticPool() {
  const state = {
    conversation: {
      lifecycle: 'active',
      created_at: NOW,
      last_activity_at: NOW,
      expires_at: new Date(NOW.getTime() + 365 * 24 * 60 * 60 * 1000),
      last_message_seq: '0',
      policy_version: 'dec005-spec003-v1',
      active_turn_id: null,
    },
    reservations: [],
    messages: [],
    transactionStatements: [],
    lockStatements: [],
  };

  const connection = {
    async query(statement, params = []) {
      const sql = statement.replace(/\s+/g, ' ').trim();
      const lower = sql.toLowerCase();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql.toUpperCase())) {
        state.transactionStatements.push(sql.toUpperCase());
        return { rows: [] };
      }

      if (lower.includes('from conversation_private.conversations as c')) {
        state.lockStatements.push(sql);
        if (params[0] !== CONVERSATION_ID) return { rows: [] };
        return {
          rows: [{
            conversation_id: CONVERSATION_ID,
            ...state.conversation,
            last_message_seq: String(state.conversation.last_message_seq),
            active_turn_id: state.conversation.active_turn_id,
            storage_now: NOW,
          }],
        };
      }

      if (lower.includes('from conversation_private.turn_reservations as r')
        && lower.includes('r.idempotency_key = $2')) {
        const row = state.reservations.find((candidate) => (
          candidate.conversation_id === params[0] && candidate.idempotency_key === params[1]
        ));
        return { rows: row ? [{ ...row }] : [] };
      }

      if (lower.includes('from conversation_private.turn_reservations as r')
        && lower.includes('r.turn_id = $2::uuid')) {
        const row = state.reservations.find((candidate) => (
          candidate.conversation_id === params[0] && candidate.turn_id === params[1]
        ));
        return {
          rows: row ? [{
            idempotency_key: row.idempotency_key,
            turn_id: row.turn_id,
            status: row.status,
          }] : [],
        };
      }

      if (lower.startsWith('insert into conversation_private.turn_reservations')) {
        const [conversationId, idempotencyKey, payloadHash, turnId, correlationId] = params;
        if (state.reservations.some((row) => (
          row.conversation_id === conversationId && row.idempotency_key === idempotencyKey
        ))) return { rows: [] };
        const row = {
          conversation_id: conversationId,
          idempotency_key: idempotencyKey,
          payload_hash: payloadHash,
          turn_id: turnId,
          correlation_id: correlationId,
          status: 'reserved',
        };
        state.reservations.push(row);
        return { rows: [{ turn_id: turnId, correlation_id: correlationId, status: 'reserved' }] };
      }

      if (lower.startsWith('update conversation_private.conversations as c')
        && lower.includes('set active_turn_id = $2::uuid')) {
        const [conversationId, turnId] = params;
        if (conversationId !== CONVERSATION_ID
          || state.conversation.lifecycle !== 'active'
          || state.conversation.active_turn_id !== null) return { rows: [] };
        state.conversation.active_turn_id = turnId;
        return { rows: [{ active_turn_id: turnId }] };
      }

      if (lower.includes('from conversation_private.messages as m')) {
        const [conversationId, afterSequence, throughSequence, limit] = params;
        const after = BigInt(afterSequence);
        const through = BigInt(throughSequence);
        return {
          rows: state.messages
            .filter((row) => row.conversation_id === conversationId
              && BigInt(row.message_seq) > after
              && BigInt(row.message_seq) <= through)
            .sort((left, right) => BigInt(left.message_seq) < BigInt(right.message_seq) ? -1 : 1)
            .slice(0, limit)
            .map((row) => ({ ...row })),
        };
      }

      if (lower.includes('from conversation_private.messages') && lower.includes('turn_id = $2')) {
        const [conversationId, turnId] = params;
        return {
          rows: state.messages
            .filter((row) => row.conversation_id === conversationId && row.turn_id === turnId)
            .sort((left, right) => BigInt(left.message_seq) < BigInt(right.message_seq) ? -1 : 1)
            .map((row) => ({
              message_id: row.message_id,
              message_seq: row.message_seq,
              turn_id: row.turn_id,
              role: row.role,
              content: row.content,
              created_at: row.created_at,
            })),
        };
      }

      if (lower.startsWith('with activity as materialized')) {
        const [conversationId, count, , turnId, idempotencyKey, messageIds, roles, contents] = params;
        const reservation = state.reservations.find((row) => (
          row.conversation_id === conversationId && row.turn_id === turnId
        ));
        if (conversationId !== CONVERSATION_ID
          || state.conversation.lifecycle !== 'active'
          || state.conversation.active_turn_id !== turnId
          || !reservation || reservation.idempotency_key !== idempotencyKey
          || !['reserved', 'running'].includes(reservation.status)) return { rows: [] };

        const previousSequence = BigInt(state.conversation.last_message_seq);
        const createdAt = new Date(NOW.getTime() + Number(previousSequence) * 1000);
        state.conversation.last_message_seq = (previousSequence + BigInt(count)).toString();
        state.conversation.last_activity_at = createdAt;
        state.conversation.expires_at = new Date(createdAt.getTime() + 365 * 24 * 60 * 60 * 1000);
        state.conversation.active_turn_id = null;

        const rows = messageIds.map((messageId, index) => makeMessageRow({
          messageId,
          sequence: previousSequence + BigInt(index + 1),
          turnId,
          role: roles[index],
          content: contents[index],
          createdAt,
        }));
        state.messages.push(...rows);
        return { rows: rows.map((row) => ({ ...row })) };
      }

      if (lower.startsWith('update conversation_private.turn_reservations as r')) {
        const [conversationId, turnId, completedAt, replayMessageId] = params;
        const row = state.reservations.find((item) => (
          item.conversation_id === conversationId && item.turn_id === turnId
            && ['reserved', 'running'].includes(item.status)
        ));
        if (!row) return { rows: [] };
        row.status = 'completed';
        row.completed_at = completedAt;
        row.updated_at = completedAt;
        row.replay_message_id = replayMessageId;
        return { rows: [{ turn_id: turnId }] };
      }

      throw new Error(`Unexpected synthetic SQL: ${sql}`);
    },
    release() {},
  };

  return {
    state,
    pool: {
      async query(statement, params) {
        return connection.query(statement, params);
      },
      async connect() { return connection; },
    },
  };
}

function createRepository(pool) {
  return createPostgresConversationRepository({
    config: createConversationMemoryConfig({
      pool,
      cursorHmacKey: Buffer.alloc(32, 0x4d),
      now: () => NOW,
    }),
  });
}

function createLedger() {
  return {
    async reserve() { return { status: 'reserved' }; },
    async recordStarted() { return { acknowledged: true }; },
    async recordOutcome() { return { acknowledged: true }; },
    async lookup() { return { status: 'not_started' }; },
  };
}

function request({ turnId, correlationId, idempotencyKey, message }) {
  return { conversationId: CONVERSATION_ID, turnId, correlationId, idempotencyKey, message };
}

function gate() {
  return { run: (operation) => operation() };
}

test('repository pagination retains monotonic sequence and snapshot while concurrent conversation turns serialize', async () => {
  const synthetic = createSyntheticPool();
  const repository = createRepository(synthetic.pool);
  const coordinator = createTurnCoordinator({
    conversationRepository: repository,
    executionLedger: createLedger(),
    accessGate: gate(),
  });

  const firstTurnId = '780ea11b-fc8a-466b-92a4-f83233bd9101';
  const secondTurnId = '780ea11b-fc8a-466b-92a4-f83233bd9102';
  const firstStarted = deferred();
  const releaseFirst = deferred();
  let activeExecutors = 0;
  let maxConcurrentExecutors = 0;
  let executionCount = 0;

  const executeTurn = async ({ turnId }) => {
    executionCount += 1;
    activeExecutors += 1;
    maxConcurrentExecutors = Math.max(maxConcurrentExecutors, activeExecutors);
    if (turnId === firstTurnId) {
      firstStarted.resolve();
      await releaseFirst.promise;
    }
    activeExecutors -= 1;
    return { messages: [{ role: 'assistant', content: `synthetic response ${turnId}` }] };
  };

  const first = coordinator.run(request({
    turnId: firstTurnId,
    correlationId: '780ea11b-fc8a-466b-92a4-f83233bd9201',
    idempotencyKey: 'synthetic-history-turn-001',
    message: 'synthetic first request',
  }), executeTurn, { ledgerRefs: [] });

  await firstStarted.promise;
  const second = coordinator.run(request({
    turnId: secondTurnId,
    correlationId: '780ea11b-fc8a-466b-92a4-f83233bd9202',
    idempotencyKey: 'synthetic-history-turn-002',
    message: 'synthetic second request',
  }), executeTurn, { ledgerRefs: [] });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(executionCount, 1, 'the second turn waits behind the first conversation lock');
  releaseFirst.resolve();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.outcome, 'COMPLETED');
  assert.equal(secondResult.outcome, 'COMPLETED');
  assert.equal(executionCount, 2);
  assert.equal(maxConcurrentExecutors, 1);
  assert.equal(synthetic.state.reservations.length, 2);
  assert.ok(synthetic.state.reservations.every((item) => item.status === 'completed'));
  assert.deepEqual(synthetic.state.messages.map((item) => item.message_seq), ['1', '2', '3', '4']);
  assert.equal(new Set(synthetic.state.messages.map((item) => item.message_id)).size, 4);
  assert.ok(synthetic.state.lockStatements.filter((sql) => sql.includes('FOR UPDATE OF c')).length >= 4);

  const pageOne = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 2 });
  assert.deepEqual(pageOne.messages.map((item) => item.messageSeq), ['1', '2']);
  assert.equal(pageOne.snapshotMaxMessageSeq, '4');
  assert.equal(typeof pageOne.nextCursor, 'string');

  const thirdResult = await coordinator.run(request({
    turnId: '780ea11b-fc8a-466b-92a4-f83233bd9103',
    correlationId: '780ea11b-fc8a-466b-92a4-f83233bd9203',
    idempotencyKey: 'synthetic-history-turn-003',
    message: 'synthetic later request',
  }), async ({ turnId }) => ({
    messages: [{ role: 'assistant', content: `synthetic response ${turnId}` }],
  }), { ledgerRefs: [] });
  assert.equal(thirdResult.outcome, 'COMPLETED');
  assert.deepEqual(synthetic.state.messages.map((item) => item.message_seq), ['1', '2', '3', '4', '5', '6']);

  const pageTwo = await repository.getHistory({
    conversationId: CONVERSATION_ID,
    pageSize: 2,
    cursor: pageOne.nextCursor,
  });
  assert.deepEqual(pageTwo.messages.map((item) => item.messageSeq), ['3', '4']);
  assert.equal(pageTwo.snapshotMaxMessageSeq, '4');
  assert.equal(pageTwo.nextCursor, null);

  const freshPage = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 100 });
  assert.deepEqual(freshPage.messages.map((item) => item.messageSeq), ['1', '2', '3', '4', '5', '6']);
  assert.equal(freshPage.snapshotMaxMessageSeq, '6');
  assert.deepEqual(synthetic.state.transactionStatements.filter((statement) => statement === 'BEGIN').length,
    synthetic.state.transactionStatements.filter((statement) => statement === 'COMMIT').length);
});
