import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const EXPECTED_PROJECT_REF = "twikxeloeftczwbpjvzr";
const DATABASE_URL = process.env.CONVERSATION_TEST_DATABASE_URL;
const SKIP_REASON = DATABASE_URL
  ? false
  : "Set a project-verified CONVERSATION_TEST_DATABASE_URL to run the real PostgreSQL contract test.";

function assertProjectBoundConfiguration() {
  assert.equal(
    process.env.CONVERSATION_TEST_PROJECT_REF,
    EXPECTED_PROJECT_REF,
    "conversation integration tests must target the authorized development project",
  );

  const apiUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  assert.ok(apiUrl, "SUPABASE_URL must identify the project used for this test");
  assert.equal(new URL(apiUrl).hostname, `${EXPECTED_PROJECT_REF}.supabase.co`);

  const databaseUrl = new URL(DATABASE_URL);
  const user = decodeURIComponent(databaseUrl.username);
  const directConnection = databaseUrl.hostname === `db.${EXPECTED_PROJECT_REF}.supabase.co`;
  const verifiedPoolerConnection = databaseUrl.hostname.endsWith(".pooler.supabase.com")
    && user === `postgres.${EXPECTED_PROJECT_REF}`;
  assert.ok(
    directConnection || verifiedPoolerConnection,
    "database host/user must identify the authorized development project",
  );
}

