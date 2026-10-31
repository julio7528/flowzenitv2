import assert from 'node:assert/strict';
import test from 'node:test';
import { runConversationMaintenanceCli } from '../../../scripts/conversation-maintenance.js';
import {
  CONVERSATION_MAINTENANCE_PROJECT_REF,
  createConversationRetention,
  runConversationMaintenance,
  validateConversationMaintenanceTarget,
} from '../../../server/agent/memory/retention.js';
import { createConversationMemoryConfig } from '../../../server/agent/memory/config.js';
import { createPostgresConversationRepository } from '../../../server/agent/memory/conversation-repository.js';

const PROJECT_REF = CONVERSATION_MAINTENANCE_PROJECT_REF;
const API_URL = 'https://' + PROJECT_REF + '.supabase.co';
const DB_URL = 'postgresql://postgres:synthetic-test-only@db.' + PROJECT_REF
  + '.supabase.co:5432/postgres?sslmode=require';
const EXPIRED_ID = '123e4567-e89b-42d3-a456-426614174010';
const ACTIVE_ID = '123e4567-e89b-42d3-a456-426614174011';
const POLICY_VERSION = 'dec005-spec003-v1';
const ARTIFACTS = [
  'checkpoint_writes',
  'checkpoint_blobs',
  'checkpoint_envelopes',
  'checkpoints',
  'context_summaries',
  'messages',
  'turn_reservations',
];

function validCliArgs() {
  return ['--project-ref', PROJECT_REF, '--confirm-project', PROJECT_REF];
}

test('maintenance target is fixed to the authorized project and rejects foreign endpoints', async () => {
  const poolAttempts = [];
  const wrongTargets = [
    {
      args: ['--project-ref', 'another-project', '--confirm-project', PROJECT_REF],
      env: { SUPABASE_URL: API_URL, CONVERSATION_DATABASE_URL: DB_URL },
    },
    {
      args: validCliArgs(),
      env: {
        SUPABASE_URL: 'https://another-project.supabase.co',
        CONVERSATION_DATABASE_URL: DB_URL,
      },
    },
    {
      args: validCliArgs(),
      env: {
        SUPABASE_URL: API_URL,
        CONVERSATION_DATABASE_URL: 'postgresql://postgres:synthetic-test-only@db.other-project.supabase.co/postgres',
      },
    },
    {
      args: validCliArgs(),
      env: {
        SUPABASE_URL: API_URL,
        CONVERSATION_DATABASE_URL: 'postgresql://service_role:synthetic-test-only@db.'
          + PROJECT_REF + '.supabase.co/postgres',
      },
    },
    {
      args: validCliArgs(),
      env: {
        SUPABASE_URL: API_URL,
        CONVERSATION_DATABASE_URL: 'postgresql://postgres.other-project:synthetic-test-only@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
      },
    },
  ];

  for (const target of wrongTargets) {
    const output = [];
    const exitCode = await runConversationMaintenanceCli({
      ...target,
      write: (line) => output.push(line),
      createPool: () => {
        poolAttempts.push(target);
        return { async query() { throw new Error('unexpected query'); } };
      },
    });
    assert.equal(exitCode, 1);
    assert.equal(output.some((line) => line.includes('synthetic-test-only')), false);
  }

  assert.equal(poolAttempts.length, 0);
});

test('database user identity mismatch stops after the identity probe and before cleanup SQL', async () => {
  const calls = [];
  const pool = {
    async query(sql) {
      calls.push(sql);
      return { rows: [{ database_name: 'postgres', database_user: 'wrong_user' }] };
    },
    async connect() {
      throw new Error('cleanup transaction must not start');
    },
  };

  await assert.rejects(runConversationMaintenance({
    createPool: () => pool,
    projectRef: PROJECT_REF,
    confirmProjectRef: PROJECT_REF,
    supabaseUrl: API_URL,
    databaseUrl: DB_URL,
  }));
  assert.deepEqual(calls, ['SELECT current_database() AS database_name, current_user AS database_user']);
});

