import { z } from 'zod';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { memoryAccessGate } from './access-gate.js';
import { validateConversationId, validateMessageSequence } from './conversation-contracts.js';

assertServerOnlyRuntime();

export const CONTEXT_SUMMARY_FORMAT_VERSION = 1;
export const CONTEXT_SUMMARY_MAX_BYTES = 16 * 1024;

const POLICY_VERSION = 'dec005-spec003-v1';
const VERSION_LABEL = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const CommonInputSchema = z.strictObject({
  conversationId: z.string(),
  summaryFormatVersion: z.number().int().positive(),
  summarizerConfigVersion: z.string().regex(VERSION_LABEL),
});
const SaveInputSchema = CommonInputSchema.extend({
  fromMessageSeq: z.string().regex(/^[1-9][0-9]*$/),
  throughMessageSeq: z.string().regex(/^[1-9][0-9]*$/),
  sourceTranscriptVersion: z.string().regex(/^(?:0|[1-9][0-9]*)$/),
  content: z.string().min(1),
});

const INVALID = Object.freeze({ outcome: 'invalid_request' });
const UNAVAILABLE = Object.freeze({ outcome: 'unavailable' });

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null)
    && Object.getOwnPropertySymbols(value).length === 0
    && Object.values(Object.getOwnPropertyDescriptors(value))
      .every((descriptor) => Object.hasOwn(descriptor, 'value'));
}

function parseInput(schema, value) {
  if (!isPlainRecord(value)) return null;
  const parsed = schema.safeParse(value);
  if (!parsed.success) return null;
  try {
    const conversationId = validateConversationId(parsed.data.conversationId);
    if (parsed.data.fromMessageSeq !== undefined) {
      parsed.data.fromMessageSeq = validateMessageSequence(parsed.data.fromMessageSeq);
      parsed.data.throughMessageSeq = validateMessageSequence(parsed.data.throughMessageSeq);
      parsed.data.sourceTranscriptVersion = validateMessageSequence(
        parsed.data.sourceTranscriptVersion,
        { allowZero: true },
      );
      if (BigInt(parsed.data.fromMessageSeq) > BigInt(parsed.data.throughMessageSeq)
        || BigInt(parsed.data.sourceTranscriptVersion) !== BigInt(parsed.data.throughMessageSeq)
        || parsed.data.fromMessageSeq !== '1'
        || Buffer.byteLength(parsed.data.content, 'utf8') > CONTEXT_SUMMARY_MAX_BYTES
        || parsed.data.content.trim().length === 0) {
        return null;
      }
    }
    return Object.freeze({ ...parsed.data, conversationId });
  } catch {
    return null;
  }
}

function requiredConfigValue(config, key) {
  return Object.getOwnPropertyDescriptor(config, key)?.value;
}

function dependencies(config, accessGate) {
  if (!isPlainRecord(config)
    || requiredConfigValue(config, 'privateAccessAllowed') !== false
    || requiredConfigValue(config, 'policyVersion') !== POLICY_VERSION
    || typeof requiredConfigValue(config, 'now') !== 'function') {
    throw new TypeError('Conversation memory configuration is invalid.');
  }
  const pool = requiredConfigValue(config, 'pool');
  if (!pool || typeof pool !== 'object' || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Conversation memory configuration is invalid.');
  }
  if (!accessGate || typeof accessGate.run !== 'function') {
    throw new TypeError('MemoryAccessGate must provide a run method.');
  }
  return Object.freeze({ pool, now: requiredConfigValue(config, 'now'), accessGate });
}

function nowIso(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid clock.');
  return date.toISOString();
}

async function withTransaction(pool, operation) {
  const connection = await pool.connect();
  let began = false;
  try {
    await connection.query('BEGIN');
    began = true;
    const result = await operation(connection);
    await connection.query('COMMIT');
    began = false;
    return result;
  } catch {
    if (began) {
      try { await connection.query('ROLLBACK'); } catch { /* retain a content-free result */ }
    }
    throw new Error('Conversation summary storage is unavailable.');
  } finally {
    connection.release();
  }
}

async function lockActiveConversation(connection, conversationId, now) {
  const result = await connection.query(
    `SELECT c.lifecycle, c.expires_at, c.last_message_seq::text AS last_message_seq,
            clock_timestamp() AS storage_now
       FROM conversation_private.conversations AS c
      WHERE c.conversation_id = $1
      FOR SHARE OF c`,
    [conversationId],
  );
  if (result.rows.length === 0) return { outcome: 'not_found' };
  if (result.rows.length !== 1) throw new Error('Invalid conversation row.');
  const row = result.rows[0];
  if (row.lifecycle !== 'active') return { outcome: row.lifecycle === 'deleting' ? 'deleting' : 'not_found' };
  const currentTime = Date.parse(nowIso(now));
  const storageTime = Date.parse(new Date(row.storage_now).toISOString());
  const effectiveTime = Math.max(currentTime, storageTime);
  if (Date.parse(new Date(row.expires_at).toISOString()) <= effectiveTime) return { outcome: 'expired' };
  const lastMessageSeq = validateMessageSequence(row.last_message_seq, { allowZero: true });
  return { outcome: 'active', lastMessageSeq };
}

