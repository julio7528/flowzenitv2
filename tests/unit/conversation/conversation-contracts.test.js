import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ConversationContractError,
  parseConversationExport,
} from '../../../server/agent/memory/conversation-contracts.js';

const conversationId = '00000000-0000-4000-8000-000000000941';
const otherConversationId = '00000000-0000-4000-8000-000000000942';
const turnId = '00000000-0000-4000-8000-000000000943';

function validExport() {
  return {
    schemaVersion: 1,
    conversation: {
      conversationId,
      createdAt: '2026-10-29T20:00:00.000Z',
    },
    messages: [
      {
        messageId: '00000000-0000-4000-8000-000000000944',
        conversationId,
        messageSeq: '1',
        turnId,
        role: 'user',
        content: 'Synthetic export request.',
        createdAt: '2026-10-29T20:01:00.000Z',
      },
      {
        messageId: '00000000-0000-4000-8000-000000000945',
        conversationId,
        messageSeq: '2',
        turnId,
        role: 'assistant',
        content: 'Synthetic export response.',
        createdAt: '2026-10-29T20:02:00.000Z',
      },
    ],
    nextCursor: 'opaque.synthetic.cursor.v1',
    snapshotMaxMessageSeq: '2',
  };
}

function assertInvalidExport(value, privateMarker) {
  assert.throws(() => parseConversationExport(value), (error) => {
    assert.ok(error instanceof ConversationContractError);
    assert.equal(error.code, 'INVALID_EXPORT');
    if (privateMarker) assert.equal(error.message.includes(privateMarker), false);
    return true;
  });
}

test('conversation export accepts versioned canonical messages and an opaque continuation cursor', () => {
  const input = validExport();
  const parsed = parseConversationExport(input);

  assert.deepEqual(parsed, input);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.conversation.conversationId, conversationId);
  assert.equal(parsed.messages.length, 2);
  assert.deepEqual(parsed.messages.map((message) => message.messageSeq), ['1', '2']);
  assert.equal(parsed.nextCursor, 'opaque.synthetic.cursor.v1');
  assert.equal(parsed.snapshotMaxMessageSeq, '2');
});

test('conversation export rejects unknown and private checkpoint, reasoning, and tool fields', async (t) => {
  const cases = [
    ['checkpoint payload', (value) => { value.checkpointPayload = { marker: 'private-checkpoint-sentinel' }; }, 'private-checkpoint-sentinel'],
    ['hidden reasoning', (value) => { value.messages[0].hiddenReasoning = 'private-reasoning-sentinel'; }, 'private-reasoning-sentinel'],
    ['private tool data', (value) => { value.messages[1].privateToolData = { marker: 'private-tool-sentinel' }; }, 'private-tool-sentinel'],
    ['unknown metadata', (value) => { value.privateMetadata = 'private-metadata-sentinel'; }, 'private-metadata-sentinel'],
  ];

  for (const [name, mutate, marker] of cases) {
    await t.test(name, () => {
      const value = validExport();
      mutate(value);
      assertInvalidExport(value, marker);
    });
  }
});

test('conversation export rejects messages from a different conversation', () => {
  const value = validExport();
  value.messages[1].conversationId = otherConversationId;

  assertInvalidExport(value);
});

test('conversation export rejects message sequences beyond the page snapshot', () => {
  const value = validExport();
  value.snapshotMaxMessageSeq = '1';

  assertInvalidExport(value);
});