function makeSyntheticMaintenancePool() {
  const conversations = new Map([
    [EXPIRED_ID, {
      lifecycle: 'active',
      activeTurnId: null,
      policyVersion: POLICY_VERSION,
      expired: true,
    }],
    [ACTIVE_ID, {
      lifecycle: 'active',
      activeTurnId: null,
      policyVersion: POLICY_VERSION,
      expired: false,
    }],
  ]);
  const artifactRows = Object.fromEntries(ARTIFACTS.map((table) => [
    table,
    new Set([EXPIRED_ID, ACTIVE_ID]),
  ]));
  const deletionOperations = new Map();
  const deletedArtifactKeys = [];
  const completionUpdates = [];

  const pool = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      if (normalized.startsWith('SELECT current_database()')) {
        return { rows: [{ database_name: 'postgres', database_user: 'postgres' }] };
      }
      if (normalized.startsWith('SELECT conversation_id FROM conversation_private.conversations')) {
        const candidates = [...conversations]
          .filter(([, row]) => row.expired && ['active', 'deleting'].includes(row.lifecycle)
            && row.policyVersion === values[0])
          .slice(0, values[1])
          .map(([conversation_id]) => ({ conversation_id }));
        return { rows: candidates };
      }
      if (normalized.startsWith('WITH checkpoint_candidates AS')) return { rows: [] };
      if (normalized.startsWith('WITH expired_operations AS')) return { rows: [] };
      if (normalized.startsWith('SELECT COUNT(*)::text AS count FROM conversation_private.conversations')) {
        const count = [...conversations.values()]
          .filter((row) => row.expired && ['active', 'deleting'].includes(row.lifecycle)
            && row.policyVersion === values[0]).length;
        return { rows: [{ count: String(count) }] };
      }
      if (normalized.startsWith('SELECT (SELECT COUNT(*)::text FROM conversation_private.checkpoint_envelopes')) {
        return { rows: [{ expired_envelopes: '0', unbound_checkpoints: '0', orphan_writes: '0' }] };
      }
      throw new Error('Unexpected pool query in synthetic fixture.');
    },
    async connect() {
      return {
        async query(sql, values = []) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          if (normalized === 'BEGIN' || normalized === 'COMMIT'
            || normalized === 'ROLLBACK' || normalized.startsWith('SET LOCAL statement_timeout')) {
            return { rows: [], rowCount: 0 };
          }
          if (normalized.startsWith('SELECT lifecycle, active_turn_id::text AS active_turn_id')) {
            const row = conversations.get(values[0]);
            if (!row) return { rows: [] };
            return { rows: [{
              lifecycle: row.lifecycle,
              active_turn_id: row.activeTurnId,
              policy_version: row.policyVersion,
              expired: row.expired,
            }] };
          }
          if (normalized.startsWith('SELECT turn_id::text AS turn_id FROM conversation_private.turn_reservations')) {
            return { rows: [] };
          }
          if (normalized.startsWith('SELECT request_id::text AS request_id FROM conversation_private.deletion_operations')) {
            const rows = [...deletionOperations.values()]
              .filter((operation) => operation.conversationId === values[0] && operation.status === 'deleting')
              .map((operation) => ({ request_id: operation.requestId }));
            return { rows };
          }
          if (normalized.startsWith('INSERT INTO conversation_private.deletion_operations')) {
            const [requestId, conversationId] = values;
            deletionOperations.set(requestId, { requestId, conversationId, status: 'deleting' });
            return { rows: [{ request_id: requestId }], rowCount: 1 };
          }
          if (normalized.startsWith("UPDATE conversation_private.conversations SET lifecycle = 'deleting'")) {
            const row = conversations.get(values[0]);
            if (!row || !['active', 'deleting'].includes(row.lifecycle)) return { rows: [], rowCount: 0 };
            row.lifecycle = 'deleting';
            return { rows: [{ conversation_id: values[0] }], rowCount: 1 };
          }
          const deleteMatch = normalized.match(/^DELETE FROM conversation_private\.(\w+) WHERE (thread_id|conversation_id) = \$1$/);
          if (deleteMatch) {
            const [, table] = deleteMatch;
            deletedArtifactKeys.push({ table, conversationId: values[0] });
            const affected = artifactRows[table]?.delete(values[0]) ? 1 : 0;
            return { rows: [], rowCount: affected };
          }
          if (normalized.startsWith('SELECT (SELECT COUNT(*)::text FROM conversation_private.messages')) {
            const row = Object.fromEntries(ARTIFACTS.map((table) => [
              table,
              String(artifactRows[table].has(values[0]) ? 1 : 0),
            ]));
            return { rows: [row] };
          }
          if (normalized.startsWith('UPDATE conversation_private.conversations SET lifecycle = \'deleted\'')) {
            const row = conversations.get(values[0]);
            if (!row || row.lifecycle !== 'deleting') return { rows: [], rowCount: 0 };
            row.lifecycle = 'deleted';
            return { rows: [{ conversation_id: values[0] }], rowCount: 1 };
          }
          if (normalized.startsWith('UPDATE conversation_private.deletion_operations SET status = \'completed\'')) {
            completionUpdates.push(normalized);
            const operation = deletionOperations.get(values[0]);
            if (!operation || operation.conversationId !== values[1] || operation.status !== 'deleting') {
              return { rows: [], rowCount: 0 };
            }
            operation.status = 'completed';
            return { rows: [{ request_id: values[0] }], rowCount: 1 };
          }
          if (normalized.startsWith('DELETE FROM conversation_private.conversations WHERE conversation_id = $1')) {
            const row = conversations.get(values[0]);
            if (!row || row.lifecycle !== 'deleted') return { rows: [], rowCount: 0 };
            conversations.delete(values[0]);
            return { rows: [{ conversation_id: values[0] }], rowCount: 1 };
          }
          throw new Error('Unexpected transaction query in synthetic fixture.');
        },
        release() {},
      };
    },
  };

  return { pool, conversations, artifactRows, deletionOperations, deletedArtifactKeys, completionUpdates };
}

