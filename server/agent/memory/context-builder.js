import { parseHistoryResult, validateMessageSequence } from './conversation-contracts.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

export const CONTEXT_COMPACTION_VERSION = 1;

const FAILURE_OUTCOMES = new Set([
  'invalid_id',
  'not_found',
  'access_disabled',
  'expired',
  'unavailable',
]);

function asSafeTokenCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('The local token estimator returned an invalid count.');
  }
  return value;
}

function summaryMetadata(summary, { conversationId, snapshotMaxMessageSeq, transcriptVersion }) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
  const from = summary.fromMessageSeq;
  const through = summary.throughMessageSeq;
  let fromSeq;
  let throughSeq;
  try {
    fromSeq = BigInt(validateMessageSequence(from));
    throughSeq = BigInt(validateMessageSequence(through));
    if (fromSeq > throughSeq || throughSeq > BigInt(snapshotMaxMessageSeq)) return null;
  } catch {
    return null;
  }
  if (summary.conversationId !== conversationId
    || summary.sourceTranscriptVersion !== transcriptVersion
    || !Number.isSafeInteger(summary.summaryFormatVersion)
    || summary.summaryFormatVersion < 1
    || typeof summary.summarizerConfigVersion !== 'string'
    || summary.summarizerConfigVersion.trim().length === 0
    || typeof summary.content !== 'string'
    || summary.content.trim().length === 0) {
    return null;
  }
  return Object.freeze({
    conversationId,
    fromMessageSeq: from,
    throughMessageSeq: through,
    summaryFormatVersion: summary.summaryFormatVersion,
    summarizerConfigVersion: summary.summarizerConfigVersion,
    sourceTranscriptVersion: transcriptVersion,
    content: summary.content,
  });
}

function freezeMessages(messages) {
  return Object.freeze(messages.map((message) => Object.freeze({ ...message })));
}

function sourceCompleteness({ messages, selectedMessages, summary, hasMore, snapshotMaxMessageSeq }) {
  if (hasMore) return false;
  if (messages.length === 0) {
    if (summary) {
      return summary.fromMessageSeq === '1'
        && summary.throughMessageSeq === snapshotMaxMessageSeq;
    }
    return snapshotMaxMessageSeq === '0';
  }

  const selectedSequences = new Set(selectedMessages.map((message) => message.messageSeq));
  const allPageMessagesAccountedFor = messages.every((message) => {
    if (selectedSequences.has(message.messageSeq)) return true;
    return summary !== null
      && BigInt(message.messageSeq) >= BigInt(summary.fromMessageSeq)
      && BigInt(message.messageSeq) <= BigInt(summary.throughMessageSeq);
  });
  if (summary) {
    const summaryStartsAtTranscriptBeginning = summary.fromMessageSeq === '1';
    const firstUncovered = selectedMessages[0]?.messageSeq;
    const adjacentToSummary = firstUncovered === undefined
      ? BigInt(summary.throughMessageSeq) === BigInt(snapshotMaxMessageSeq)
      : BigInt(firstUncovered) === BigInt(summary.throughMessageSeq) + 1n;
    const reachesSnapshot = (selectedMessages.at(-1)?.messageSeq ?? summary.throughMessageSeq)
      === snapshotMaxMessageSeq;
    return summaryStartsAtTranscriptBeginning && adjacentToSummary && reachesSnapshot && allPageMessagesAccountedFor;
  }
  return allPageMessagesAccountedFor
    && messages[0].messageSeq === '1'
    && messages.at(-1).messageSeq === snapshotMaxMessageSeq;
}