function summaryDto(row) {
  const fromMessageSeq = validateMessageSequence(row.from_message_seq);
  const throughMessageSeq = validateMessageSequence(row.through_message_seq);
  const sourceTranscriptVersion = validateMessageSequence(row.source_transcript_version, { allowZero: true });
  if (fromMessageSeq !== '1' || throughMessageSeq !== sourceTranscriptVersion
    || BigInt(fromMessageSeq) > BigInt(throughMessageSeq)
    || !Number.isSafeInteger(row.summary_format_version) || row.summary_format_version < 1
    || typeof row.summarizer_config_version !== 'string' || !VERSION_LABEL.test(row.summarizer_config_version)
    || typeof row.summary !== 'string' || Buffer.byteLength(row.summary, 'utf8') > CONTEXT_SUMMARY_MAX_BYTES
    || row.summary.trim().length === 0) {
    throw new Error('Invalid stored summary.');
  }
  return Object.freeze({
    summaryId: String(row.summary_id),
    conversationId: row.conversation_id,
    summaryFormatVersion: row.summary_format_version,
    summarizerConfigVersion: row.summarizer_config_version,
    fromMessageSeq,
    throughMessageSeq,
    sourceTranscriptVersion,
    content: row.summary,
    createdAt: new Date(row.created_at).toISOString(),
    derived: true,
  });
}

/**
 * Build a conversation-scoped summary store over an already-injected Pool.
 * This module never summarizes transcript text or calls a provider. DEC-001's
 * closed gate is the default and runs before every private SQL operation.
 */
export function createContextSummaryRepository({ config, accessGate = memoryAccessGate } = {}) {
  const { pool, now, accessGate: gate } = dependencies(config, accessGate);

  async function getLatest(request) {
    const parsed = parseInput(CommonInputSchema, request);
    if (!parsed) return INVALID;
    return await gate.run(async () => {
      try {
        return await withTransaction(pool, async (connection) => {
          const state = await lockActiveConversation(connection, parsed.conversationId, now);
          if (state.outcome !== 'active') return Object.freeze({ outcome: state.outcome });
          const result = await connection.query(
            `SELECT s.summary_id::text AS summary_id, s.conversation_id,
                    s.summary_format_version, s.summarizer_config_version,
                    s.from_message_seq::text AS from_message_seq,
                    s.through_message_seq::text AS through_message_seq,
                    s.source_transcript_version::text AS source_transcript_version,
                    s.summary, s.created_at
               FROM conversation_private.context_summaries AS s
              WHERE s.conversation_id = $1
                AND s.summary_format_version = $2
                AND s.summarizer_config_version = $3
                AND s.through_message_seq <= $4::bigint
              ORDER BY s.through_message_seq DESC, s.created_at DESC, s.summary_id DESC
              LIMIT 1`,
            [parsed.conversationId, parsed.summaryFormatVersion, parsed.summarizerConfigVersion, state.lastMessageSeq],
          );
          if (result.rows.length === 0) return Object.freeze({ outcome: 'empty', summary: null });
          if (result.rows.length !== 1) throw new Error('Invalid summary result.');
          return Object.freeze({ outcome: 'ok', summary: summaryDto(result.rows[0]) });
        });
      } catch {
        return UNAVAILABLE;
      }
    });
  }

  async function saveDerived(request) {
    const parsed = parseInput(SaveInputSchema, request);
    if (!parsed) return INVALID;
    return await gate.run(async () => {
      try {
        return await withTransaction(pool, async (connection) => {
          const state = await lockActiveConversation(connection, parsed.conversationId, now);
          if (state.outcome !== 'active') return Object.freeze({ outcome: state.outcome });
          if (BigInt(parsed.throughMessageSeq) > BigInt(state.lastMessageSeq)) {
            return Object.freeze({ outcome: 'conflict' });
          }
          const inserted = await connection.query(
            `INSERT INTO conversation_private.context_summaries
               (conversation_id, summary_format_version, summarizer_config_version,
                from_message_seq, through_message_seq, source_transcript_version, summary)
             VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6::bigint, $7)
             ON CONFLICT (conversation_id, summary_format_version, summarizer_config_version,
                          from_message_seq, through_message_seq, source_transcript_version)
             DO NOTHING
             RETURNING summary_id::text AS summary_id, conversation_id,
                       summary_format_version, summarizer_config_version,
                       from_message_seq::text AS from_message_seq,
                       through_message_seq::text AS through_message_seq,
                       source_transcript_version::text AS source_transcript_version,
                       summary, created_at`,
            [
              parsed.conversationId,
              parsed.summaryFormatVersion,
              parsed.summarizerConfigVersion,
              parsed.fromMessageSeq,
              parsed.throughMessageSeq,
              parsed.sourceTranscriptVersion,
              parsed.content,
            ],
          );
          if (inserted.rows.length === 1) {
            return Object.freeze({ outcome: 'saved', summary: summaryDto(inserted.rows[0]) });
          }
          const existing = await connection.query(
            `SELECT s.summary_id::text AS summary_id, s.conversation_id,
                    s.summary_format_version, s.summarizer_config_version,
                    s.from_message_seq::text AS from_message_seq,
                    s.through_message_seq::text AS through_message_seq,
                    s.source_transcript_version::text AS source_transcript_version,
                    s.summary, s.created_at
               FROM conversation_private.context_summaries AS s
              WHERE s.conversation_id = $1 AND s.summary_format_version = $2
                AND s.summarizer_config_version = $3 AND s.from_message_seq = $4::bigint
                AND s.through_message_seq = $5::bigint AND s.source_transcript_version = $6::bigint
              FOR SHARE`,
            [
              parsed.conversationId,
              parsed.summaryFormatVersion,
              parsed.summarizerConfigVersion,
              parsed.fromMessageSeq,
              parsed.throughMessageSeq,
              parsed.sourceTranscriptVersion,
            ],
          );
          if (existing.rows.length !== 1) throw new Error('Idempotent summary row unavailable.');
          const summary = summaryDto(existing.rows[0]);
          if (summary.content !== parsed.content) return Object.freeze({ outcome: 'conflict' });
          return Object.freeze({ outcome: 'replayed', summary });
        });
      } catch {
        return UNAVAILABLE;
      }
    });
  }

  return Object.freeze({ getLatest, saveDerived });
}