test('maintenance removes only expired artifacts and retains unrelated conversation records', async () => {
  const fixture = makeSyntheticMaintenancePool();
  const result = await runConversationMaintenance({
    createPool: () => fixture.pool,
    projectRef: PROJECT_REF,
    confirmProjectRef: PROJECT_REF,
    supabaseUrl: API_URL,
    databaseUrl: DB_URL,
    batchSize: 1,
  });

  assert.deepEqual(result, {
    policyVersion: POLICY_VERSION,
    batchSize: 1,
    candidates: 1,
    deleted: 1,
    checkpointCandidates: 0,
    checkpointsPurged: 0,
    checkpointEnvelopesPurged: 0,
    checkpointWritesPurged: 0,
    checkpointBlobsPurged: 0,
    skippedUnresolvedTurn: 0,
    skippedChanged: 0,
    failed: 0,
    metadataPurged: 0,
    remainingExpired: 0,
    remainingExpiredCheckpointEnvelopes: 0,
    remainingUnboundCheckpoints: 0,
    remainingOrphanCheckpointWrites: 0,
  });
  assert.equal(fixture.conversations.has(EXPIRED_ID), false);
  assert.equal(fixture.conversations.has(ACTIVE_ID), true);
  for (const table of ARTIFACTS) {
    assert.equal(fixture.artifactRows[table].has(EXPIRED_ID), false);
    assert.equal(fixture.artifactRows[table].has(ACTIVE_ID), true);
  }
  assert.equal(fixture.deletedArtifactKeys.length, ARTIFACTS.length);
  assert.ok(fixture.deletedArtifactKeys.every(({ conversationId }) => conversationId === EXPIRED_ID));
  assert.equal(fixture.completionUpdates.length, 1);
  assert.match(fixture.completionUpdates[0], /completed_at = statement_timestamp\(\)/);
  assert.match(fixture.completionUpdates[0], /updated_at = statement_timestamp\(\)/);
  assert.match(fixture.completionUpdates[0], /purge_after = statement_timestamp\(\) \+ interval '30 days'/);
  assert.equal([...fixture.deletionOperations.values()][0].status, 'completed');
  assert.equal(JSON.stringify(result).includes(EXPIRED_ID), false);
});

