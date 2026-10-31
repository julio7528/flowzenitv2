import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextBuilder } from '../../../server/agent/memory/context-builder.js';

const conversationId = '00000000-0000-4000-8000-000000000101';
const turnId = '00000000-0000-4000-8000-000000000301';

function message(sequence) {
  return {
    messageId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    conversationId,
    messageSeq: String(sequence),
    turnId,
    role: sequence % 2 === 0 ? 'assistant' : 'user',
    content: `Synthetic full message ${sequence}`,
    createdAt: `2026-10-29T10:00:0${sequence}.000Z`,
  };
}

function historyPage({ sequences = [1, 2, 3, 4], snapshotMaxMessageSeq = '4', nextCursor = null } = {}) {
  return {
    outcome: sequences.length === 0 ? 'empty' : 'ok',
    conversationId,
    messages: sequences.map(message),
    nextCursor,
    snapshotMaxMessageSeq,
  };
}

function estimateWords({ messages, summary }) {
  const messageTokens = messages.reduce((sum, item) => sum + item.content.trim().split(/\s+/).length, 0);
  const summaryTokens = summary ? summary.content.trim().split(/\s+/).length : 0;
  return messageTokens + summaryTokens;
}

function summary(overrides = {}) {
  return {
    conversationId,
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    summaryFormatVersion: 1,
    summarizerConfigVersion: 'synthetic-summary-v1',
    sourceTranscriptVersion: '4',
    content: 'Synthetic compact summary',
    ...overrides,
  };
}

test('selects a whole-message suffix under a fixed budget without changing canonical messages', async () => {
  const page = historyPage();
  const original = structuredClone(page.messages);
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 8 });

  const result = await builder.build({
    historyPage: page,
    maxInputTokens: 10_000,
  });

  assert.equal(result.outcome, 'ready');
  assert.equal(result.maxInputTokens, 8);
  assert.equal(result.estimatedInputTokens, 8);
  assert.deepEqual(result.messages.map((item) => item.messageSeq), ['3', '4']);
  assert.deepEqual(result.messages.map((item) => item.content), [
    'Synthetic full message 3',
    'Synthetic full message 4',
  ]);
  assert.equal(Object.isFrozen(result.messages), true);
  assert.deepEqual(page.messages, original);
  assert.equal(result.source.truncated, true);
  assert.equal(result.source.complete, false);
});

test('uses a matching derived summary with its exact transcript version and sequence range', async () => {
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 11 });
  const result = await builder.build({
    historyPage: historyPage(),
    summary: summary(),
    transcriptVersion: '4',
  });

  assert.equal(result.outcome, 'ready');
  assert.deepEqual(result.messages.map((item) => item.messageSeq), ['3', '4']);
  assert.deepEqual(result.summary, {
    derived: true,
    summaryFormatVersion: 1,
    summarizerConfigVersion: 'synthetic-summary-v1',
    sourceTranscriptVersion: '4',
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    content: 'Synthetic compact summary',
  });
  assert.equal(result.source.fromMessageSeq, '1');
  assert.equal(result.source.throughMessageSeq, '4');
  assert.equal(result.source.compactionVersion, 1);
  assert.equal(result.source.complete, true);
  assert.equal(result.source.truncated, false);
});

test('rejects stale or cross-conversation summaries and exposes pagination without claiming completeness', async () => {
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 8 });
  const result = await builder.build({
    historyPage: historyPage({ sequences: [1, 2], snapshotMaxMessageSeq: '4', nextCursor: 'opaque-cursor-next-page' }),
    summary: summary({
      sourceTranscriptVersion: '3',
      conversationId: '00000000-0000-4000-8000-000000000999',
    }),
    transcriptVersion: '4',
  });

  assert.equal(result.outcome, 'ready');
  assert.equal(result.summary, null);
  assert.equal(result.source.nextCursor, 'opaque-cursor-next-page');
  assert.equal(result.source.hasMore, true);
  assert.equal(result.source.truncated, true);
  assert.equal(result.source.complete, false);
  assert.equal(result.source.snapshotMaxMessageSeq, '4');
  assert.equal(result.source.transcriptVersion, '4');
});

test('returns budget_unavailable when the latest complete message cannot fit', async () => {
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 3 });
  const result = await builder.build({
    historyPage: historyPage({ sequences: [1], snapshotMaxMessageSeq: '1' }),
  });

  assert.deepEqual(result, {
    outcome: 'budget_unavailable',
    reason: 'complete_message_exceeds_budget',
    needsClarification: true,
    conversationId,
    nextCursor: null,
    snapshotMaxMessageSeq: '1',
    compactionVersion: 1,
  });
  assert.equal(JSON.stringify(result).includes('Synthetic full message'), false);
});

test('keeps an empty transcript explicit and rejects an invalid injected budget', async () => {
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 8 });
  const result = await builder.build({
    historyPage: historyPage({ sequences: [], snapshotMaxMessageSeq: '0' }),
  });

  assert.equal(result.outcome, 'ready');
  assert.deepEqual(result.messages, []);
  assert.equal(result.source.complete, true);
  assert.equal(result.source.truncated, false);
  assert.throws(() => createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 0 }));
});
