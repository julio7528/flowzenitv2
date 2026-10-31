import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckpointEnvelope, validateCheckpointEnvelope } from '../../../server/agent/memory/checkpoint-envelope.js';
import { createContextBuilder } from '../../../server/agent/memory/context-builder.js';
import { createConversationFixture } from '../../fixtures/conversation/records.js';

function canonicalHistory(fixture) {
  return {
    outcome: 'ok',
    conversationId: fixture.conversation.conversationId,
    messages: fixture.messages.map((message) => ({
      messageId: message.messageId,
      conversationId: message.conversationId,
      messageSeq: message.messageSeq,
      turnId: message.turnId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
    nextCursor: null,
    snapshotMaxMessageSeq: fixture.conversation.lastMessageSeq,
  };
}

function syntheticSummary(fixture, overrides = {}) {
  return {
    conversationId: fixture.conversation.conversationId,
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    summaryFormatVersion: 1,
    summarizerConfigVersion: 'synthetic-summary-v1',
    sourceTranscriptVersion: '2',
    content: 'Synthetic summary of earlier conversation turns.',
    ...overrides,
  };
}

function estimateWords({ messages, summary }) {
  const messagesCount = messages.reduce((sum, message) => (
    sum + message.content.trim().split(/\s+/).length
  ), 0);
  const summaryCount = summary ? summary.content.trim().split(/\s+/).length : 0;
  return messagesCount + summaryCount;
}

test('context uses a separate derived summary and leaves the canonical transcript byte-for-byte unchanged', async () => {
  const fixture = createConversationFixture();
  const historyPage = canonicalHistory(fixture);
  const serializedTranscriptBefore = JSON.stringify(historyPage.messages);
  const summary = syntheticSummary(fixture);
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 64 });

  const context = await builder.build({
    historyPage,
    summary,
    transcriptVersion: '2',
  });

  assert.equal(context.outcome, 'ready');
  assert.deepEqual(context.messages.map((message) => message.messageSeq), ['3']);
  assert.deepEqual(historyPage.messages.map((message) => message.messageSeq), ['1', '2', '3']);
  assert.equal(JSON.stringify(historyPage.messages), serializedTranscriptBefore);
  assert.equal(context.summary.derived, true);
  assert.equal(context.summary.content, summary.content);
  assert.equal(context.summary.throughMessageSeq, '2');
  assert.equal(context.messages.some((message) => message.content === summary.content), false);
  assert.equal(context.source.complete, true);
});

test('checkpoint validation returns only an outcome and never turns checkpoint payload into context', () => {
  const fixture = createConversationFixture();
  const checkpointPayload = { syntheticPrivateState: 'synthetic-checkpoint-payload-sentinel' };
  const envelope = createCheckpointEnvelope({
    ...fixture.checkpoint,
    checkpointPayload,
    updatedAt: fixture.referenceTime,
    conversationExpiresAt: fixture.conversation.expiresAt,
  });
  const preflight = validateCheckpointEnvelope({
    envelope,
    checkpointPayload,
    expected: {
      conversationId: fixture.conversation.conversationId,
      checkpointNs: fixture.checkpoint.checkpointNs,
      checkpointId: fixture.checkpoint.checkpointId,
      graphVersion: fixture.checkpoint.graphVersion,
      stateSchemaVersion: fixture.checkpoint.stateSchemaVersion,
      serializerVersion: fixture.checkpoint.serializerVersion,
      turnId: fixture.checkpoint.turnId,
      correlationId: fixture.checkpoint.correlationId,
      conversationExpiresAt: fixture.conversation.expiresAt,
    },
    now: fixture.referenceTime,
  });

  assert.deepEqual(preflight, { outcome: 'READY' });
  assert.deepEqual(Object.keys(preflight), ['outcome']);
  assert.equal(JSON.stringify(preflight).includes('synthetic-checkpoint-payload-sentinel'), false);
  assert.equal(Object.hasOwn(envelope, 'checkpointPayload'), false);
});

test('derived summary output drops domain facts and private tool payload metadata', async () => {
  const fixture = createConversationFixture();
  const historyPage = canonicalHistory(fixture);
  const domainFactSentinel = 'synthetic-domain-fact-must-not-become-summary-state';
  const privateToolSentinel = 'synthetic-private-tool-payload-must-not-be-copied';
  const summary = syntheticSummary(fixture, {
    domainFacts: [{ value: domainFactSentinel, current: true }],
    privateToolPayload: privateToolSentinel,
    isAuthoritativeCurrentState: true,
  });
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 64 });

  const context = await builder.build({ historyPage, summary, transcriptVersion: '2' });

  assert.equal(context.outcome, 'ready');
  assert.equal(context.summary.derived, true);
  assert.deepEqual(Object.keys(context.summary).sort(), [
    'content',
    'derived',
    'fromMessageSeq',
    'sourceTranscriptVersion',
    'summarizerConfigVersion',
    'summaryFormatVersion',
    'throughMessageSeq',
  ].sort());
  assert.equal(JSON.stringify(context).includes(domainFactSentinel), false);
  assert.equal(JSON.stringify(context).includes(privateToolSentinel), false);
  assert.equal(Object.hasOwn(context.summary, 'isAuthoritativeCurrentState'), false);
  assert.equal(context.messages.every((message) => message.role !== 'domain_fact'), true);
});

test('checkpoint and summary inputs are not appended to transcript messages', async () => {
  const fixture = createConversationFixture();
  const historyPage = canonicalHistory(fixture);
  const originalMessageCount = historyPage.messages.length;
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 64 });
  const checkpoint = { payload: { synthetic: true } };

  const context = await builder.build({
    historyPage,
    summary: syntheticSummary(fixture),
    checkpoint,
    transcriptVersion: '2',
  });

  assert.equal(context.messages.length, 1);
  assert.equal(historyPage.messages.length, originalMessageCount);
  assert.equal(Object.hasOwn(context, 'checkpoint'), false);
  assert.equal(context.messages.some((message) => message.role === 'checkpoint'), false);
});
