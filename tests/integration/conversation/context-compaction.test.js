import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextBuilder } from '../../../server/agent/memory/context-builder.js';
import {
  createContextSummaryRepository,
  CONTEXT_SUMMARY_FORMAT_VERSION,
} from '../../../server/agent/memory/context-summary.js';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';

const conversationId = '00000000-0000-4000-8000-000000000101';
const otherConversationId = '00000000-0000-4000-8000-000000000102';
const turnId = '00000000-0000-4000-8000-000000000301';
const fixedNow = new Date('2026-10-29T12:00:00.000Z');

class SyntheticPool {
  constructor() {
    this.rows = [];
    this.calls = [];
  }

  async query() {
    throw new Error('The synthetic repository uses a checked-out connection.');
  }

  async connect() {
    const pool = this;
    return {
      async query(sql, values = []) {
        pool.calls.push({ sql, values });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

        if (sql.includes('FROM conversation_private.conversations')) {
          const [requestedConversationId] = values;
          if (requestedConversationId !== conversationId) return { rows: [] };
          return {
            rows: [{
              lifecycle: 'active',
              expires_at: '2027-10-29T12:00:00.000Z',
              last_message_seq: '5',
              storage_now: fixedNow,
            }],
          };
        }

        if (sql.includes('INSERT INTO conversation_private.context_summaries')) {
          const [requestedId, formatVersion, summarizerVersion, from, through, sourceVersion, content] = values;
          const existing = pool.rows.find((row) => (
            row.conversation_id === requestedId
            && row.summary_format_version === formatVersion
            && row.summarizer_config_version === summarizerVersion
            && row.from_message_seq === from
            && row.through_message_seq === through
            && row.source_transcript_version === sourceVersion
          ));
          if (existing) return { rows: [] };
          const row = {
            summary_id: '00000000-0000-4000-8000-000000000701',
            conversation_id: requestedId,
            summary_format_version: formatVersion,
            summarizer_config_version: summarizerVersion,
            from_message_seq: from,
            through_message_seq: through,
            source_transcript_version: sourceVersion,
            summary: content,
            created_at: fixedNow,
          };
          pool.rows.push(row);
          return { rows: [{ ...row }] };
        }

        if (sql.includes('FROM conversation_private.context_summaries') && sql.includes('FOR SHARE')) {
          const [requestedId, formatVersion, summarizerVersion, from, through, sourceVersion] = values;
          const row = pool.rows.find((candidate) => candidate.conversation_id === requestedId
            && candidate.summary_format_version === formatVersion
            && candidate.summarizer_config_version === summarizerVersion
            && candidate.from_message_seq === from
            && candidate.through_message_seq === through
            && candidate.source_transcript_version === sourceVersion);
          return { rows: row ? [{ ...row }] : [] };
        }

        if (sql.includes('FROM conversation_private.context_summaries')) {
          const [requestedId, formatVersion, summarizerVersion, through] = values;
          const row = pool.rows
            .filter((candidate) => candidate.conversation_id === requestedId
              && candidate.summary_format_version === formatVersion
              && candidate.summarizer_config_version === summarizerVersion
              && BigInt(candidate.through_message_seq) <= BigInt(through))
            .sort((left, right) => BigInt(right.through_message_seq) > BigInt(left.through_message_seq) ? 1 : -1)[0];
          return { rows: row ? [{ ...row }] : [] };
        }

        throw new Error('Unexpected synthetic query.');
      },
      release() {},
    };
  }
}

function message(sequence, content = `Synthetic complete message ${sequence}.`) {
  return {
    messageId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    conversationId,
    messageSeq: String(sequence),
    turnId,
    role: sequence % 2 === 0 ? 'assistant' : 'user',
    content,
    createdAt: `2026-10-29T11:00:0${sequence}.000Z`,
  };
}

function historyPage() {
  return {
    outcome: 'ok',
    conversationId,
    messages: [1, 2, 3, 4, 5].map((sequence) => message(sequence, `Synthetic transcript item ${sequence}.`)),
    nextCursor: null,
    snapshotMaxMessageSeq: '5',
  };
}

function estimateWords({ messages, summary }) {
  return messages.reduce((sum, item) => sum + item.content.split(/\s+/).length, 0)
    + (summary ? summary.content.split(/\s+/).length : 0);
}

function createSummaryRepository(pool) {
  return createContextSummaryRepository({
    config: createConversationMemoryConfig({ pool, now: () => fixedNow }),
    accessGate: { run: (operation) => operation() },
  });
}