test('expired checkpoints are purged by exact key while live transcript remains', async () => {
  const checkpointId = 'synthetic-expired-checkpoint';
  const checkpointNs = 'main';
  const calls = [];
  const deleted = [];
  const pool = {
    async query(sql) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      calls.push({ normalized, values: [] });
      if (normalized.startsWith('SELECT current_database()')) {
        return { rows: [{ database_name: 'postgres', database_user: 'postgres' }] };
      }
      if (normalized.startsWith('SELECT conversation_id FROM conversation_private.conversations')) {
        return { rows: [] };
      }
      if (normalized.startsWith('WITH checkpoint_candidates AS')) {
        return { rows: [{
          kind: 'expired_envelope',
          thread_id: ACTIVE_ID,
          checkpoint_ns: checkpointNs,
          checkpoint_id: checkpointId,
        }] };
      }
      if (normalized.startsWith('WITH expired_operations AS')) return { rows: [] };
      if (normalized.startsWith('SELECT COUNT(*)::text AS count FROM conversation_private.conversations')) {
        return { rows: [{ count: '0' }] };
      }
      if (normalized.startsWith('SELECT (SELECT COUNT(*)::text FROM conversation_private.checkpoint_envelopes')) {
        return { rows: [{ expired_envelopes: '0', unbound_checkpoints: '0', orphan_writes: '0' }] };
      }
      throw new Error('Unexpected pool query in checkpoint fixture.');
    },
    async connect() {
      return {
        async query(sql, values = []) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          calls.push({ normalized, values });
          if (normalized === 'BEGIN' || normalized === 'COMMIT'
            || normalized === 'ROLLBACK' || normalized.startsWith('SET LOCAL statement_timeout')) {
            return { rows: [], rowCount: 0 };
          }
          if (normalized.startsWith('SELECT lifecycle, active_turn_id::text AS active_turn_id')) {
            return { rows: [{
              lifecycle: 'active',
              active_turn_id: null,
              policy_version: POLICY_VERSION,
              expired: false,
            }] };
          }
          if (normalized.startsWith('SELECT turn_id::text AS turn_id FROM conversation_private.turn_reservations')) {
            return { rows: [] };
          }
          if (normalized.startsWith('SELECT expires_at <= clock_timestamp() AS expired FROM conversation_private.checkpoint_envelopes')) {
            return { rows: [{ expired: true }] };
          }
          if (normalized.startsWith('DELETE FROM conversation_private.checkpoint_writes WHERE')) {
            deleted.push({ table: 'checkpoint_writes', values });
            return { rows: [], rowCount: 1 };
          }
          if (normalized.startsWith('DELETE FROM conversation_private.checkpoint_envelopes WHERE')) {
            deleted.push({ table: 'checkpoint_envelopes', values });
            return { rows: [], rowCount: 1 };
          }
          if (normalized.startsWith('DELETE FROM conversation_private.checkpoints WHERE')) {
            deleted.push({ table: 'checkpoints', values });
            return { rows: [], rowCount: 1 };
          }
          if (normalized.startsWith('DELETE FROM conversation_private.checkpoint_blobs AS blob')) {
            deleted.push({ table: 'checkpoint_blobs', values });
            return { rows: [{ channel: 'archived-channel' }], rowCount: 1 };
          }
          throw new Error('Unexpected checkpoint transaction query.');
        },
        release() {},
      };
    },
  };

  const result = await runConversationMaintenance({
    createPool: () => pool,
    projectRef: PROJECT_REF,
    confirmProjectRef: PROJECT_REF,
    supabaseUrl: API_URL,
    databaseUrl: DB_URL,
    batchSize: 1,
  });

  assert.equal(result.candidates, 0);
  assert.equal(result.deleted, 0);
  assert.equal(result.checkpointCandidates, 1);
  assert.equal(result.checkpointsPurged, 1);
  assert.equal(result.checkpointEnvelopesPurged, 1);
  assert.equal(result.checkpointWritesPurged, 1);
  assert.equal(result.checkpointBlobsPurged, 1);
  assert.equal(result.remainingExpiredCheckpointEnvelopes, 0);
  assert.equal(result.remainingUnboundCheckpoints, 0);
  assert.equal(result.remainingOrphanCheckpointWrites, 0);
  assert.deepEqual(deleted.map((item) => item.table), [
    'checkpoint_writes',
    'checkpoint_envelopes',
    'checkpoints',
    'checkpoint_blobs',
  ]);
  assert.ok(deleted.every((item) => item.values[0] === ACTIVE_ID));
  assert.ok(deleted.filter((item) => item.table !== 'checkpoint_blobs')
    .every((item) => item.values[1] === checkpointNs && item.values[2] === checkpointId));
  assert.equal(calls.some((item) => item.normalized.includes('DELETE FROM conversation_private.messages')), false);
  assert.equal(calls.some((item) => item.normalized.includes('DELETE FROM conversation_private.context_summaries')), false);
  assert.equal(JSON.stringify(result).includes(ACTIVE_ID), false);
});