async function assertNoFixtureRows(pool, conversationId) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM conversation_private.conversations WHERE conversation_id = $1) AS conversations,
       (SELECT count(*)::int FROM conversation_private.messages WHERE conversation_id = $1) AS messages,
       (SELECT count(*)::int FROM conversation_private.turn_reservations WHERE conversation_id = $1) AS reservations,
       (SELECT count(*)::int FROM conversation_private.checkpoints WHERE thread_id = $1) AS checkpoints,
       (SELECT count(*)::int FROM conversation_private.checkpoint_blobs WHERE thread_id = $1) AS blobs,
       (SELECT count(*)::int FROM conversation_private.checkpoint_writes WHERE thread_id = $1) AS writes,
       (SELECT count(*)::int FROM conversation_private.checkpoint_envelopes WHERE thread_id = $1) AS envelopes,
       (SELECT count(*)::int FROM conversation_private.context_summaries WHERE conversation_id = $1) AS summaries,
       (SELECT count(*)::int FROM conversation_private.deletion_operations WHERE conversation_id = $1) AS deletion_operations`,
    [conversationId],
  );
  assert.deepEqual(rows[0], {
    conversations: 0,
    messages: 0,
    reservations: 0,
    checkpoints: 0,
    blobs: 0,
    writes: 0,
    envelopes: 0,
    summaries: 0,
    deletion_operations: 0,
  });
}

test(
  "SPEC-003 migration and PostgresSaver 1.1.2 use the private schema with exact synthetic cleanup",
  { skip: SKIP_REASON },
  async () => {
    assertProjectBoundConfiguration();

    const pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: true },
      max: 2,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 10_000,
    });
    const saver = new PostgresSaver(pool, undefined, { schema: "conversation_private" });
    const conversationId = randomUUID();
    const checkpointId = randomUUID();
    const fixtureMarker = `synthetic-conversation-fixture:${randomUUID()}`;
    let schemaVerified = false;
    let fixturePreflightPassed = false;

    try {
      const identity = await pool.query(
        "SELECT current_database() AS database_name, current_user AS role_name, current_setting('server_version_num')::int AS server_version_num",
      );
      assert.equal(identity.rows[0].database_name, "postgres");
      assert.ok(!["anon", "authenticated", "service_role"].includes(identity.rows[0].role_name));
      assert.ok(identity.rows[0].server_version_num >= 170000);

      const versionRows = await pool.query(
        "SELECT v FROM conversation_private.checkpoint_migrations ORDER BY v",
      );
      assert.deepEqual(versionRows.rows.map((row) => row.v), [0, 1, 2, 3, 4, 5]);

      const tableRows = await pool.query(
        `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
                (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
           FROM pg_namespace n
           JOIN pg_class c ON c.relnamespace = n.oid
          WHERE n.nspname = 'conversation_private' AND c.relkind = 'r'
          ORDER BY c.relname`,
      );
      assert.deepEqual(
        tableRows.rows.map((row) => row.table_name),
        [
          "checkpoint_blobs",
          "checkpoint_envelopes",
          "checkpoint_migrations",
          "checkpoint_writes",
          "checkpoints",
          "context_summaries",
          "conversations",
          "deletion_operations",
          "messages",
          "turn_reservations",
        ],
      );
      assert.ok(tableRows.rows.every((row) => row.rls_enabled && row.policy_count === 0));

      const roleAccess = await pool.query(
        `SELECT role_name,
                has_schema_privilege(role_name, 'conversation_private', 'USAGE') AS schema_usage,
                has_table_privilege(role_name, 'conversation_private.conversations', 'SELECT') AS can_read,
                has_function_privilege(role_name, 'conversation_private.guard_checkpoint_envelope_conversation()', 'EXECUTE') AS can_execute_guard
           FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS role_name
          ORDER BY role_name`,
      );
      assert.deepEqual(
        roleAccess.rows.map((row) => ({
          role: row.role_name,
          schema: row.schema_usage,
          read: row.can_read,
          function: row.can_execute_guard,
        })),
        [
          { role: "anon", schema: false, read: false, function: false },
          { role: "authenticated", schema: false, read: false, function: false },
          { role: "service_role", schema: false, read: false, function: false },
        ],
      );
      schemaVerified = true;

      await assertNoFixtureRows(pool, conversationId);
      fixturePreflightPassed = true;

      const created = await pool.query(
        `INSERT INTO conversation_private.conversations (conversation_id, expires_at)
         VALUES ($1, clock_timestamp() + interval '10 days')
         RETURNING conversation_id, expires_at`,
        [conversationId],
      );
      assert.equal(created.rows[0].conversation_id, conversationId);

      await pool.query(
        `INSERT INTO conversation_private.messages
           (conversation_id, message_seq, turn_id, idempotency_key, role, content)
         VALUES ($1, 1, $2, $3, 'user', $4)`,
        [conversationId, randomUUID(), fixtureMarker, fixtureMarker],
      );

      const config = {
        configurable: {
          thread_id: conversationId,
          checkpoint_ns: "",
          checkpoint_id: checkpointId,
        },
      };
      const checkpoint = {
        v: 4,
        id: checkpointId,
        ts: new Date().toISOString(),
        channel_values: { messages: [fixtureMarker] },
        channel_versions: { messages: 1 },
        versions_seen: {},
      };
      const savedConfig = await saver.put(
        config,
        checkpoint,
        { source: "loop", step: 0, writes: {}, parents: {} },
        { messages: 1 },
      );
      const envelopeParams = [
        conversationId,
        checkpointId,
        randomUUID(),
        randomUUID(),
        `sha256:${"a".repeat(64)}`,
      ];
      await assert.rejects(
        pool.query(
          `INSERT INTO conversation_private.checkpoint_envelopes
             (thread_id, checkpoint_ns, checkpoint_id, graph_version, state_schema_version,
              serializer_version, turn_id, correlation_id, ledger_refs, payload_digest, updated_at, expires_at)
           VALUES ($1, '', $2, 'agent-turn-v1', 1, 'fixture-serializer-v1', $3, $4,
                   '[]'::jsonb, $5, clock_timestamp(), clock_timestamp() + interval '30 days')`,
          envelopeParams,
        ),
        /Checkpoint envelope expiry exceeds conversation expiry/,
      );
      await pool.query(
        `INSERT INTO conversation_private.checkpoint_envelopes
           (thread_id, checkpoint_ns, checkpoint_id, graph_version, state_schema_version,
            serializer_version, turn_id, correlation_id, ledger_refs, payload_digest, updated_at, expires_at)
         VALUES ($1, '', $2, 'agent-turn-v1', 1, 'fixture-serializer-v1', $3, $4,
                 '[]'::jsonb, $5, clock_timestamp(), $6)`,
        [...envelopeParams, created.rows[0].expires_at],
      );
      await saver.putWrites(
        savedConfig,
        [["messages", { fixtureMarker }]],
        randomUUID(),
        "synthetic-test-path",
      );

      const loaded = await saver.getTuple(savedConfig);
      assert.equal(loaded?.checkpoint.id, checkpointId);
      assert.deepEqual(loaded?.checkpoint.channel_values.messages, [fixtureMarker]);
      assert.equal(loaded?.pendingWrites?.length, 1);
      assert.deepEqual(loaded?.pendingWrites?.[0].slice(1), ["messages", { fixtureMarker }]);

      await saver.deleteThread(conversationId);
      const remainingSaverRows = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM conversation_private.checkpoints WHERE thread_id = $1) AS checkpoints,
           (SELECT count(*)::int FROM conversation_private.checkpoint_blobs WHERE thread_id = $1) AS blobs,
           (SELECT count(*)::int FROM conversation_private.checkpoint_writes WHERE thread_id = $1) AS writes,
           (SELECT count(*)::int FROM conversation_private.checkpoint_envelopes WHERE thread_id = $1) AS envelopes`,
        [conversationId],
      );
      assert.deepEqual(remainingSaverRows.rows[0], {
        checkpoints: 0,
        blobs: 0,
        writes: 0,
        envelopes: 0,
      });
    } finally {
      const cleanupFailures = [];
      if (schemaVerified && fixturePreflightPassed) {
        try {
          await saver.deleteThread(conversationId);
        } catch {
          cleanupFailures.push("saver");
        }
        try {
          await pool.query(
            "DELETE FROM conversation_private.conversations WHERE conversation_id = $1",
            [conversationId],
          );
        } catch {
          cleanupFailures.push("conversation");
        }
        try {
          await assertNoFixtureRows(pool, conversationId);
        } catch {
          cleanupFailures.push("residuals");
        }
      }
      await saver.end();
      assert.deepEqual(cleanupFailures, [], "synthetic fixture cleanup must remove the exact conversation artifacts");
    }
  },
);
