-- SPEC-003@3 private conversation persistence.
-- This schema is intentionally not part of the Supabase Data API.
-- PostgresSaver DDL below mirrors @langchain/langgraph-checkpoint-postgres 1.1.2.

CREATE SCHEMA conversation_private;

REVOKE ALL PRIVILEGES ON SCHEMA conversation_private
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE conversation_private.conversations (
  conversation_id text PRIMARY KEY,
  lifecycle text NOT NULL DEFAULT 'active'
    CHECK (lifecycle IN ('active', 'deleting', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  last_message_seq bigint NOT NULL DEFAULT 0 CHECK (last_message_seq >= 0),
  policy_version text NOT NULL DEFAULT 'dec005-spec003-v1'
    CHECK (policy_version = 'dec005-spec003-v1'),
  active_turn_id uuid,
  CONSTRAINT conversations_id_canonical_uuid CHECK (
    conversation_id = lower(conversation_id)
    AND conversation_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT conversations_activity_order CHECK (created_at <= last_activity_at),
  CONSTRAINT conversations_retention_bound CHECK (
    expires_at > last_activity_at
    AND expires_at <= last_activity_at + interval '365 days'
  )
);

CREATE INDEX conversations_retention_idx
  ON conversation_private.conversations (expires_at, conversation_id)
  WHERE lifecycle IN ('active', 'deleting');

-- Canonical transcript rows. JSONB preserves structured message content without
-- exposing checkpoint state, tool payloads, or hidden model reasoning.
CREATE TABLE conversation_private.messages (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  message_seq bigint NOT NULL CHECK (message_seq > 0),
  turn_id uuid NOT NULL,
  idempotency_key text NOT NULL
    CHECK (octet_length(idempotency_key) BETWEEN 1 AND 256),
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool_summary')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT messages_conversation_sequence_key UNIQUE (conversation_id, message_seq),
  CONSTRAINT messages_conversation_fk FOREIGN KEY (conversation_id)
    REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE
);

CREATE INDEX messages_turn_order_idx
  ON conversation_private.messages (conversation_id, turn_id, message_seq);

CREATE TABLE conversation_private.turn_reservations (
  conversation_id text NOT NULL,
  idempotency_key text NOT NULL
    CHECK (octet_length(idempotency_key) BETWEEN 1 AND 256),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  turn_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'running', 'completed', 'uncertain', 'failed', 'cancelled')),
  replay_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (conversation_id, idempotency_key),
  CONSTRAINT turn_reservations_turn_key UNIQUE (conversation_id, turn_id),
  CONSTRAINT turn_reservations_conversation_fk FOREIGN KEY (conversation_id)
    REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT turn_reservations_completion_state CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE TABLE conversation_private.checkpoint_migrations (
  v integer PRIMARY KEY
);

-- PostgresSaver migration v0 creates checkpoint_migrations itself; the row is
-- inserted here after its table is available to reflect the pinned history.
INSERT INTO conversation_private.checkpoint_migrations (v) VALUES (0);

CREATE TABLE conversation_private.checkpoints (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  parent_checkpoint_id text,
  type text,
  checkpoint jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);
INSERT INTO conversation_private.checkpoint_migrations (v) VALUES (1);

CREATE TABLE conversation_private.checkpoint_blobs (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  channel text NOT NULL,
  version text NOT NULL,
  type text NOT NULL,
  blob bytea NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
INSERT INTO conversation_private.checkpoint_migrations (v) VALUES (2);

CREATE TABLE conversation_private.checkpoint_writes (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  task_id text NOT NULL,
  idx integer NOT NULL,
  channel text NOT NULL,
  type text,
  blob bytea NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
INSERT INTO conversation_private.checkpoint_migrations (v) VALUES (3);

ALTER TABLE conversation_private.checkpoint_blobs ALTER COLUMN blob DROP NOT NULL;
INSERT INTO conversation_private.checkpoint_migrations (v) VALUES (4);

ALTER TABLE conversation_private.checkpoint_writes
  ADD COLUMN task_path text NOT NULL DEFAULT '';
INSERT INTO conversation_private.checkpoint_migrations (v) VALUES (5);

-- The package's setup() reads the highest migration version and will therefore
-- have no DDL left to run if it is accidentally invoked. Runtime still must not
-- call setup(); migrations are installed separately by the release operator.

ALTER TABLE conversation_private.checkpoints
  ADD CONSTRAINT checkpoints_conversation_fk FOREIGN KEY (thread_id)
  REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE;
ALTER TABLE conversation_private.checkpoint_blobs
  ADD CONSTRAINT checkpoint_blobs_conversation_fk FOREIGN KEY (thread_id)
  REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE;
ALTER TABLE conversation_private.checkpoint_writes
  ADD CONSTRAINT checkpoint_writes_conversation_fk FOREIGN KEY (thread_id)
  REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE;

CREATE TABLE conversation_private.checkpoint_envelopes (
  thread_id text NOT NULL,
  checkpoint_ns text NOT NULL DEFAULT '',
  checkpoint_id text NOT NULL,
  parent_checkpoint_id text,
  graph_version text NOT NULL,
  state_schema_version integer NOT NULL CHECK (state_schema_version > 0),
  serializer_version text NOT NULL,
  turn_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  ledger_refs jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(ledger_refs) = 'array'),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id),
  CONSTRAINT checkpoint_envelopes_expiry_bound CHECK (
    expires_at > updated_at
    AND expires_at <= updated_at + interval '30 days'
  ),
  CONSTRAINT checkpoint_envelopes_conversation_fk FOREIGN KEY (thread_id)
    REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT checkpoint_envelopes_checkpoint_fk FOREIGN KEY (
    thread_id, checkpoint_ns, checkpoint_id
  ) REFERENCES conversation_private.checkpoints (
    thread_id, checkpoint_ns, checkpoint_id
  ) ON DELETE CASCADE
);

CREATE INDEX checkpoint_envelopes_expiry_idx
  ON conversation_private.checkpoint_envelopes (expires_at, thread_id);

CREATE FUNCTION conversation_private.guard_checkpoint_envelope_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, conversation_private
AS $$
DECLARE
  v_conversation_expires_at timestamptz;
  v_lifecycle text;
BEGIN
  SELECT c.expires_at, c.lifecycle
    INTO v_conversation_expires_at, v_lifecycle
    FROM conversation_private.conversations AS c
   WHERE c.conversation_id = NEW.thread_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkpoint envelope conversation does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF v_lifecycle <> 'active' THEN
    RAISE EXCEPTION 'Checkpoint envelope conversation is not active'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.expires_at > v_conversation_expires_at THEN
    RAISE EXCEPTION 'Checkpoint envelope expiry exceeds conversation expiry'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER checkpoint_envelopes_conversation_guard
BEFORE INSERT OR UPDATE OF thread_id, expires_at
ON conversation_private.checkpoint_envelopes
FOR EACH ROW
EXECUTE FUNCTION conversation_private.guard_checkpoint_envelope_conversation();

REVOKE ALL PRIVILEGES ON FUNCTION conversation_private.guard_checkpoint_envelope_conversation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE conversation_private.context_summaries (
  summary_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id text NOT NULL,
  summary_format_version integer NOT NULL CHECK (summary_format_version > 0),
  summarizer_config_version text NOT NULL,
  from_message_seq bigint NOT NULL CHECK (from_message_seq > 0),
  through_message_seq bigint NOT NULL,
  source_transcript_version bigint NOT NULL CHECK (source_transcript_version >= 0),
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT context_summaries_range CHECK (through_message_seq >= from_message_seq),
  CONSTRAINT context_summaries_conversation_fk FOREIGN KEY (conversation_id)
    REFERENCES conversation_private.conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT context_summaries_version_key UNIQUE (
    conversation_id,
    summary_format_version,
    summarizer_config_version,
    from_message_seq,
    through_message_seq,
    source_transcript_version
  )
);

CREATE INDEX context_summaries_source_idx
  ON conversation_private.context_summaries (conversation_id, through_message_seq DESC);

-- This metadata has no FK so a completed deletion record can remain for the
-- approved 30-day operational retention window after conversation content is gone.
CREATE TABLE conversation_private.deletion_operations (
  request_id uuid PRIMARY KEY,
  conversation_id text NOT NULL,
  status text NOT NULL DEFAULT 'deleting' CHECK (status IN ('deleting', 'completed')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  purge_after timestamptz,
  CONSTRAINT deletion_operations_completion_state CHECK (
    (status = 'deleting' AND completed_at IS NULL AND purge_after IS NULL)
    OR (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND purge_after IS NOT NULL
      AND purge_after >= completed_at
      AND purge_after <= completed_at + interval '30 days'
    )
  )
);

CREATE INDEX deletion_operations_purge_idx
  ON conversation_private.deletion_operations (purge_after)
  WHERE status = 'completed';

ALTER TABLE conversation_private.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.turn_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.checkpoint_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.checkpoint_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.checkpoint_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.checkpoint_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.context_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_private.deletion_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA conversation_private
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA conversation_private
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA conversation_private
  FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA conversation_private
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA conversation_private
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA conversation_private
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON SCHEMA conversation_private IS
  'Private SPEC-003 storage, excluded from the Supabase Data API exposed schemas.';
COMMENT ON TABLE conversation_private.checkpoint_migrations IS
  'Pinned @langchain/langgraph-checkpoint-postgres 1.1.2 migration versions 0 through 5.';