test('expired conversation reads return EXPIRED before message content is selected', async () => {
  const calls = [];
  const pool = {
    async query() {
      throw new Error('history transaction should own its connection');
    },
    async connect() {
      return {
        async query(sql) {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          calls.push(normalized);
          if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
            return { rows: [], rowCount: 0 };
          }
          if (normalized.startsWith('SELECT c.conversation_id, c.lifecycle, c.created_at')) {
            return {
              rows: [{
                conversation_id: EXPIRED_ID,
                lifecycle: 'active',
                created_at: '2025-01-01T00:00:00.000Z',
                last_activity_at: '2025-01-01T00:00:00.000Z',
                expires_at: '2025-12-31T00:00:00.000Z',
                last_message_seq: '1',
                policy_version: POLICY_VERSION,
                active_turn_id: null,
                storage_now: '2026-01-01T00:00:00.000Z',
              }],
            };
          }
          if (normalized.includes('FROM conversation_private.messages')) {
            throw new Error('expired transcript must not be selected');
          }
          throw new Error('Unexpected history query.');
        },
        release() {},
      };
    },
  };
  const config = createConversationMemoryConfig({
    pool,
    cursorHmacKey: new Uint8Array(32).fill(1),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  const repository = createPostgresConversationRepository({ config });
  const result = await repository.getHistory({ conversationId: EXPIRED_ID });

  assert.equal(result.outcome, 'expired');
  assert.deepEqual(result.messages, []);
  assert.equal(calls.some((query) => query.includes('FROM conversation_private.messages')), false);
});

test('maintenance capabilities cannot be forged and require a verified target', () => {
  const target = validateConversationMaintenanceTarget({
    projectRef: PROJECT_REF,
    confirmProjectRef: PROJECT_REF,
    supabaseUrl: API_URL,
    databaseUrl: DB_URL,
  });
  assert.throws(() => createConversationRetention({
    pool: { async query() { throw new Error('forged target must not be used'); }, async connect() {} },
    target: { ...target },
  }), { code: 'CONVERSATION_MAINTENANCE_UNAVAILABLE' });
  assert.deepEqual(Object.keys(target).sort(), [
    'databaseName',
    'databaseUser',
    'host',
    'port',
    'projectRef',
  ]);
  assert.equal(JSON.stringify(target).includes('synthetic-test-only'), false);
});
