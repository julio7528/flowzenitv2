import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import { createPostgresConversationRepository } from '../../../server/agent/memory/conversation-repository.js';

const NOW = '2026-10-29T20:00:00.000Z';
const CONVERSATION_ID = '87e9ed4c-1277-4c8f-8771-df73bda2b001';
const OTHER_CONVERSATION_ID = '9c471275-bc96-4232-8c48-df32f01c31c1';
const TURN_ID = 'aaf9a536-798e-4683-9596-fb438ba26111';

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

function createFakePool({ conversationId = CONVERSATION_ID, messages = [] } = {}) {
  const state = {
    conversationId,
    messages: [...messages],
    connectCalls: 0,
    messageQueries: [],
  };

  const connection = {
    async query(statement, params = []) {
      const sql = statement.replace(/\s+/g, ' ').trim().toLowerCase();
      if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
        return { rows: [] };
      }
      if (sql.includes('from conversation_private.conversations as c')) {
        if (params[0] !== state.conversationId) return { rows: [] };
        const maxSequence = state.messages.reduce((max, message) => (
          BigInt(message.message_seq) > max ? BigInt(message.message_seq) : max
        ), 0n);
        return {
          rows: [{
            conversation_id: state.conversationId,
            lifecycle: 'active',
            created_at: NOW,
            last_activity_at: NOW,
            expires_at: '2027-10-29T20:00:00.000Z',
            last_message_seq: maxSequence.toString(),
            policy_version: 'dec005-spec003-v1',
            active_turn_id: null,
            storage_now: NOW,
          }],
        };
      }
      if (sql.includes('from conversation_private.messages as m')) {
        const [requestedConversationId, afterSequence, throughSequence, limit] = params;
        state.messageQueries.push({ afterSequence, throughSequence, limit });
        const after = BigInt(afterSequence);
        const through = BigInt(throughSequence);
        return {
          rows: state.messages
            .filter((message) => requestedConversationId === state.conversationId
              && BigInt(message.message_seq) > after
              && BigInt(message.message_seq) <= through)
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
        throw new Error('Direct pool queries are not expected by history pagination.');
      },
      async connect() {
        state.connectCalls += 1;
        return connection;
      },
    },
  };
}

function createRepository(pool) {
  return createPostgresConversationRepository({
    config: createConversationMemoryConfig({
      pool,
      cursorHmacKey: Buffer.alloc(32, 0x5a),
      now: () => new Date(NOW),
    }),
  });
}

test('history cursors preserve the initial snapshot and bigint sequence strings across pages', async () => {
  const firstSequence = 9007199254740992n;
  const fake = createFakePool({
    messages: [
      messageRow(firstSequence),
      messageRow(firstSequence + 1n),
      messageRow(firstSequence + 2n),
    ],
  });
  const repository = createRepository(fake.pool);

  const firstPage = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 2 });
  assert.equal(firstPage.outcome, 'ok');
  assert.deepEqual(firstPage.messages.map((message) => message.messageSeq), [
    firstSequence.toString(),
    (firstSequence + 1n).toString(),
  ]);
  assert.equal(firstPage.snapshotMaxMessageSeq, (firstSequence + 2n).toString());
  assert.equal(typeof firstPage.nextCursor, 'string');

  fake.state.messages.push(messageRow(firstSequence + 3n));
  const secondPage = await repository.getHistory({
    conversationId: CONVERSATION_ID,
    pageSize: 2,
    cursor: firstPage.nextCursor,
  });
  assert.equal(secondPage.outcome, 'ok');
  assert.deepEqual(secondPage.messages.map((message) => message.messageSeq), [
    (firstSequence + 2n).toString(),
  ]);
  assert.equal(secondPage.nextCursor, null);
  assert.equal(secondPage.snapshotMaxMessageSeq, (firstSequence + 2n).toString());
  assert.equal(fake.state.messageQueries[1].throughSequence, (firstSequence + 2n).toString());
});

test('default and maximum page sizes are enforced before querying messages', async () => {
  const fake = createFakePool({ messages: Array.from({ length: 101 }, (_, index) => messageRow(index + 1)) });
  const repository = createRepository(fake.pool);

  const defaultPage = await repository.getHistory({ conversationId: CONVERSATION_ID });
  assert.equal(defaultPage.messages.length, 50);
  assert.equal(fake.state.messageQueries.at(-1).limit, 51);

  const maximumPage = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 100 });
  assert.equal(maximumPage.messages.length, 100);
  assert.equal(fake.state.messageQueries.at(-1).limit, 101);
  assert.ok(maximumPage.messages.every((message) => typeof message.messageSeq === 'string'));

  const invalidPageSize = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 101 });
  assert.equal(invalidPageSize.outcome, 'invalid_id');
  assert.equal(fake.state.messageQueries.length, 2);
});

test('invalid, tampered, cross-conversation, and differently sized cursors fail before storage reads', async () => {
  const fake = createFakePool({ messages: [messageRow(1), messageRow(2)] });
  const repository = createRepository(fake.pool);
  const firstPage = await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 1 });
  const initialConnectCalls = fake.state.connectCalls;
  const [body, signature] = firstPage.nextCursor.split('.');
  const tamperedCursor = `${body}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;

  assert.equal((await repository.getHistory({ conversationId: 'invalid-id' })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: CONVERSATION_ID, cursor: tamperedCursor })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: OTHER_CONVERSATION_ID, pageSize: 1, cursor: firstPage.nextCursor })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 2, cursor: firstPage.nextCursor })).outcome, 'invalid_id');
  assert.equal((await repository.getHistory({ conversationId: CONVERSATION_ID, pageSize: 0 })).outcome, 'invalid_id');
  assert.equal(fake.state.connectCalls, initialConnectCalls);
});