test('builds a bounded context from a versioned summary and a complete-message delta without changing transcript', async () => {
  const pool = new SyntheticPool();
  const summaryRepository = createSummaryRepository(pool);
  const canonicalPage = historyPage();
  const originalTranscript = JSON.stringify(canonicalPage.messages);
  const summaryContent = 'Synthetic summary of transcript items one and two.';

  const saved = await summaryRepository.saveDerived({
    conversationId,
    summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizerConfigVersion: 'synthetic-local-v1',
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    sourceTranscriptVersion: '2',
    content: summaryContent,
  });

  assert.equal(saved.outcome, 'saved');
  assert.equal(saved.summary.sourceTranscriptVersion, '2');
  assert.equal(saved.summary.throughMessageSeq, '2');
  assert.equal(saved.summary.summaryFormatVersion, CONTEXT_SUMMARY_FORMAT_VERSION);

  const latest = await summaryRepository.getLatest({
    conversationId,
    summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizerConfigVersion: 'synthetic-local-v1',
  });
  assert.equal(latest.outcome, 'ok');
  assert.equal(latest.summary.content, summaryContent);
  assert.equal(latest.summary.derived, true);

  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 30 });
  const built = await builder.build({
    historyPage: canonicalPage,
    summary: latest.summary,
    transcriptVersion: latest.summary.sourceTranscriptVersion,
  });

  assert.equal(built.outcome, 'ready');
  assert.deepEqual(built.messages.map((item) => item.messageSeq), ['3', '4', '5']);
  assert.deepEqual(built.messages.map((item) => item.content), [
    'Synthetic transcript item 3.',
    'Synthetic transcript item 4.',
    'Synthetic transcript item 5.',
  ]);
  assert.deepEqual(built.summary, {
    derived: true,
    summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizerConfigVersion: 'synthetic-local-v1',
    sourceTranscriptVersion: '2',
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    content: summaryContent,
  });
  assert.equal(built.estimatedInputTokens, estimateWords({ messages: built.messages, summary: built.summary }));
  assert.equal(built.estimatedInputTokens <= built.maxInputTokens, true);
  assert.equal(built.source.complete, true);
  assert.equal(built.source.truncated, false);
  assert.equal(built.source.fromMessageSeq, '1');
  assert.equal(built.source.throughMessageSeq, '5');
  assert.equal(JSON.stringify(canonicalPage.messages), originalTranscript);
  assert.deepEqual(pool.rows.map((row) => ({
    summary_id: '00000000-0000-4000-8000-000000000701',
    conversation_id: row.conversation_id,
    summary_format_version: row.summary_format_version,
    summarizer_config_version: row.summarizer_config_version,
    from_message_seq: row.from_message_seq,
    through_message_seq: row.through_message_seq,
    source_transcript_version: row.source_transcript_version,
    created_at: row.created_at,
  })), [{
    summary_id: '00000000-0000-4000-8000-000000000701',
    conversation_id: conversationId,
    summary_format_version: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizer_config_version: 'synthetic-local-v1',
    from_message_seq: '1',
    through_message_seq: '2',
    source_transcript_version: '2',
    created_at: fixedNow,
  }]);
});

test('rejects a mismatched source interval and never returns another conversation summary', async () => {
  const pool = new SyntheticPool();
  const summaryRepository = createSummaryRepository(pool);

  const stale = await summaryRepository.saveDerived({
    conversationId,
    summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizerConfigVersion: 'synthetic-local-v1',
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    sourceTranscriptVersion: '3',
    content: 'Synthetic stale summary.',
  });
  assert.equal(stale.outcome, 'invalid_request');
  assert.equal(pool.calls.some(({ sql }) => sql.includes('INSERT INTO conversation_private.context_summaries')), false);

  await summaryRepository.saveDerived({
    conversationId,
    summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizerConfigVersion: 'synthetic-local-v1',
    fromMessageSeq: '1',
    throughMessageSeq: '2',
    sourceTranscriptVersion: '2',
    content: 'Synthetic per-conversation summary.',
  });

  const other = await summaryRepository.getLatest({
    conversationId: otherConversationId,
    summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
    summarizerConfigVersion: 'synthetic-local-v1',
  });
  assert.deepEqual(other, { outcome: 'not_found' });
  assert.equal(pool.rows.length, 1);
  assert.equal(pool.rows[0].conversation_id, conversationId);
});

test('returns budget_unavailable rather than cutting a structured message or summary', async () => {
  const page = historyPage();
  const original = JSON.stringify(page.messages);
  const builder = createContextBuilder({ estimateTokens: estimateWords, maxInputTokens: 3 });
  const result = await builder.build({
    historyPage: page,
    summary: {
      conversationId,
      fromMessageSeq: '1',
      throughMessageSeq: '2',
      summaryFormatVersion: CONTEXT_SUMMARY_FORMAT_VERSION,
      summarizerConfigVersion: 'synthetic-local-v1',
      sourceTranscriptVersion: '2',
      content: 'Synthetic summary which cannot fit the fixed budget.',
    },
    transcriptVersion: '2',
  });

  assert.equal(result.outcome, 'budget_unavailable');
  assert.equal(result.needsClarification, true);
  assert.equal(JSON.stringify(page.messages), original);
  assert.equal(JSON.stringify(result).includes('Synthetic transcript item'), false);
  assert.equal(JSON.stringify(result).includes('Synthetic summary which'), false);
});