function buildResult({ page, messages, selectedMessages, summary, tokenCount, maxInputTokens, transcriptVersion }) {
  const hasMore = page.nextCursor !== null;
  const selectedSummary = summary ? Object.freeze({
    derived: true,
    summaryFormatVersion: summary.summaryFormatVersion,
    summarizerConfigVersion: summary.summarizerConfigVersion,
    sourceTranscriptVersion: summary.sourceTranscriptVersion,
    fromMessageSeq: summary.fromMessageSeq,
    throughMessageSeq: summary.throughMessageSeq,
    content: summary.content,
  }) : null;
  const selected = freezeMessages(selectedMessages);
  const fromMessageSeq = selectedSummary?.fromMessageSeq ?? selected[0]?.messageSeq ?? null;
  const throughMessageSeq = selected.at(-1)?.messageSeq ?? selectedSummary?.throughMessageSeq ?? null;
  const complete = sourceCompleteness({
    messages,
    selectedMessages,
    summary,
    hasMore,
    snapshotMaxMessageSeq: page.snapshotMaxMessageSeq,
  });
  const selectedSequences = new Set(selectedMessages.map((message) => message.messageSeq));
  const messagesAccountedForBySummary = summary ? messages.filter((message) => (
    BigInt(message.messageSeq) >= BigInt(summary.fromMessageSeq)
    && BigInt(message.messageSeq) <= BigInt(summary.throughMessageSeq)
  )).length : 0;

  return Object.freeze({
    outcome: 'ready',
    conversationId: page.conversationId,
    messages: selected,
    summary: selectedSummary,
    source: Object.freeze({
      fromMessageSeq,
      throughMessageSeq,
      snapshotMaxMessageSeq: page.snapshotMaxMessageSeq,
      nextCursor: page.nextCursor,
      hasMore,
      complete,
      truncated: hasMore || selectedSequences.size + messagesAccountedForBySummary < messages.length,
      transcriptVersion: transcriptVersion ?? null,
      compactionVersion: CONTEXT_COMPACTION_VERSION,
    }),
    estimatedInputTokens: tokenCount,
    maxInputTokens,
  });
}

function selectSuffix(messages, summary, estimateTokens, maxInputTokens) {
  if (messages.length === 0) {
    const tokenCount = asSafeTokenCount(estimateTokens({ messages: [], summary }));
    return tokenCount <= maxInputTokens ? { messages: [], tokenCount } : null;
  }

  for (let start = 0; start < messages.length; start += 1) {
    const selected = messages.slice(start);
    const tokenCount = asSafeTokenCount(estimateTokens({ messages: selected, summary }));
    if (tokenCount <= maxInputTokens) return { messages: selected, tokenCount };
  }
  return null;
}

/**
 * Construct a conversation context using a trusted, locally injected token
 * estimator and fixed input budget. Request data cannot raise the budget, and
 * transcript messages are always selected whole or omitted whole.
 */
export function createContextBuilder({ estimateTokens, maxInputTokens }) {
  if (typeof estimateTokens !== 'function') {
    throw new TypeError('A trusted local token estimator is required.');
  }
  if (!Number.isSafeInteger(maxInputTokens) || maxInputTokens < 1) {
    throw new TypeError('A fixed positive input token budget is required.');
  }

  return Object.freeze({
    async build({ historyPage, summary: summaryCandidate = null, transcriptVersion } = {}) {
      const parsed = parseHistoryResult(historyPage);
      if (FAILURE_OUTCOMES.has(parsed.outcome)) {
        return Object.freeze({ outcome: parsed.outcome });
      }

      const summary = summaryMetadata(summaryCandidate, {
        conversationId: parsed.conversationId,
        snapshotMaxMessageSeq: parsed.snapshotMaxMessageSeq,
        transcriptVersion,
      });
      const messages = parsed.messages;

      let selection = null;
      let includedSummary = null;
      if (summary) {
        const afterSummary = messages.filter((message) => (
          BigInt(message.messageSeq) > BigInt(summary.throughMessageSeq)
        ));
        selection = selectSuffix(afterSummary, summary, estimateTokens, maxInputTokens);
        if (selection) includedSummary = summary;
      }
      if (!selection) selection = selectSuffix(messages, null, estimateTokens, maxInputTokens);
      if (!selection) {
        return Object.freeze({
          outcome: 'budget_unavailable',
          reason: 'complete_message_exceeds_budget',
          needsClarification: true,
          conversationId: parsed.conversationId,
          nextCursor: parsed.nextCursor,
          snapshotMaxMessageSeq: parsed.snapshotMaxMessageSeq,
          compactionVersion: CONTEXT_COMPACTION_VERSION,
        });
      }

      return buildResult({
        page: parsed,
        messages,
        selectedMessages: selection.messages,
        summary: includedSummary,
        tokenCount: selection.tokenCount,
        maxInputTokens,
        transcriptVersion,
      });
    },
  });
}
