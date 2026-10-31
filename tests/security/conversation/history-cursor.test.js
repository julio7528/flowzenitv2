import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import { createPostgresConversationRepository } from '../../../server/agent/memory/conversation-repository.js';

const NOW = '2026-10-29T20:00:00.000Z';
const CONVERSATION_ID = '87e9ed4c-1277-4c8f-8771-df73bda2b001';
const OTHER_CONVERSATION_ID = '9c471275-bc96-4232-8c48-df32f01c31c1';
const TURN_ID = 'aaf9a536-798e-4683-9596-fb438ba26111';
const CURSOR_KEY = Buffer.alloc(32, 0x5a);

function messageRow(sequence) {
  const suffix = BigInt(sequence).toString(16).slice(-12).padStart(12, '0');
  return {
    message_id: `00000000-0000-4000-8000-${suffix}`,
    message_seq: String(sequence),
    turn_id: TURN_ID,
    role: 'user',
    content: `synthetic message ${sequence}`,
    created_at: NOW,
  };
}

function signSyntheticCursor(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', CURSOR_KEY).update(body, 'ascii').digest('base64url');
  return `${body}.${signature}`;
}

function createFakePool({ messages = [] } = {}) {
  const state = { messages: [...messages], connectionCount: 0, messageReads: [] };
  const connection = {
    async query(statement, params = []) {
      const sql = statement.replace(/\s+/g, ' ').trim().toLowerCase();
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') return { rows: [] };

      if (sql.includes('from conversation_private.conversations as c')) {
        const currentMax = state.messages.reduce((max, row) => (
          BigInt(row.message_seq) > max ? BigInt(row.message_seq) : max
        ), 0n);
        return {
          rows: [{
            conversation_id: params[0],
            lifecycle: 'active',
            created_at: NOW,
            last_activity_at: NOW,
            expires_at: '2027-10-29T20:00:00.000Z',
            last_message_seq: currentMax.toString(),
            policy_version: 'dec005-spec003-v1',
            active_turn_id: null,
            storage_now: NOW,
          }],
        };
      }

      if (sql.includes('from conversation_private.messages as m')) {
        const [conversationId, afterSequence, throughSequence, limit] = params;
        state.messageReads.push({ conversationId, afterSequence, throughSequence });
        return {
          rows: state.messages
            .filter((row) => conversationId === CONVERSATION_ID
              && BigInt(row.message_seq) > BigInt(afterSequence)
              && BigInt(row.message_seq) <= BigInt(throughSequence))
            .sort((left, right) => (BigInt(left.message_seq) < BigInt(right.message_seq) ? -1 : 1))
            .slice(0, limit),
        };
      }

      throw new Error(`Unexpected synthetic query: ${sql}`);
    },
    release() {},
  };

  return {
    state,
    pool: {
      async query() {
        throw new Error('History pagination must use a checked-out connection.');
      },
      async connect() {
        state.connectionCount += 1;
        return connection;
      },
    },
  };
}

function createRepository(pool) {
  return createPostgresConversationRepository({
    config: createConversationMemoryConfig({
      pool,
      cursorHmacKey: CURSOR_KEY,
      now: () => new Date(NOW),
    }),
  });
}

test('forged, mutated, cross-conversation, and page-size cursors are rejected before storage', async () => {
  const fake = createFakePool({ messages: [messageRow(1), messageRow(2), messageRow(3)] });
  const repository = createRepository(fake.pool);
  const initial = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 1 });
  const initialConnections = fake.state.connectionCount;
  const [body, signature] = initial.nextCursor.split('.');
  const mutated = `${body.slice(0, -1)}${body.endsWith('A') ? 'B' : 'A'}.${signature}`;
  const forgedOtherConversation = signSyntheticCursor({
    cursorVersion: 1,
    conversationId: OTHER_CONVERSATION_ID,
    pageSize: 1,
    snapshotMaxMessageSeq: '3',
    lastMessageSeq: '1',
  });
  const forgedPageSize = signSyntheticCursor({
    cursorVersion: 1,
    conversationId: CONVERSATION_ID,
    pageSize: 2,
    snapshotMaxMessageSeq: '3',
    lastMessageSeq: '1',
  });

  assert.equal((await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 1, cursor: mutated })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 1, cursor: forgedOtherConversation })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 1, cursor: forgedPageSize })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: OTHER_CONVERSATION_ID, pageSize: 1, cursor: initial.nextCursor })).outcome, 'invalid_id');
  assert.equal(fake.state.connectionCount, initialConnections);
  assert.equal(fake.state.messageReads.length, 1);
});

test('continuation preserves its original snapshot while fresh pagination sees later rows exactly once', async () => {
  const fake = createFakePool({ messages: [messageRow(1), messageRow(2), messageRow(3), messageRow(4)] });
  const repository = createRepository(fake.pool);
  const first = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 2 });
  assert.deepEqual(first.messages.map((row) => row.messageSeq), ['1', '2']);
  assert.equal(first.snapshotMaxMessageSeq, '4');

  fake.state.messages.push(messageRow(5), messageRow(6));
  const continuation = await repository.getHistory({
    conversationId: CONVERSATION_ID,
    pageSize: 2,
    cursor: first.nextCursor,
  });
  assert.deepEqual(continuation.messages.map((row) => row.messageSeq), ['3', '4']);
  assert.equal(continuation.snapshotMaxMessageSeq, '4');
  assert.equal(continuation.nextCursor, null);
  assert.equal(fake.state.messageReads.at(-1).throughSequence, '4');

  const freshSequences = [];
  let page = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 2 });
  assert.equal(page.snapshotMaxMessageSeq, '6');
  while (true) {
    freshSequences.push(...page.messages.map((row) => row.messageSeq));
    if (page.nextCursor === null) break;
    page = await repository.getHistory({
      conversationId: CONVERSATION_ID,
      pageSize: 2,
      cursor: page.nextCursor,
    });
  }
  assert.deepEqual(freshSequences, ['1', '2', '3', '4', '5', '6']);
  assert.equal(new Set(freshSequences).size, freshSequences.length);
  assert.equal(fake.state.messageReads.at(-1).throughSequence, '6');
});
