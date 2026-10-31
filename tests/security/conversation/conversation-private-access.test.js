import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKPOINT_NOT_FOUND } from '../../../server/agent/persistence/ports.js';
import { createCheckpointResume } from '../../../server/agent/memory/checkpoint-resume.js';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import {
  createGuardedConversationRepository,
  createPostgresConversationRepository,
} from '../../../server/agent/memory/conversation-repository.js';
import { createContextSummaryRepository } from '../../../server/agent/memory/context-summary.js';
import { memoryAccessGate } from '../../../server/agent/memory/access-gate.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONVERSATION_ID = '123e4567-e89b-42d3-a456-426614174000';
const TURN_ID = '123e4567-e89b-42d3-a456-426614174001';
const CORRELATION_ID = '123e4567-e89b-42d3-a456-426614174002';
const CHECKPOINT_ID = 'synthetic-checkpoint-001';
const DISABLED = {
  error: {
    code: 'ACCESS_DISABLED',
    message: 'Conversation memory unavailable',
  },
};

async function listJavaScriptFiles(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(ROOT, directory), { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listJavaScriptFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(relative);
  }
  return files.sort();
}

test('closed DEC-001 blocks repository, checkpoint, summary, ledger, and resume effects before invocation', async () => {
  const calls = { pool: 0, checkpoint: 0, envelope: 0, conversation: 0, ledger: 0, graph: 0 };
  const pool = {
    async query() {
      calls.pool += 1;
      throw new Error('synthetic database must remain untouched');
    },
    async connect() {
      calls.pool += 1;
      throw new Error('synthetic database must remain untouched');
    },
  };
  const config = createConversationMemoryConfig({ pool, now: () => new Date('2026-10-29T12:00:00.000Z') });
  const repository = createPostgresConversationRepository({ config });
  const guardedRepository = createGuardedConversationRepository({ repository });
  const summaries = createContextSummaryRepository({ config });
  const resume = createCheckpointResume({
    checkpointPort: {
      async load() { calls.checkpoint += 1; return CHECKPOINT_NOT_FOUND; },
      async save() { calls.checkpoint += 1; return true; },
    },
    envelopeStore: {
      async load() { calls.envelope += 1; return null; },
      async save() { calls.envelope += 1; return true; },
    },
    conversationRepository: {
      async getConversationMetadata() { calls.conversation += 1; return null; },
    },
    executionLedger: {
      async reserve() { calls.ledger += 1; return { status: 'reserved' }; },
      async recordStarted() { calls.ledger += 1; return true; },
      async recordOutcome() { calls.ledger += 1; return true; },
      async lookup() { calls.ledger += 1; return { status: 'not_started' }; },
    },
    graphVersion: 'graph-v1',
    stateSchemaVersion: 1,
    serializerVersion: 'serializer-v1',
    now: () => new Date('2026-10-29T12:00:00.000Z'),
  });

  assert.equal(memoryAccessGate.isOpen(), false);
  assert.equal(config.privateAccessAllowed, false);
  assert.deepEqual(
    await guardedRepository.getHistory({ conversationId: CONVERSATION_ID }),
    DISABLED,
  );
  assert.deepEqual(
    await summaries.getLatest({
      conversationId: CONVERSATION_ID,
      summaryFormatVersion: 1,
      summarizerConfigVersion: 'synthetic-local-v1',
    }),
    DISABLED,
  );
  assert.deepEqual(
    await summaries.saveDerived({
      conversationId: CONVERSATION_ID,
      summaryFormatVersion: 1,
      summarizerConfigVersion: 'synthetic-local-v1',
      fromMessageSeq: '1',
      throughMessageSeq: '1',
      sourceTranscriptVersion: '1',
      content: 'Synthetic summary sentinel only.',
    }),
    DISABLED,
  );

  const checkpointRequest = {
    conversationId: CONVERSATION_ID,
    turnId: TURN_ID,
    correlationId: CORRELATION_ID,
    checkpointNs: '',
    checkpointId: CHECKPOINT_ID,
  };
  assert.deepEqual(await resume.preflight(checkpointRequest), { outcome: 'ACCESS_DISABLED' });
  assert.deepEqual(await resume.save({
    ...checkpointRequest,
    checkpointPayload: { synthetic: true },
    ledgerRefs: ['synthetic-ledger-001'],
  }), { outcome: 'ACCESS_DISABLED' });
  assert.deepEqual(await resume.resume(checkpointRequest, async () => {
    calls.graph += 1;
    return { synthetic: true };
  }), { outcome: 'ACCESS_DISABLED' });

  assert.deepEqual(calls, {
    pool: 0,
    checkpoint: 0,
    envelope: 0,
    conversation: 0,
    ledger: 0,
    graph: 0,
  });
});

test('no private history or export endpoint is exposed under the Vercel API tree', async () => {
  const routes = await listJavaScriptFiles('api');
  assert.equal(routes.includes('agent/turn.js'), true);
  assert.equal(routes.some((file) => /(conversation|history|export)/i.test(file)), false);

  const turnRoute = await readFile(path.join(ROOT, 'api/agent/turn.js'), 'utf8');
  assert.doesNotMatch(turnRoute, /createContextSummaryRepository|createCheckpointResume|createPostgresConversationRepository/);
  assert.doesNotMatch(turnRoute, /conversation[-_/](?:history|export)|(?:history|export)[-_/]conversation/i);
});

test('agent runtime contains no cross-thread semantic store or embedding integration', async () => {
  const sources = [
    ...(await listJavaScriptFiles('server/agent')).map((file) => path.join(ROOT, 'server/agent', file)),
    ...(await listJavaScriptFiles('api')).map((file) => path.join(ROOT, 'api', file)),
  ];
  const forbidden = /(?:@langchain\/(?:.*embeddings|.*vector)|MemoryVectorStore|SupabaseVectorStore|InMemoryStore|PostgresStore|embedding(?:s)?\s*\(|vector(?:store|index)|semantic\s+memory)/i;
  const matches = [];
  for (const sourcePath of sources) {
    const content = await readFile(sourcePath, 'utf8');
    if (forbidden.test(content)) matches.push(path.relative(ROOT, sourcePath));
  }
  assert.deepEqual(matches, []);
});
