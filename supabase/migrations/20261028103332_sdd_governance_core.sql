-- FlowZenit SDD governance control plane.
-- Operational state is isolated from application data and the public Data API.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA sdd;
REVOKE ALL ON SCHEMA sdd FROM PUBLIC, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sdd
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sdd
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sdd
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE sdd.specifications (
  spec_id text PRIMARY KEY CHECK (spec_id ~ '^[A-Z][A-Z0-9]+-[0-9]{2,}$'),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN (
    'DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'QUEUED', 'PLANNING',
    'IMPLEMENTING', 'TESTING', 'FIXING', 'VALIDATING', 'COMPLETED', 'BLOCKED'
  )),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE sdd.spec_versions (
  spec_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spec_id text NOT NULL REFERENCES sdd.specifications(spec_id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  source_paths text[] NOT NULL CHECK (cardinality(source_paths) > 0),
  dependencies text[] NOT NULL DEFAULT '{}',
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  registered_by text NOT NULL CHECK (length(btrim(registered_by)) > 0),
  idempotency_key uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (spec_id, version),
  UNIQUE (spec_version_id, spec_id),
  UNIQUE (idempotency_key)
);

CREATE TABLE sdd.batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  state text NOT NULL DEFAULT 'DRAFT' CHECK (state IN (
    'DRAFT', 'READY_FOR_APPROVAL', 'APPROVED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED'
  )),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  approved_by text,
  approved_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  completed_at timestamptz,
  current_spec_id text,
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  idempotency_key uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CHECK ((state = 'PAUSED') = (paused_at IS NOT NULL))
);

CREATE TABLE sdd.batch_specs (
  batch_id uuid NOT NULL REFERENCES sdd.batches(batch_id) ON DELETE RESTRICT,
  spec_id text NOT NULL,
  spec_version_id uuid NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  state text NOT NULL DEFAULT 'QUEUED' CHECK (state IN (
    'QUEUED', 'RUNNING', 'COMPLETED', 'BLOCKED', 'CANCELLED'
  )),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (batch_id, spec_id),
  UNIQUE (batch_id, position),
  UNIQUE (batch_id, spec_id, spec_version_id),
  FOREIGN KEY (spec_version_id, spec_id)
    REFERENCES sdd.spec_versions(spec_version_id, spec_id) ON DELETE RESTRICT
);

CREATE TABLE sdd.authorizations (
  authorization_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES sdd.batches(batch_id) ON DELETE RESTRICT,
  spec_id text,
  authorization_type text NOT NULL CHECK (authorization_type IN (
    'BATCH_APPROVAL', 'RESUME', 'LIMIT_EXTENSION', 'CANCEL'
  )),
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  approved_by text NOT NULL CHECK (length(btrim(approved_by)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  additional_attempts integer NOT NULL DEFAULT 0 CHECK (additional_attempts >= 0),
  additional_seconds integer NOT NULL DEFAULT 0 CHECK (additional_seconds >= 0),
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (batch_id, spec_id)
    REFERENCES sdd.batch_specs(batch_id, spec_id) ON DELETE RESTRICT,
  CHECK (
    (authorization_type = 'LIMIT_EXTENSION' AND spec_id IS NOT NULL
      AND (additional_attempts > 0 OR additional_seconds > 0))
    OR (authorization_type <> 'LIMIT_EXTENSION' AND additional_attempts = 0 AND additional_seconds = 0)
  )
);

CREATE TABLE sdd.runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  spec_id text NOT NULL,
  spec_version_id uuid NOT NULL,
  run_number integer NOT NULL CHECK (run_number > 0),
  state text NOT NULL DEFAULT 'PLANNING' CHECK (state IN (
    'PLANNING', 'IMPLEMENTING', 'TESTING', 'FIXING', 'VALIDATING',
    'COMPLETED', 'BLOCKED', 'PAUSED', 'CANCELLED'
  )),
  started_by text NOT NULL CHECK (length(btrim(started_by)) > 0),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  summary text,
  UNIQUE (batch_id, spec_id, run_number),
  FOREIGN KEY (batch_id, spec_id, spec_version_id)
    REFERENCES sdd.batch_specs(batch_id, spec_id, spec_version_id) ON DELETE RESTRICT,
  CHECK ((state IN ('COMPLETED', 'BLOCKED', 'PAUSED', 'CANCELLED')) = (ended_at IS NOT NULL))
);

CREATE TABLE sdd.tasks (
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES sdd.runs(run_id) ON DELETE RESTRICT,
  task_key text NOT NULL CHECK (length(btrim(task_key)) > 0),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN (
    'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'
  )),
  agent_profile text,
  agent_ref text,
  file_scope text[] NOT NULL DEFAULT '{}',
  started_at timestamptz,
  ended_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (run_id, task_key),
  UNIQUE (task_id, run_id),
  CHECK ((state = 'RUNNING') = (started_at IS NOT NULL AND ended_at IS NULL)),
  CHECK ((state IN ('COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED')) = (ended_at IS NOT NULL))
);

CREATE TABLE sdd.failures (
  failure_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES sdd.runs(run_id) ON DELETE RESTRICT,
  task_id uuid,
  fingerprint text NOT NULL CHECK (length(btrim(fingerprint)) > 0),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  root_cause text,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'RESOLVED', 'BLOCKED')),
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resolution_evidence jsonb,
  FOREIGN KEY (task_id, run_id) REFERENCES sdd.tasks(task_id, run_id) ON DELETE RESTRICT,
  CHECK ((state = 'RESOLVED') = (resolved_at IS NOT NULL))
);

CREATE TABLE sdd.correction_attempts (
  correction_attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id uuid NOT NULL REFERENCES sdd.failures(failure_id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  state text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (state IN (
    'IN_PROGRESS', 'RESOLVED', 'UNRESOLVED', 'INTERRUPTED'
  )),
  diagnosis text NOT NULL CHECK (length(btrim(diagnosis)) > 0),
  started_by text NOT NULL CHECK (length(btrim(started_by)) > 0),
  idempotency_key uuid NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  UNIQUE (failure_id, attempt_number),
  CHECK ((state = 'IN_PROGRESS') = (ended_at IS NULL))
);

CREATE TABLE sdd.fix_windows (
  fix_window_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_attempt_id uuid NOT NULL REFERENCES sdd.correction_attempts(correction_attempt_id) ON DELETE RESTRICT,
  agent_id text NOT NULL CHECK (length(btrim(agent_id)) > 0),
  agent_ref text,
  idempotency_key uuid NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  worker_seconds bigint NOT NULL DEFAULT 0 CHECK (worker_seconds >= 0),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE sdd.quality_gates (
  gate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES sdd.runs(run_id) ON DELETE RESTRICT,
  gate_key text NOT NULL CHECK (length(btrim(gate_key)) > 0),
  required boolean NOT NULL DEFAULT true,
  state text NOT NULL DEFAULT 'PENDING' CHECK (state IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED')),
  command text,
  exit_code integer,
  started_at timestamptz,
  ended_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_by text NOT NULL CHECK (length(btrim(recorded_by)) > 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (run_id, gate_key),
  CHECK (state <> 'PASSED' OR exit_code IS NULL OR exit_code = 0),
  CHECK (state <> 'FAILED' OR exit_code IS NULL OR exit_code <> 0)
);

CREATE TABLE sdd.checkpoints (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES sdd.runs(run_id) ON DELETE RESTRICT,
  sequence bigint NOT NULL CHECK (sequence > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK (length(btrim(created_by)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (run_id, sequence)
);

CREATE TABLE sdd.execution_leases (
  batch_id uuid PRIMARY KEY REFERENCES sdd.batches(batch_id) ON DELETE RESTRICT,
  lease_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  owner_id text NOT NULL CHECK (length(btrim(owner_id)) > 0),
  acquired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  heartbeat_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '15 minutes'),
  CHECK (expires_at > acquired_at)
);

CREATE TABLE sdd.audit_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id uuid REFERENCES sdd.batches(batch_id) ON DELETE RESTRICT,
  spec_id text,
  run_id uuid REFERENCES sdd.runs(run_id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('USER', 'ORCHESTRATOR', 'AGENT', 'SUPERVISOR', 'SYSTEM')),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  from_state text,
  to_state text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  idempotency_key uuid UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX batches_state_created_idx ON sdd.batches (state, created_at DESC);
CREATE INDEX batch_specs_order_idx ON sdd.batch_specs (batch_id, position);
CREATE INDEX runs_batch_spec_idx ON sdd.runs (batch_id, spec_id, run_number DESC);
CREATE INDEX tasks_run_state_idx ON sdd.tasks (run_id, state);
CREATE INDEX failures_open_run_idx ON sdd.failures (run_id, state) WHERE state = 'OPEN';
CREATE UNIQUE INDEX failures_open_fingerprint_idx ON sdd.failures (run_id, fingerprint) WHERE state = 'OPEN';
CREATE INDEX fix_windows_attempt_time_idx ON sdd.fix_windows (correction_attempt_id, started_at, ended_at);
CREATE INDEX gates_run_state_idx ON sdd.quality_gates (run_id, state, required);
CREATE INDEX checkpoints_run_sequence_idx ON sdd.checkpoints (run_id, sequence DESC);
CREATE INDEX audit_events_batch_time_idx ON sdd.audit_events (batch_id, occurred_at DESC);

ALTER TABLE sdd.specifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.spec_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.batch_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.correction_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.fix_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.quality_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.execution_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdd.audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA sdd FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA sdd FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sdd FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION sdd.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, sdd
AS $$
BEGIN
  RAISE EXCEPTION 'SDD audit records are append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON sdd.audit_events
FOR EACH ROW EXECUTE FUNCTION sdd.reject_audit_mutation();

CREATE TRIGGER authorizations_append_only
BEFORE UPDATE OR DELETE ON sdd.authorizations
FOR EACH ROW EXECUTE FUNCTION sdd.reject_audit_mutation();

CREATE FUNCTION sdd.write_event(
  p_batch_id uuid,
  p_spec_id text,
  p_run_id uuid,
  p_actor_type text,
  p_actor_id text,
  p_event_type text,
  p_from_state text,
  p_to_state text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_event_id bigint;
BEGIN
  IF sdd.has_sensitive_key(COALESCE(p_details, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Audit details cannot contain credential or transcript fields';
  END IF;
  INSERT INTO sdd.audit_events (
    batch_id, spec_id, run_id, actor_type, actor_id, event_type,
    from_state, to_state, details, idempotency_key
  ) VALUES (
    p_batch_id, p_spec_id, p_run_id, p_actor_type, p_actor_id, p_event_type,
    p_from_state, p_to_state, COALESCE(p_details, '{}'::jsonb), p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING event_id INTO v_event_id;
  IF v_event_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT event_id INTO v_event_id FROM sdd.audit_events WHERE idempotency_key = p_idempotency_key;
  END IF;
  RETURN v_event_id;
END;
$$;

CREATE FUNCTION sdd.has_sensitive_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_item record;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR v_item IN SELECT key, value FROM jsonb_each(p_value) LOOP
      IF v_item.key ~* '(secret|token|password|api[_-]?key|authorization|credential|transcript)'
         OR sdd.has_sensitive_key(v_item.value) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) LOOP
      IF sdd.has_sensitive_key(v_item.value) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE FUNCTION sdd.fix_elapsed_seconds(p_batch_id uuid, p_spec_id text)
RETURNS bigint
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog, sdd
AS $$
  SELECT COALESCE(SUM(CEIL(EXTRACT(EPOCH FROM upper(range_value) - lower(range_value))))::bigint, 0)
  FROM (
    SELECT range_agg(tstzrange(w.started_at, COALESCE(w.ended_at, clock_timestamp()), '[)')) AS ranges
    FROM sdd.fix_windows AS w
    JOIN sdd.correction_attempts AS a USING (correction_attempt_id)
    JOIN sdd.failures AS f USING (failure_id)
    JOIN sdd.runs AS r USING (run_id)
    WHERE r.batch_id = p_batch_id AND r.spec_id = p_spec_id
  ) AS aggregated
  CROSS JOIN LATERAL unnest(aggregated.ranges) AS ranges(range_value);
$$;

CREATE FUNCTION sdd.worker_seconds(p_batch_id uuid, p_spec_id text)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = pg_catalog, sdd
AS $$
  SELECT COALESCE(SUM(w.worker_seconds), 0)::bigint
  FROM sdd.fix_windows AS w
  JOIN sdd.correction_attempts AS a USING (correction_attempt_id)
  JOIN sdd.failures AS f USING (failure_id)
  JOIN sdd.runs AS r USING (run_id)
  WHERE r.batch_id = p_batch_id AND r.spec_id = p_spec_id;
$$;

CREATE FUNCTION sdd.effective_limits(p_batch_id uuid, p_spec_id text)
RETURNS TABLE (max_attempts bigint, max_seconds bigint)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, sdd
AS $$
  SELECT 5::bigint + COALESCE(SUM(a.additional_attempts), 0)::bigint,
         7200 + COALESCE(SUM(a.additional_seconds), 0)::bigint
  FROM sdd.authorizations AS a
  WHERE a.batch_id = p_batch_id
    AND a.spec_id = p_spec_id
    AND a.authorization_type = 'LIMIT_EXTENSION';
$$;

CREATE FUNCTION sdd.pause_for_limit(p_batch_id uuid, p_spec_id text, p_reason text, p_actor_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch_state text;
BEGIN
  SELECT state INTO v_batch_state
  FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF v_batch_state IS NULL OR v_batch_state IN ('COMPLETED', 'CANCELLED') THEN
    RETURN;
  END IF;

  UPDATE sdd.fix_windows w SET ended_at = v_window_end,
    worker_seconds = GREATEST(w.worker_seconds,CEIL(EXTRACT(EPOCH FROM clock_timestamp()-w.started_at))::bigint)
  FROM sdd.correction_attempts a
  JOIN sdd.failures f USING (failure_id)
  JOIN sdd.runs r USING (run_id)
  WHERE w.correction_attempt_id = a.correction_attempt_id
    AND r.batch_id = p_batch_id AND r.spec_id = p_spec_id AND w.ended_at IS NULL;
  UPDATE sdd.correction_attempts a SET state = 'INTERRUPTED', ended_at = clock_timestamp()
  FROM sdd.failures f JOIN sdd.runs r USING (run_id)
  WHERE a.failure_id = f.failure_id AND r.run_id = f.run_id
    AND r.batch_id = p_batch_id AND r.spec_id = p_spec_id AND a.state = 'IN_PROGRESS';

  UPDATE sdd.specifications SET state = 'BLOCKED', updated_at = clock_timestamp()
  WHERE spec_id = p_spec_id;
  UPDATE sdd.batch_specs SET state = 'BLOCKED'
  WHERE batch_id = p_batch_id AND spec_id = p_spec_id;
  UPDATE sdd.runs SET state = 'BLOCKED', ended_at = clock_timestamp()
  WHERE batch_id = p_batch_id AND spec_id = p_spec_id
    AND state NOT IN ('COMPLETED', 'BLOCKED', 'PAUSED', 'CANCELLED')
    AND ended_at IS NULL;
  UPDATE sdd.batches
  SET state = 'PAUSED', paused_at = clock_timestamp(), pause_reason = p_reason,
      state_version = state_version + 1, updated_at = clock_timestamp()
  WHERE batch_id = p_batch_id;
  DELETE FROM sdd.execution_leases WHERE batch_id = p_batch_id;
  PERFORM sdd.write_event(p_batch_id, p_spec_id, NULL, 'SUPERVISOR', p_actor_id,
    'LIMIT_REACHED', v_batch_state, 'PAUSED', jsonb_build_object('reason', p_reason));
END;
$$;

CREATE FUNCTION public.sdd_health()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
  SELECT jsonb_build_object('schema', 'sdd', 'version', 1, 'ready', true,
    'server_time', clock_timestamp());
$$;

CREATE FUNCTION sdd.require_active_lease(
  p_batch_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_spec_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, sdd
AS $$
BEGIN
  PERFORM 1 FROM sdd.batches
  WHERE batch_id = p_batch_id AND state = 'RUNNING'
    AND (p_spec_id IS NULL OR current_spec_id = p_spec_id)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A running batch is required'; END IF;

  PERFORM 1 FROM sdd.execution_leases
  WHERE batch_id = p_batch_id AND lease_token = p_lease_token
    AND owner_id = p_owner_id AND expires_at > clock_timestamp()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A current execution lease is required'; END IF;
END;
$$;

CREATE FUNCTION public.sdd_register_spec_version(
  p_spec_id text,
  p_title text,
  p_version integer,
  p_content_hash text,
  p_source_paths text[],
  p_dependencies text[],
  p_snapshot jsonb,
  p_registered_by text,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_id uuid;
  v_existing_hash text;
  v_existing sdd.spec_versions%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_spec_id,0));
  IF p_spec_id !~ '^[A-Z][A-Z0-9]+-[0-9]{2,}$'
     OR p_version < 1 OR p_content_hash !~ '^[0-9a-f]{64}$'
     OR cardinality(p_source_paths) < 1
     OR jsonb_typeof(p_snapshot) <> 'object'
     OR length(btrim(p_registered_by)) = 0 THEN
    RAISE EXCEPTION 'Invalid SPEC version metadata';
  END IF;
  IF sdd.has_sensitive_key(p_snapshot) THEN
    RAISE EXCEPTION 'SPEC snapshots cannot contain credential or transcript fields';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM sdd.spec_versions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF v_existing.spec_id <> p_spec_id OR v_existing.version <> p_version
         OR v_existing.content_hash <> p_content_hash THEN
        RAISE EXCEPTION 'Idempotency key was reused with different SPEC version data';
      END IF;
      RETURN v_existing.spec_version_id;
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM sdd.batch_specs item JOIN sdd.batches batch USING (batch_id)
    WHERE item.spec_id = p_spec_id AND batch.state IN ('APPROVED','RUNNING','PAUSED')
  ) THEN
    RAISE EXCEPTION 'Cannot change a SPEC version while it is authorized in an active batch';
  END IF;

  INSERT INTO sdd.specifications (spec_id, title, current_version)
  VALUES (p_spec_id, p_title, p_version)
  ON CONFLICT (spec_id) DO UPDATE
    SET title = EXCLUDED.title, updated_at = clock_timestamp();

  INSERT INTO sdd.spec_versions (
    spec_id, version, content_hash, source_paths, dependencies, snapshot,
    registered_by, idempotency_key
  ) VALUES (
    p_spec_id, p_version, p_content_hash, p_source_paths,
    COALESCE(p_dependencies, '{}'), p_snapshot, p_registered_by, p_idempotency_key
  ) ON CONFLICT (spec_id, version) DO NOTHING
  RETURNING spec_version_id INTO v_id;

  IF v_id IS NULL THEN
    SELECT spec_version_id, content_hash INTO v_id, v_existing_hash
    FROM sdd.spec_versions WHERE spec_id = p_spec_id AND version = p_version;
    IF v_existing_hash <> p_content_hash THEN
      RAISE EXCEPTION 'SPEC version already exists with different content; register a new version';
    END IF;
  ELSE
    UPDATE sdd.specifications SET current_version = GREATEST(current_version, p_version),
      state = 'READY_FOR_REVIEW', updated_at = clock_timestamp()
    WHERE spec_id = p_spec_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.sdd_create_batch(
  p_name text,
  p_items jsonb,
  p_created_by text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd, extensions
AS $$
DECLARE
  v_batch_id uuid;
  v_manifest jsonb;
  v_hash text;
  v_item_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0
     OR length(btrim(p_name)) = 0 OR length(btrim(p_created_by)) = 0 THEN
    RAISE EXCEPTION 'Batch name, actor and non-empty ordered SPEC list are required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
    GROUP BY spec_id HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
    GROUP BY position HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'A batch cannot repeat a SPEC or position';
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer);
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
    WHERE item.position IS NULL OR item.position < 1 OR item.version IS NULL OR item.version < 1
  ) OR (SELECT MIN(position) FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)) <> 1
    OR (SELECT MAX(position) FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)) <> v_item_count THEN
    RAISE EXCEPTION 'SPEC positions must be consecutive and start at 1';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
    LEFT JOIN sdd.spec_versions AS version
      ON version.spec_id = item.spec_id AND version.version = item.version
    WHERE version.spec_version_id IS NULL
  ) THEN
    RAISE EXCEPTION 'A SPEC version in the manifest is not registered';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
    JOIN sdd.spec_versions AS version
      ON version.spec_id = item.spec_id AND version.version = item.version
    CROSS JOIN LATERAL unnest(version.dependencies) AS dependency(spec_id)
    LEFT JOIN jsonb_to_recordset(p_items) AS included(spec_id text, version integer, position integer)
      ON included.spec_id = dependency.spec_id
    LEFT JOIN sdd.specifications AS completed
      ON completed.spec_id = dependency.spec_id AND completed.state = 'COMPLETED'
    WHERE included.spec_id IS NULL AND completed.spec_id IS NULL
       OR included.spec_id IS NOT NULL AND included.position >= item.position
  ) THEN
    RAISE EXCEPTION 'Batch dependency is missing, incomplete, or ordered after its dependent SPEC';
  END IF;

  SELECT jsonb_build_object('items', jsonb_agg(jsonb_build_object(
    'spec_id', item.spec_id,
    'version', item.version,
    'spec_version_id', version.spec_version_id,
    'content_hash', version.content_hash,
    'dependencies', version.dependencies,
    'position', item.position
  ) ORDER BY item.position)) INTO v_manifest
  FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
  JOIN sdd.spec_versions AS version
    ON version.spec_id = item.spec_id AND version.version = item.version;

  v_hash := encode(extensions.digest(convert_to(v_manifest::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO sdd.batches (name, state, manifest, manifest_hash, created_by, idempotency_key)
  VALUES (p_name, 'READY_FOR_APPROVAL', v_manifest, v_hash, p_created_by, p_idempotency_key)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING batch_id INTO v_batch_id;

  IF v_batch_id IS NULL THEN
    SELECT batch_id INTO v_batch_id FROM sdd.batches WHERE idempotency_key = p_idempotency_key;
    IF NOT EXISTS (SELECT 1 FROM sdd.batches WHERE batch_id = v_batch_id AND manifest_hash = v_hash) THEN
      RAISE EXCEPTION 'Idempotency key was reused with a different manifest';
    END IF;
    RETURN jsonb_build_object('batch_id', v_batch_id, 'manifest_hash', v_hash,
      'state', (SELECT state FROM sdd.batches WHERE batch_id = v_batch_id));
  END IF;

  INSERT INTO sdd.batch_specs (batch_id, spec_id, spec_version_id, position)
  SELECT v_batch_id, item.spec_id, version.spec_version_id, item.position
  FROM jsonb_to_recordset(p_items) AS item(spec_id text, version integer, position integer)
  JOIN sdd.spec_versions AS version
    ON version.spec_id = item.spec_id AND version.version = item.version;

  PERFORM sdd.write_event(v_batch_id, NULL, NULL, 'USER', p_created_by,
    'BATCH_CREATED', NULL, 'READY_FOR_APPROVAL',
    jsonb_build_object('manifest_hash', v_hash, 'item_count', v_item_count), p_idempotency_key);

  RETURN jsonb_build_object('batch_id', v_batch_id, 'manifest_hash', v_hash, 'state', 'READY_FOR_APPROVAL');
END;
$$;

CREATE FUNCTION public.sdd_validate_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd, extensions
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_actual_hash text;
  v_missing integer;
  v_count integer;
BEGIN
  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;

  v_actual_hash := encode(extensions.digest(convert_to(v_batch.manifest::text, 'UTF8'), 'sha256'), 'hex');
  SELECT COUNT(*) INTO v_count FROM sdd.batch_specs WHERE batch_id = p_batch_id;
  SELECT COUNT(*) INTO v_missing
  FROM sdd.batch_specs AS item
  JOIN sdd.spec_versions AS version USING (spec_version_id)
  WHERE item.batch_id = p_batch_id AND (
    item.spec_id <> version.spec_id
    OR (v_batch.manifest #>> ARRAY['items', (item.position - 1)::text, 'content_hash']) <> version.content_hash
    OR (v_batch.manifest #>> ARRAY['items', (item.position - 1)::text, 'spec_id']) <> item.spec_id
  );

  RETURN jsonb_build_object(
    'valid', v_actual_hash = v_batch.manifest_hash AND v_count > 0 AND v_missing = 0,
    'batch_id', p_batch_id, 'state', v_batch.state,
    'manifest_hash', v_batch.manifest_hash,
    'manifest_hash_current', v_actual_hash,
    'spec_count', v_count, 'manifest_mismatches', v_missing
  );
END;
$$;

CREATE FUNCTION public.sdd_approve_batch(
  p_batch_id uuid,
  p_manifest_hash text,
  p_approved_by text,
  p_confirmation text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd, extensions
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_check jsonb;
  v_spec_id text;
BEGIN
  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.state = 'APPROVED' AND EXISTS (
    SELECT 1 FROM sdd.authorizations WHERE batch_id = p_batch_id
      AND authorization_type = 'BATCH_APPROVAL' AND idempotency_key = p_idempotency_key
      AND manifest_hash = p_manifest_hash
  ) THEN
    RETURN jsonb_build_object('batch_id',p_batch_id,'state','APPROVED','manifest_hash',p_manifest_hash);
  END IF;
  IF v_batch.state <> 'READY_FOR_APPROVAL' THEN RAISE EXCEPTION 'Only a reviewed batch can be approved'; END IF;
  FOR v_spec_id IN SELECT spec_id FROM sdd.batch_specs
    WHERE batch_id = p_batch_id ORDER BY spec_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_spec_id,0));
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM sdd.batch_specs AS requested
    JOIN sdd.batch_specs AS active ON active.spec_id = requested.spec_id AND active.batch_id <> requested.batch_id
    JOIN sdd.batches AS active_batch ON active_batch.batch_id = active.batch_id
    WHERE requested.batch_id = p_batch_id AND active_batch.state IN ('APPROVED','RUNNING','PAUSED')
  ) THEN
    RAISE EXCEPTION 'A SPEC in this batch is already authorized or running in another batch';
  END IF;
  v_check := public.sdd_validate_batch(p_batch_id);
  IF NOT COALESCE((v_check->>'valid')::boolean, false)
     OR v_batch.manifest_hash <> p_manifest_hash THEN
    RAISE EXCEPTION 'The batch manifest changed after review';
  END IF;
  IF p_confirmation <> ('APROVAR ' || p_batch_id::text || ' ' || p_manifest_hash)
     OR length(btrim(p_approved_by)) = 0 THEN
    RAISE EXCEPTION 'Explicit confirmation of the exact batch and manifest is required';
  END IF;

  INSERT INTO sdd.authorizations (
    batch_id, authorization_type, manifest_hash, approved_by, reason, idempotency_key
  ) VALUES (
    p_batch_id, 'BATCH_APPROVAL', p_manifest_hash, p_approved_by,
    'Explicit approval of the immutable manifest', p_idempotency_key
  );

  UPDATE sdd.batches SET state = 'APPROVED', approved_by = p_approved_by,
    approved_at = clock_timestamp(), state_version = state_version + 1,
    updated_at = clock_timestamp()
  WHERE batch_id = p_batch_id;
  UPDATE sdd.specifications AS spec SET state = 'QUEUED', updated_at = clock_timestamp()
  FROM sdd.batch_specs AS item
  WHERE item.batch_id = p_batch_id AND item.spec_id = spec.spec_id
    AND spec.state <> 'COMPLETED';

  PERFORM sdd.write_event(p_batch_id, NULL, NULL, 'USER', p_approved_by,
    'BATCH_APPROVED', 'READY_FOR_APPROVAL', 'APPROVED',
    jsonb_build_object('manifest_hash', p_manifest_hash), p_idempotency_key);

  RETURN jsonb_build_object('batch_id', p_batch_id, 'state', 'APPROVED', 'manifest_hash', p_manifest_hash);
END;
$$;

CREATE FUNCTION public.sdd_claim_batch(
  p_batch_id uuid,
  p_owner_id text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_token uuid;
BEGIN
  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF v_batch.state = 'RUNNING' THEN
    SELECT lease_token INTO v_token FROM sdd.execution_leases
    WHERE batch_id = p_batch_id AND idempotency_key = p_idempotency_key
      AND owner_id = p_owner_id AND expires_at > clock_timestamp();
    IF v_token IS NOT NULL THEN
      RETURN jsonb_build_object('batch_id',p_batch_id,'state','RUNNING','lease_token',v_token);
    END IF;
    IF EXISTS (SELECT 1 FROM sdd.execution_leases WHERE batch_id=p_batch_id
      AND idempotency_key=p_idempotency_key) THEN
      RAISE EXCEPTION 'The idempotent claim lease expired; recover the batch before retrying';
    END IF;
  END IF;
  IF v_batch.state <> 'APPROVED' THEN RAISE EXCEPTION 'Only an approved batch can start'; END IF;
  IF EXISTS (
    SELECT 1 FROM sdd.batch_specs requested
    JOIN sdd.batch_specs active ON active.spec_id=requested.spec_id AND active.batch_id<>requested.batch_id
    JOIN sdd.batches other_batch ON other_batch.batch_id=active.batch_id
    WHERE requested.batch_id=p_batch_id AND other_batch.state IN ('APPROVED','RUNNING','PAUSED')
  ) THEN RAISE EXCEPTION 'A SPEC in this batch is already authorized or running in another batch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM sdd.authorizations WHERE batch_id = p_batch_id
    AND authorization_type = 'BATCH_APPROVAL' AND manifest_hash = v_batch.manifest_hash) THEN
    RAISE EXCEPTION 'Persisted approval for this manifest is required';
  END IF;
  IF length(btrim(p_owner_id)) = 0 THEN RAISE EXCEPTION 'Runner identity is required'; END IF;

  INSERT INTO sdd.execution_leases (batch_id, owner_id, idempotency_key)
  VALUES (p_batch_id, p_owner_id, p_idempotency_key)
  ON CONFLICT (batch_id) DO NOTHING
  RETURNING lease_token INTO v_token;
  IF v_token IS NULL THEN RAISE EXCEPTION 'Batch already has an active lease'; END IF;

  UPDATE sdd.batches SET state = 'RUNNING', started_at = COALESCE(started_at, clock_timestamp()),
    state_version = state_version + 1, updated_at = clock_timestamp()
  WHERE batch_id = p_batch_id;
  UPDATE sdd.specifications AS spec SET state = 'PLANNING', updated_at = clock_timestamp()
  FROM sdd.batch_specs AS item
  WHERE item.batch_id = p_batch_id AND item.position = 1 AND item.spec_id = spec.spec_id;
  PERFORM sdd.write_event(p_batch_id, NULL, NULL, 'ORCHESTRATOR', p_owner_id,
    'BATCH_STARTED', 'APPROVED', 'RUNNING', '{}'::jsonb, p_idempotency_key);

  RETURN jsonb_build_object('batch_id', p_batch_id, 'state', 'RUNNING', 'lease_token', v_token);
END;
$$;

CREATE FUNCTION public.sdd_heartbeat(
  p_batch_id uuid,
  p_lease_token uuid,
  p_owner_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_lease sdd.execution_leases%ROWTYPE;
  v_failure record;
  v_limits record;
  v_attempts integer;
  v_elapsed bigint;
BEGIN
  PERFORM 1 FROM sdd.batches WHERE batch_id = p_batch_id AND state = 'RUNNING' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Running batch required'; END IF;
  SELECT * INTO v_lease FROM sdd.execution_leases WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_lease.lease_token <> p_lease_token OR v_lease.owner_id <> p_owner_id
     OR v_lease.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Execution lease is missing, expired, or owned by another runner';
  END IF;

  UPDATE sdd.execution_leases SET heartbeat_at = clock_timestamp(),
    expires_at = clock_timestamp() + interval '15 minutes' WHERE batch_id = p_batch_id;

  FOR v_failure IN
    SELECT f.failure_id, f.run_id, r.spec_id
    FROM sdd.failures AS f JOIN sdd.runs AS r USING (run_id)
    WHERE r.batch_id = p_batch_id AND f.state = 'OPEN'
  LOOP
    SELECT * INTO v_limits FROM sdd.effective_limits(p_batch_id, v_failure.spec_id);
    SELECT COUNT(*)::integer INTO v_attempts FROM sdd.correction_attempts
    WHERE failure_id = v_failure.failure_id;
    v_elapsed := sdd.fix_elapsed_seconds(p_batch_id, v_failure.spec_id);
    IF v_elapsed >= v_limits.max_seconds OR (
      v_attempts >= v_limits.max_attempts AND NOT EXISTS (
        SELECT 1 FROM sdd.correction_attempts a WHERE a.failure_id = v_failure.failure_id
          AND a.state = 'IN_PROGRESS'
      )
    ) THEN
      PERFORM sdd.pause_for_limit(p_batch_id, v_failure.spec_id,
        format('correction limit reached for failure %s (attempts=%s/%s, elapsed_seconds=%s/%s)',
          v_failure.failure_id, v_attempts, v_limits.max_attempts, v_elapsed, v_limits.max_seconds),
        p_owner_id);
      RETURN jsonb_build_object('must_stop', true, 'state', 'PAUSED',
        'spec_id', v_failure.spec_id, 'failure_id', v_failure.failure_id,
        'attempts', v_attempts, 'max_attempts', v_limits.max_attempts,
        'elapsed_seconds', v_elapsed, 'max_seconds', v_limits.max_seconds);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('must_stop', false, 'state', 'RUNNING',
    'heartbeat_at', clock_timestamp(), 'lease_expires_at', clock_timestamp() + interval '15 minutes');
END;
$$;

CREATE FUNCTION public.sdd_start_next_spec(
  p_batch_id uuid,
  p_lease_token uuid,
  p_owner_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_item sdd.batch_specs%ROWTYPE;
  v_version sdd.spec_versions%ROWTYPE;
  v_run_id uuid;
  v_run_number integer;
BEGIN
  PERFORM 1 FROM sdd.batches WHERE batch_id = p_batch_id AND state = 'RUNNING' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM sdd.execution_leases
    WHERE batch_id = p_batch_id AND lease_token = p_lease_token
      AND owner_id = p_owner_id AND expires_at > clock_timestamp()
  ) THEN RAISE EXCEPTION 'Active batch lease required'; END IF;
  IF EXISTS (SELECT 1 FROM sdd.runs WHERE batch_id = p_batch_id AND ended_at IS NULL) THEN
    SELECT * INTO v_item FROM sdd.batch_specs
    WHERE batch_id = p_batch_id AND state = 'RUNNING'
    ORDER BY position LIMIT 1;
    IF v_item.batch_id IS NULL THEN RAISE EXCEPTION 'Active run has no matching batch SPEC'; END IF;
    SELECT * INTO v_version FROM sdd.spec_versions WHERE spec_version_id = v_item.spec_version_id;
    SELECT r.run_id,r.run_number INTO v_run_id,v_run_number FROM sdd.runs AS r
    WHERE r.batch_id = p_batch_id AND r.spec_id = v_item.spec_id AND r.ended_at IS NULL
    ORDER BY r.run_number DESC LIMIT 1;
    RETURN jsonb_build_object('complete',false,'resumed',true,'batch_id',p_batch_id,
      'run_id',v_run_id,'spec_id',v_item.spec_id,'version',v_version.version,
      'content_hash',v_version.content_hash,'source_paths',to_jsonb(v_version.source_paths),
      'dependencies',to_jsonb(v_version.dependencies),'snapshot',v_version.snapshot,
      'state',(SELECT state FROM sdd.runs WHERE run_id=v_run_id));
  END IF;

  SELECT * INTO v_item FROM sdd.batch_specs
  WHERE batch_id = p_batch_id AND state = 'QUEUED'
  ORDER BY position LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('complete', true, 'batch_id', p_batch_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM sdd.batch_specs AS prior
    WHERE prior.batch_id = p_batch_id AND prior.position < v_item.position AND prior.state <> 'COMPLETED'
  ) THEN RAISE EXCEPTION 'Previous SPEC has not passed all quality gates'; END IF;

  SELECT * INTO v_version FROM sdd.spec_versions WHERE spec_version_id = v_item.spec_version_id;
  SELECT COALESCE(MAX(run_number), 0) + 1 INTO v_run_number
  FROM sdd.runs WHERE batch_id = p_batch_id AND spec_id = v_item.spec_id;
  INSERT INTO sdd.runs (batch_id, spec_id, spec_version_id, run_number, state, started_by)
  VALUES (p_batch_id, v_item.spec_id, v_item.spec_version_id, v_run_number, 'PLANNING', p_owner_id)
  RETURNING run_id INTO v_run_id;
  UPDATE sdd.batch_specs SET state = 'RUNNING' WHERE batch_id = p_batch_id AND spec_id = v_item.spec_id;
  UPDATE sdd.batches SET current_spec_id = v_item.spec_id, state_version = state_version + 1,
    updated_at = clock_timestamp() WHERE batch_id = p_batch_id;
  UPDATE sdd.specifications SET state = 'PLANNING', updated_at = clock_timestamp()
  WHERE spec_id = v_item.spec_id;
  PERFORM sdd.write_event(p_batch_id, v_item.spec_id, v_run_id, 'ORCHESTRATOR', p_owner_id,
    'SPEC_RUN_STARTED', 'QUEUED', 'PLANNING', jsonb_build_object('version', v_version.version));

  RETURN jsonb_build_object('complete', false, 'batch_id', p_batch_id,
    'run_id', v_run_id, 'spec_id', v_item.spec_id, 'version', v_version.version,
    'content_hash', v_version.content_hash, 'source_paths', to_jsonb(v_version.source_paths),
    'dependencies', to_jsonb(v_version.dependencies), 'snapshot', v_version.snapshot,
    'state', 'PLANNING');
END;
$$;

CREATE FUNCTION public.sdd_record_task(
  p_run_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_task_key text,
  p_description text,
  p_state text,
  p_agent_profile text,
  p_agent_ref text,
  p_file_scope text[],
  p_evidence jsonb,
  p_actor_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_task sdd.tasks%ROWTYPE;
  v_batch_id uuid;
  v_spec_id text;
  v_id uuid;
BEGIN
  IF p_state NOT IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid task state';
  END IF;
  IF sdd.has_sensitive_key(COALESCE(p_evidence, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Task evidence cannot contain credential or transcript fields';
  END IF;
  SELECT batch_id, spec_id INTO v_batch_id, v_spec_id FROM sdd.runs
  WHERE run_id = p_run_id AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active SPEC run required'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id,p_lease_token,p_owner_id,v_spec_id);

  SELECT * INTO v_task FROM sdd.tasks WHERE run_id = p_run_id AND task_key = p_task_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO sdd.tasks (run_id, task_key, description, state, agent_profile, agent_ref,
      file_scope, started_at, ended_at, evidence)
    VALUES (p_run_id, p_task_key, p_description, p_state, p_agent_profile, p_agent_ref,
      COALESCE(p_file_scope, '{}'), CASE WHEN p_state = 'RUNNING' THEN clock_timestamp() END,
      CASE WHEN p_state IN ('COMPLETED','FAILED','BLOCKED','CANCELLED') THEN clock_timestamp() END,
      COALESCE(p_evidence, '{}'::jsonb))
    RETURNING task_id INTO v_id;
    PERFORM sdd.write_event(v_batch_id, v_spec_id, p_run_id, 'ORCHESTRATOR', p_actor_id,
      'TASK_CREATED', NULL, p_state, jsonb_build_object('task_key', p_task_key, 'agent_profile', p_agent_profile));
    IF p_state = 'RUNNING' THEN
      UPDATE sdd.runs SET state = 'IMPLEMENTING' WHERE run_id = p_run_id;
      UPDATE sdd.specifications SET state = 'IMPLEMENTING', updated_at = clock_timestamp()
      WHERE spec_id = v_spec_id;
    END IF;
    RETURN v_id;
  END IF;

  IF v_task.state IN ('COMPLETED','FAILED','BLOCKED','CANCELLED') AND p_state <> v_task.state THEN
    RAISE EXCEPTION 'Terminal task state cannot be changed';
  END IF;
  IF v_task.state = 'RUNNING' AND p_state = 'PENDING' THEN
    RAISE EXCEPTION 'A started task cannot return to PENDING';
  END IF;
  UPDATE sdd.tasks SET description = p_description, state = p_state,
    agent_profile = p_agent_profile, agent_ref = p_agent_ref,
    file_scope = COALESCE(p_file_scope, '{}'),
    started_at = COALESCE(started_at, CASE WHEN p_state = 'RUNNING' THEN clock_timestamp() END),
    ended_at = CASE WHEN p_state IN ('COMPLETED','FAILED','BLOCKED','CANCELLED')
      THEN COALESCE(ended_at, clock_timestamp()) ELSE NULL END,
    evidence = COALESCE(p_evidence, evidence), updated_at = clock_timestamp()
  WHERE task_id = v_task.task_id;
  IF v_task.state <> p_state THEN
    PERFORM sdd.write_event(v_batch_id, v_spec_id, p_run_id, 'AGENT', COALESCE(p_agent_ref,p_actor_id),
      'TASK_STATE_CHANGED', v_task.state, p_state, jsonb_build_object('task_key', p_task_key));
  END IF;
  IF p_state = 'RUNNING' THEN
    UPDATE sdd.runs SET state = 'IMPLEMENTING' WHERE run_id = p_run_id;
    UPDATE sdd.specifications SET state = 'IMPLEMENTING', updated_at = clock_timestamp()
    WHERE spec_id = v_spec_id;
  END IF;
  RETURN v_task.task_id;
END;
$$;

CREATE FUNCTION public.sdd_record_gate(
  p_run_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_gate_key text,
  p_required boolean,
  p_state text,
  p_command text,
  p_exit_code integer,
  p_evidence jsonb,
  p_recorded_by text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_gate sdd.quality_gates%ROWTYPE;
  v_batch_id uuid;
  v_spec_id text;
  v_gate_id uuid;
BEGIN
  IF p_state NOT IN ('PENDING','RUNNING','PASSED','FAILED','SKIPPED') THEN RAISE EXCEPTION 'Invalid gate state'; END IF;
  IF p_state = 'PASSED' AND p_exit_code IS NOT NULL AND p_exit_code <> 0 THEN RAISE EXCEPTION 'A passed command must exit with code 0'; END IF;
  IF p_state = 'PASSED' AND COALESCE(p_required,true) AND p_exit_code IS NULL THEN
    RAISE EXCEPTION 'A required passed gate must include the executed command exit code';
  END IF;
  IF p_state = 'FAILED' AND p_exit_code = 0 THEN RAISE EXCEPTION 'A failed command cannot exit with code 0'; END IF;
  IF sdd.has_sensitive_key(COALESCE(p_evidence,'{}'::jsonb)) THEN
    RAISE EXCEPTION 'Gate evidence cannot contain credential or transcript fields';
  END IF;
  SELECT batch_id, spec_id INTO v_batch_id, v_spec_id FROM sdd.runs
  WHERE run_id = p_run_id AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active run required'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id,p_lease_token,p_owner_id,v_spec_id);
  SELECT * INTO v_gate FROM sdd.quality_gates WHERE run_id = p_run_id AND gate_key = p_gate_key FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO sdd.quality_gates (run_id, gate_key, required, state, command, exit_code,
      started_at, ended_at, evidence, recorded_by)
    VALUES (p_run_id, p_gate_key, COALESCE(p_required,true), p_state, p_command, p_exit_code,
      CASE WHEN p_state <> 'PENDING' THEN clock_timestamp() END,
      CASE WHEN p_state IN ('PASSED','FAILED','SKIPPED') THEN clock_timestamp() END,
      COALESCE(p_evidence,'{}'::jsonb), p_recorded_by)
    RETURNING gate_id INTO v_gate_id;
  ELSE
    UPDATE sdd.quality_gates SET required = COALESCE(p_required,required), state = p_state,
      command = p_command, exit_code = p_exit_code,
      started_at = COALESCE(started_at, CASE WHEN p_state <> 'PENDING' THEN clock_timestamp() END),
      ended_at = CASE WHEN p_state IN ('PASSED','FAILED','SKIPPED') THEN clock_timestamp() ELSE NULL END,
      evidence = COALESCE(p_evidence,'{}'::jsonb), recorded_by = p_recorded_by,
      updated_at = clock_timestamp()
    WHERE gate_id = v_gate.gate_id RETURNING gate_id INTO v_gate_id;
  END IF;
  PERFORM sdd.write_event(v_batch_id, v_spec_id, p_run_id, 'AGENT', p_recorded_by,
    'QUALITY_GATE_RECORDED', v_gate.state, p_state,
    jsonb_build_object('gate_key', p_gate_key, 'exit_code', p_exit_code));
  IF p_state IN ('RUNNING','PASSED','FAILED') THEN
    UPDATE sdd.runs SET state = CASE WHEN p_state = 'RUNNING' THEN 'TESTING' ELSE 'VALIDATING' END
    WHERE run_id = p_run_id AND ended_at IS NULL;
    UPDATE sdd.specifications SET state = CASE WHEN p_state = 'RUNNING' THEN 'TESTING' ELSE 'VALIDATING' END,
      updated_at = clock_timestamp() WHERE spec_id = v_spec_id;
  END IF;
  RETURN v_gate_id;
END;
$$;

CREATE FUNCTION public.sdd_save_checkpoint(
  p_run_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_sequence bigint,
  p_payload jsonb,
  p_created_by text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd, extensions
AS $$
DECLARE
  v_batch_id uuid;
  v_spec_id text;
  v_id uuid;
BEGIN
  IF sdd.has_sensitive_key(p_payload) THEN
    RAISE EXCEPTION 'Checkpoint contains a prohibited credential, token, or transcript field';
  END IF;
  SELECT batch_id, spec_id INTO v_batch_id, v_spec_id FROM sdd.runs
  WHERE run_id = p_run_id AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id,p_lease_token,p_owner_id,v_spec_id);
  INSERT INTO sdd.checkpoints (run_id, sequence, payload, content_hash, created_by)
  VALUES (p_run_id, p_sequence, p_payload,
    encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex'), p_created_by)
  ON CONFLICT (run_id, sequence) DO NOTHING RETURNING checkpoint_id INTO v_id;
  IF v_id IS NULL THEN
    SELECT checkpoint_id INTO v_id FROM sdd.checkpoints
    WHERE run_id = p_run_id AND sequence = p_sequence
      AND content_hash = encode(extensions.digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
    IF v_id IS NULL THEN RAISE EXCEPTION 'Checkpoint sequence already exists with different content'; END IF;
  END IF;
  PERFORM sdd.write_event(v_batch_id, v_spec_id, p_run_id, 'ORCHESTRATOR', p_created_by,
    'CHECKPOINT_SAVED', NULL, NULL, jsonb_build_object('sequence',p_sequence,'checkpoint_id',v_id));
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.sdd_open_failure(
  p_run_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_task_id uuid,
  p_fingerprint text,
  p_summary text,
  p_root_cause text,
  p_actor_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch_id uuid;
  v_spec_id text;
  v_failure_id uuid;
BEGIN
  SELECT batch_id, spec_id INTO v_batch_id, v_spec_id FROM sdd.runs
  WHERE run_id = p_run_id AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id,p_lease_token,p_owner_id,v_spec_id);
  INSERT INTO sdd.failures (run_id, task_id, fingerprint, summary, root_cause)
  VALUES (p_run_id, p_task_id, p_fingerprint, p_summary, p_root_cause)
  ON CONFLICT (run_id, fingerprint) WHERE state = 'OPEN' DO UPDATE SET summary = EXCLUDED.summary,
    root_cause = COALESCE(EXCLUDED.root_cause,sdd.failures.root_cause)
  RETURNING failure_id INTO v_failure_id;
  PERFORM sdd.write_event(v_batch_id, v_spec_id, p_run_id, 'ORCHESTRATOR', p_actor_id,
    'FAILURE_OPENED', NULL, 'OPEN', jsonb_build_object('failure_id',v_failure_id,'fingerprint',p_fingerprint));
  RETURN v_failure_id;
END;
$$;

CREATE FUNCTION public.sdd_begin_correction(
  p_failure_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_diagnosis text,
  p_started_by text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_failure sdd.failures%ROWTYPE;
  v_run sdd.runs%ROWTYPE;
  v_limits record;
  v_attempt_number integer;
  v_elapsed bigint;
  v_attempt_id uuid;
  v_attempt sdd.correction_attempts%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM sdd.correction_attempts WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO v_failure FROM sdd.failures WHERE failure_id = v_attempt.failure_id;
    IF v_attempt.failure_id <> p_failure_id OR v_attempt.diagnosis <> p_diagnosis
       OR v_attempt.started_by <> p_started_by THEN
      RAISE EXCEPTION 'Idempotency key was reused with different correction data';
    END IF;
    SELECT * INTO v_run FROM sdd.runs WHERE run_id = v_failure.run_id;
    PERFORM sdd.require_active_lease(v_run.batch_id,p_lease_token,p_owner_id,v_run.spec_id);
    SELECT * INTO v_limits FROM sdd.effective_limits(v_run.batch_id,v_run.spec_id);
    RETURN jsonb_build_object('blocked',false,'correction_attempt_id',v_attempt.correction_attempt_id,
      'attempt_number',v_attempt.attempt_number,'max_attempts',v_limits.max_attempts,
      'elapsed_seconds',sdd.fix_elapsed_seconds(v_run.batch_id,v_run.spec_id),
      'max_seconds',v_limits.max_seconds,'idempotent_replay',true);
  END IF;

  SELECT * INTO v_failure FROM sdd.failures WHERE failure_id = p_failure_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Failure not found'; END IF;
  SELECT * INTO v_run FROM sdd.runs WHERE run_id = v_failure.run_id;
  IF v_run.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Active correction run required'; END IF;
  PERFORM sdd.require_active_lease(v_run.batch_id,p_lease_token,p_owner_id,v_run.spec_id);
  SELECT * INTO v_failure FROM sdd.failures WHERE failure_id = p_failure_id FOR UPDATE;
  IF NOT FOUND OR v_failure.state <> 'OPEN' THEN RAISE EXCEPTION 'Open failure required'; END IF;
  SELECT * INTO v_limits FROM sdd.effective_limits(v_run.batch_id, v_run.spec_id);
  SELECT COUNT(*)::integer + 1 INTO v_attempt_number FROM sdd.correction_attempts WHERE failure_id = p_failure_id;
  v_elapsed := sdd.fix_elapsed_seconds(v_run.batch_id, v_run.spec_id);
  IF v_attempt_number > v_limits.max_attempts OR v_elapsed >= v_limits.max_seconds THEN
    PERFORM sdd.pause_for_limit(v_run.batch_id, v_run.spec_id,
      format('correction limit reached for failure %s (attempts=%s/%s, elapsed_seconds=%s/%s)',
        p_failure_id, v_attempt_number - 1, v_limits.max_attempts, v_elapsed, v_limits.max_seconds),
      p_started_by);
    RETURN jsonb_build_object('blocked',true,'state','PAUSED','failure_id',p_failure_id,
      'attempts',v_attempt_number - 1,'max_attempts',v_limits.max_attempts,
      'elapsed_seconds',v_elapsed,'max_seconds',v_limits.max_seconds);
  END IF;

  INSERT INTO sdd.correction_attempts (failure_id, attempt_number, diagnosis, started_by, idempotency_key)
  VALUES (p_failure_id, v_attempt_number, p_diagnosis, p_started_by, p_idempotency_key)
  RETURNING correction_attempt_id INTO v_attempt_id;
  UPDATE sdd.runs SET state = 'FIXING' WHERE run_id = v_run.run_id;
  UPDATE sdd.specifications SET state = 'FIXING', updated_at = clock_timestamp() WHERE spec_id = v_run.spec_id;
  PERFORM sdd.write_event(v_run.batch_id, v_run.spec_id, v_run.run_id, 'ORCHESTRATOR', p_started_by,
    'CORRECTION_STARTED', NULL, 'FIXING', jsonb_build_object(
      'failure_id',p_failure_id,'attempt',v_attempt_number,'max_attempts',v_limits.max_attempts,
      'elapsed_seconds',v_elapsed,'max_seconds',v_limits.max_seconds));
  RETURN jsonb_build_object('blocked',false,'correction_attempt_id',v_attempt_id,
    'attempt_number',v_attempt_number,'max_attempts',v_limits.max_attempts,
    'elapsed_seconds',v_elapsed,'max_seconds',v_limits.max_seconds);
END;
$$;

CREATE FUNCTION public.sdd_open_fix_window(
  p_correction_attempt_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_agent_id text,
  p_agent_ref text,
  p_idempotency_key uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_id uuid;
  v_batch_id uuid;
  v_spec_id text;
BEGIN
  SELECT r.batch_id,r.spec_id INTO v_batch_id,v_spec_id FROM sdd.correction_attempts a
  JOIN sdd.failures f USING (failure_id) JOIN sdd.runs r USING (run_id)
  WHERE a.correction_attempt_id = p_correction_attempt_id
    AND a.state = 'IN_PROGRESS' AND r.ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Correction attempt not found'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id,p_lease_token,p_owner_id,v_spec_id);
  SELECT fix_window_id INTO v_id FROM sdd.fix_windows
  WHERE idempotency_key = p_idempotency_key
    AND correction_attempt_id = p_correction_attempt_id
    AND agent_id = p_agent_id
    AND agent_ref IS NOT DISTINCT FROM p_agent_ref;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  IF EXISTS (SELECT 1 FROM sdd.fix_windows WHERE idempotency_key = p_idempotency_key) THEN
    RAISE EXCEPTION 'Idempotency key was reused with different fix window data';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sdd.correction_attempts
    WHERE correction_attempt_id = p_correction_attempt_id AND state = 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Active correction attempt required';
  END IF;
  INSERT INTO sdd.fix_windows (correction_attempt_id, agent_id, agent_ref, idempotency_key)
  VALUES (p_correction_attempt_id, p_agent_id, p_agent_ref, p_idempotency_key)
  RETURNING fix_window_id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.sdd_close_fix_window(
  p_fix_window_id uuid,
  p_lease_token uuid,
  p_owner_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_window sdd.fix_windows%ROWTYPE;
  v_run sdd.runs%ROWTYPE;
  v_batch_id uuid;
  v_spec_id text;
  v_close_at timestamptz;
  v_worker_seconds bigint;
BEGIN
  SELECT r.batch_id,r.spec_id INTO v_batch_id,v_spec_id FROM sdd.fix_windows w
  JOIN sdd.correction_attempts a USING (correction_attempt_id)
  JOIN sdd.failures f USING (failure_id) JOIN sdd.runs r USING (run_id)
  WHERE w.fix_window_id = p_fix_window_id
    AND a.state = 'IN_PROGRESS' AND r.ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fix window not found'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id,p_lease_token,p_owner_id,v_spec_id);
  SELECT * INTO v_window FROM sdd.fix_windows WHERE fix_window_id = p_fix_window_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fix window not found'; END IF;
  IF v_window.ended_at IS NULL THEN
    v_close_at := clock_timestamp();
    v_worker_seconds := CEIL(EXTRACT(EPOCH FROM v_close_at - v_window.started_at))::bigint;
    UPDATE sdd.fix_windows SET ended_at = v_close_at, worker_seconds = v_worker_seconds
    WHERE fix_window_id = p_fix_window_id RETURNING * INTO v_window;
  END IF;
  SELECT r.* INTO v_run FROM sdd.runs AS r
  JOIN sdd.failures AS f USING (run_id)
  JOIN sdd.correction_attempts AS a USING (failure_id)
  WHERE a.correction_attempt_id = v_window.correction_attempt_id;
  RETURN jsonb_build_object('fix_window_id',p_fix_window_id,
    'elapsed_seconds',ceil(extract(epoch FROM v_window.ended_at-v_window.started_at))::bigint,
    'worker_seconds',v_window.worker_seconds,
    'spec_elapsed_seconds',sdd.fix_elapsed_seconds(v_run.batch_id,v_run.spec_id),
    'spec_worker_seconds',sdd.worker_seconds(v_run.batch_id,v_run.spec_id));
END;
$$;

CREATE FUNCTION public.sdd_finish_correction(
  p_correction_attempt_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_outcome text,
  p_evidence jsonb,
  p_finished_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_attempt sdd.correction_attempts%ROWTYPE;
  v_failure sdd.failures%ROWTYPE;
  v_run sdd.runs%ROWTYPE;
  v_limits record;
  v_count bigint;
  v_elapsed bigint;
  v_blocked boolean := false;
BEGIN
  IF p_outcome NOT IN ('RESOLVED','UNRESOLVED') THEN RAISE EXCEPTION 'Outcome must be RESOLVED or UNRESOLVED'; END IF;
  SELECT * INTO v_attempt FROM sdd.correction_attempts
  WHERE correction_attempt_id = p_correction_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Correction attempt not found'; END IF;
  SELECT * INTO v_failure FROM sdd.failures WHERE failure_id = v_attempt.failure_id;
  SELECT * INTO v_run FROM sdd.runs WHERE run_id = v_failure.run_id;
  IF v_run.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Active correction run required'; END IF;
  PERFORM sdd.require_active_lease(v_run.batch_id,p_lease_token,p_owner_id,v_run.spec_id);
  SELECT * INTO v_attempt FROM sdd.correction_attempts
  WHERE correction_attempt_id = p_correction_attempt_id FOR UPDATE;
  IF v_attempt.state <> 'IN_PROGRESS' THEN
    IF (v_attempt.state = 'RESOLVED' AND p_outcome = 'RESOLVED')
       OR (v_attempt.state = 'UNRESOLVED' AND p_outcome = 'UNRESOLVED') THEN
      SELECT * INTO v_failure FROM sdd.failures WHERE failure_id = v_attempt.failure_id;
      SELECT * INTO v_run FROM sdd.runs WHERE run_id = v_failure.run_id;
      SELECT * INTO v_limits FROM sdd.effective_limits(v_run.batch_id,v_run.spec_id);
      SELECT COUNT(*) INTO v_count FROM sdd.correction_attempts WHERE failure_id = v_failure.failure_id;
      RETURN jsonb_build_object('outcome',p_outcome,'blocked',v_run.state = 'BLOCKED',
        'state',CASE WHEN v_run.state = 'BLOCKED' THEN 'PAUSED' ELSE 'RUNNING' END,
        'attempts',v_count,'max_attempts',v_limits.max_attempts,
        'elapsed_seconds',sdd.fix_elapsed_seconds(v_run.batch_id,v_run.spec_id),
        'worker_seconds',sdd.worker_seconds(v_run.batch_id,v_run.spec_id),
        'max_seconds',v_limits.max_seconds,'idempotent_replay',true);
    END IF;
    RAISE EXCEPTION 'Correction attempt already ended with a different outcome';
  END IF;
  IF EXISTS (SELECT 1 FROM sdd.fix_windows WHERE correction_attempt_id = p_correction_attempt_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'All parallel agent windows must be closed before finalizing the correction';
  END IF;

  SELECT * INTO v_failure FROM sdd.failures WHERE failure_id = v_attempt.failure_id FOR UPDATE;
  SELECT * INTO v_run FROM sdd.runs WHERE run_id = v_failure.run_id;
  SELECT * INTO v_limits FROM sdd.effective_limits(v_run.batch_id,v_run.spec_id);
  UPDATE sdd.correction_attempts SET state = CASE WHEN p_outcome = 'RESOLVED' THEN 'RESOLVED' ELSE 'UNRESOLVED' END,
    ended_at = clock_timestamp(), evidence = COALESCE(p_evidence,'{}'::jsonb)
  WHERE correction_attempt_id = p_correction_attempt_id;
  IF p_outcome = 'RESOLVED' THEN
    UPDATE sdd.failures SET state = 'RESOLVED', resolved_at = clock_timestamp(),
      resolution_evidence = COALESCE(p_evidence,'{}'::jsonb) WHERE failure_id = v_failure.failure_id;
    UPDATE sdd.runs SET state = 'TESTING' WHERE run_id = v_run.run_id;
    UPDATE sdd.specifications SET state = 'TESTING', updated_at = clock_timestamp() WHERE spec_id = v_run.spec_id;
  ELSE
    SELECT COUNT(*)::integer INTO v_count FROM sdd.correction_attempts WHERE failure_id = v_failure.failure_id;
    v_elapsed := sdd.fix_elapsed_seconds(v_run.batch_id,v_run.spec_id);
    v_blocked := v_count >= v_limits.max_attempts OR v_elapsed >= v_limits.max_seconds;
    UPDATE sdd.runs SET state = CASE WHEN v_blocked THEN 'BLOCKED' ELSE 'TESTING' END,
      ended_at = CASE WHEN v_blocked THEN clock_timestamp() ELSE NULL END WHERE run_id = v_run.run_id;
    IF v_blocked THEN
      UPDATE sdd.failures SET state = 'BLOCKED' WHERE failure_id = v_failure.failure_id;
      PERFORM sdd.pause_for_limit(v_run.batch_id,v_run.spec_id,
        format('unresolved after correction (attempts=%s/%s, elapsed_seconds=%s/%s)',
          v_count,v_limits.max_attempts,v_elapsed,v_limits.max_seconds),p_finished_by);
    ELSE
      UPDATE sdd.specifications SET state = 'TESTING', updated_at = clock_timestamp() WHERE spec_id = v_run.spec_id;
    END IF;
  END IF;

  PERFORM sdd.write_event(v_run.batch_id,v_run.spec_id,v_run.run_id,'ORCHESTRATOR',p_finished_by,
    'CORRECTION_FINISHED','FIXING',CASE WHEN p_outcome='RESOLVED' THEN 'TESTING' ELSE 'FIXING' END,
    jsonb_build_object('outcome',p_outcome,'blocked',v_blocked,
      'elapsed_seconds',sdd.fix_elapsed_seconds(v_run.batch_id,v_run.spec_id),
      'worker_seconds',sdd.worker_seconds(v_run.batch_id,v_run.spec_id)));
  RETURN jsonb_build_object('outcome',p_outcome,'blocked',v_blocked,
    'state',CASE WHEN v_blocked THEN 'PAUSED' ELSE 'RUNNING' END,
    'attempts',COALESCE(v_count,v_attempt.attempt_number),'max_attempts',v_limits.max_attempts,
    'elapsed_seconds',sdd.fix_elapsed_seconds(v_run.batch_id,v_run.spec_id),
    'worker_seconds',sdd.worker_seconds(v_run.batch_id,v_run.spec_id),
    'max_seconds',v_limits.max_seconds);
END;
$$;

CREATE FUNCTION public.sdd_complete_spec(
  p_run_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_summary text,
  p_completed_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_run sdd.runs%ROWTYPE;
  v_item sdd.batch_specs%ROWTYPE;
  v_remaining integer;
BEGIN
  SELECT * INTO v_run FROM sdd.runs WHERE run_id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Run not found'; END IF;
  PERFORM 1 FROM sdd.batches WHERE batch_id = v_run.batch_id FOR UPDATE;
  SELECT * INTO v_run FROM sdd.runs WHERE run_id = p_run_id FOR UPDATE;
  IF v_run.state = 'COMPLETED' AND v_run.summary IS NOT DISTINCT FROM p_summary THEN
    RETURN jsonb_build_object('batch_id',v_run.batch_id,'spec_id',v_run.spec_id,
      'state',(SELECT state FROM sdd.batches WHERE batch_id=v_run.batch_id),
      'remaining_specs',(SELECT COUNT(*) FROM sdd.batch_specs
        WHERE batch_id=v_run.batch_id AND state='QUEUED'),'idempotent_replay',true);
  END IF;
  PERFORM sdd.require_active_lease(v_run.batch_id,p_lease_token,p_owner_id,v_run.spec_id);
  IF v_run.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Active SPEC run required'; END IF;
  IF v_run.state <> 'VALIDATING' THEN RAISE EXCEPTION 'SPEC must pass through VALIDATING before completion'; END IF;
  IF EXISTS (SELECT 1 FROM sdd.tasks WHERE run_id = p_run_id AND state NOT IN ('COMPLETED','CANCELLED')) THEN
    RAISE EXCEPTION 'Every executable task must be completed before the SPEC passes';
  END IF;
  IF EXISTS (SELECT 1 FROM sdd.failures WHERE run_id = p_run_id AND state <> 'RESOLVED') THEN
    RAISE EXCEPTION 'Open or blocked failure prevents SPEC completion';
  END IF;
  IF EXISTS (SELECT 1 FROM sdd.quality_gates WHERE run_id = p_run_id AND required AND state <> 'PASSED') THEN
    RAISE EXCEPTION 'Every required quality gate must pass';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sdd.quality_gates WHERE run_id = p_run_id AND required) THEN
    RAISE EXCEPTION 'At least one required quality gate must be recorded';
  END IF;

  UPDATE sdd.runs SET state = 'COMPLETED', ended_at = clock_timestamp(), summary = p_summary
  WHERE run_id = p_run_id;
  UPDATE sdd.batch_specs SET state = 'COMPLETED'
  WHERE batch_id = v_run.batch_id AND spec_id = v_run.spec_id RETURNING * INTO v_item;
  UPDATE sdd.specifications SET state = 'COMPLETED', updated_at = clock_timestamp()
  WHERE spec_id = v_run.spec_id;
  SELECT COUNT(*)::integer INTO v_remaining FROM sdd.batch_specs
  WHERE batch_id = v_run.batch_id AND state = 'QUEUED';
  IF v_remaining = 0 THEN
    UPDATE sdd.batches SET state = 'COMPLETED', current_spec_id = NULL,
      completed_at = clock_timestamp(), state_version = state_version + 1,
      updated_at = clock_timestamp() WHERE batch_id = v_run.batch_id;
    DELETE FROM sdd.execution_leases WHERE batch_id = v_run.batch_id;
  ELSE
    UPDATE sdd.batches SET current_spec_id = NULL, state_version = state_version + 1,
      updated_at = clock_timestamp() WHERE batch_id = v_run.batch_id;
  END IF;
  PERFORM sdd.write_event(v_run.batch_id,v_run.spec_id,p_run_id,'ORCHESTRATOR',p_completed_by,
    'SPEC_COMPLETED',v_run.state,'COMPLETED',jsonb_build_object('summary',p_summary,'remaining_specs',v_remaining));
  RETURN jsonb_build_object('batch_id',v_run.batch_id,'spec_id',v_run.spec_id,
    'state',CASE WHEN v_remaining = 0 THEN 'COMPLETED' ELSE 'RUNNING' END,
    'remaining_specs',v_remaining);
END;
$$;

CREATE FUNCTION public.sdd_pause_batch(
  p_batch_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE v_state text;
BEGIN
  SELECT state INTO v_state FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF v_state = 'PAUSED' THEN
    RETURN jsonb_build_object('batch_id',p_batch_id,'state','PAUSED');
  END IF;
  IF v_state <> 'RUNNING' OR NOT EXISTS (
    SELECT 1 FROM sdd.execution_leases WHERE batch_id = p_batch_id AND lease_token = p_lease_token
      AND owner_id = p_owner_id AND expires_at > clock_timestamp()
  ) THEN RAISE EXCEPTION 'Active batch lease required'; END IF;
  UPDATE sdd.fix_windows w SET ended_at = clock_timestamp(),
    worker_seconds = GREATEST(w.worker_seconds,CEIL(EXTRACT(EPOCH FROM clock_timestamp()-w.started_at))::bigint)
  FROM sdd.correction_attempts a
  JOIN sdd.failures f USING (failure_id)
  JOIN sdd.runs r USING (run_id)
  WHERE w.correction_attempt_id = a.correction_attempt_id
    AND r.batch_id = p_batch_id AND w.ended_at IS NULL;
  UPDATE sdd.correction_attempts a SET state = 'INTERRUPTED', ended_at = clock_timestamp()
  FROM sdd.failures f JOIN sdd.runs r USING (run_id)
  WHERE a.failure_id = f.failure_id AND r.run_id = f.run_id
    AND r.batch_id = p_batch_id AND a.state = 'IN_PROGRESS';
  UPDATE sdd.batches SET state = 'PAUSED', paused_at = clock_timestamp(), pause_reason = p_reason,
    state_version = state_version + 1, updated_at = clock_timestamp() WHERE batch_id = p_batch_id;
  UPDATE sdd.runs SET state = 'PAUSED', ended_at = clock_timestamp()
  WHERE batch_id = p_batch_id AND ended_at IS NULL;
  DELETE FROM sdd.execution_leases WHERE batch_id = p_batch_id;
  PERFORM sdd.write_event(p_batch_id,NULL,NULL,'ORCHESTRATOR',p_owner_id,
    'BATCH_PAUSED','RUNNING','PAUSED',jsonb_build_object('reason',p_reason));
  RETURN jsonb_build_object('batch_id',p_batch_id,'state','PAUSED','reason',p_reason);
END;
$$;

CREATE FUNCTION public.sdd_recover_interrupted(
  p_batch_id uuid,
  p_recovered_by text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_failure record;
  v_limits record;
  v_attempts integer;
  v_elapsed bigint;
  v_blocked_spec text;
  v_lease_expires_at timestamptz;
  v_recovery_at timestamptz := clock_timestamp();
  v_window_end timestamptz;
BEGIN
  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.state <> 'RUNNING' THEN RAISE EXCEPTION 'Only a running batch can be recovered'; END IF;
  SELECT expires_at INTO v_lease_expires_at FROM sdd.execution_leases
    WHERE batch_id = p_batch_id FOR UPDATE;
  IF FOUND AND v_lease_expires_at > v_recovery_at THEN
    RAISE EXCEPTION 'Batch still has a live lease';
  END IF;
  v_window_end := LEAST(v_recovery_at,COALESCE(v_lease_expires_at,v_recovery_at));

  UPDATE sdd.fix_windows w SET ended_at = clock_timestamp(),
    worker_seconds = GREATEST(w.worker_seconds,CEIL(EXTRACT(EPOCH FROM v_window_end-w.started_at))::bigint)
  FROM sdd.correction_attempts a JOIN sdd.failures f USING (failure_id)
  JOIN sdd.runs r USING (run_id)
  WHERE w.correction_attempt_id = a.correction_attempt_id AND r.batch_id = p_batch_id AND w.ended_at IS NULL;
  UPDATE sdd.correction_attempts a SET state = 'INTERRUPTED', ended_at = clock_timestamp()
  FROM sdd.failures f JOIN sdd.runs r USING (run_id)
  WHERE a.failure_id = f.failure_id AND f.run_id = r.run_id
    AND r.batch_id = p_batch_id AND a.state = 'IN_PROGRESS';

  FOR v_failure IN
    SELECT DISTINCT f.failure_id, r.spec_id
    FROM sdd.failures f JOIN sdd.runs r USING (run_id)
    WHERE r.batch_id = p_batch_id AND f.state = 'OPEN'
  LOOP
    SELECT * INTO v_limits FROM sdd.effective_limits(p_batch_id,v_failure.spec_id);
    SELECT COUNT(*)::integer INTO v_attempts FROM sdd.correction_attempts WHERE failure_id = v_failure.failure_id;
    v_elapsed := sdd.fix_elapsed_seconds(p_batch_id,v_failure.spec_id);
    IF v_attempts >= v_limits.max_attempts OR v_elapsed >= v_limits.max_seconds THEN
      v_blocked_spec := v_failure.spec_id;
      PERFORM sdd.pause_for_limit(p_batch_id,v_failure.spec_id,
        format('execution interrupted at correction limit (attempts=%s/%s, elapsed_seconds=%s/%s)',
          v_attempts,v_limits.max_attempts,v_elapsed,v_limits.max_seconds),p_recovered_by);
      EXIT;
    END IF;
  END LOOP;

  IF v_blocked_spec IS NULL THEN
    UPDATE sdd.batches SET state = 'PAUSED', paused_at = clock_timestamp(),
      pause_reason = 'Codex session or runner interrupted; explicit user resume required',
      state_version = state_version + 1, updated_at = clock_timestamp() WHERE batch_id = p_batch_id;
    UPDATE sdd.runs SET state = 'PAUSED', ended_at = clock_timestamp()
      WHERE batch_id = p_batch_id AND ended_at IS NULL;
    DELETE FROM sdd.execution_leases WHERE batch_id = p_batch_id;
  END IF;
  PERFORM sdd.write_event(p_batch_id,v_batch.current_spec_id,NULL,'SUPERVISOR',p_recovered_by,
    'INTERRUPTION_RECOVERED','RUNNING','PAUSED',jsonb_build_object('blocked_spec_id',v_blocked_spec));
  RETURN jsonb_build_object('batch_id',p_batch_id,'state','PAUSED','blocked_spec_id',v_blocked_spec,
    'resume_requires_user_authorization',true);
END;
$$;

CREATE FUNCTION public.sdd_extend_limits(
  p_batch_id uuid,
  p_spec_id text,
  p_additional_attempts integer,
  p_additional_seconds integer,
  p_approved_by text,
  p_reason text,
  p_confirmation text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_limits record;
BEGIN
  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
  IF p_additional_attempts < 0 OR p_additional_seconds < 0
     OR (p_additional_attempts = 0 AND p_additional_seconds = 0)
     OR length(btrim(p_approved_by)) = 0 OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Explicit positive limit extension, actor and reason are required';
  END IF;
  IF p_confirmation <> format('ESTENDER %s %s %s %s',p_batch_id,p_spec_id,p_additional_attempts,p_additional_seconds) THEN
    RAISE EXCEPTION 'Explicit confirmation of batch, SPEC and additional limits is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sdd.batch_specs WHERE batch_id = p_batch_id AND spec_id = p_spec_id) THEN
    RAISE EXCEPTION 'SPEC is not part of the batch';
  END IF;
  IF EXISTS (SELECT 1 FROM sdd.authorizations WHERE idempotency_key = p_idempotency_key) THEN
    IF NOT EXISTS (SELECT 1 FROM sdd.authorizations WHERE idempotency_key = p_idempotency_key
      AND batch_id = p_batch_id AND spec_id = p_spec_id
      AND authorization_type = 'LIMIT_EXTENSION' AND manifest_hash = v_batch.manifest_hash
      AND additional_attempts = p_additional_attempts AND additional_seconds = p_additional_seconds
      AND approved_by = p_approved_by AND reason = p_reason) THEN
      RAISE EXCEPTION 'Idempotency key was reused with different limit extension data';
    END IF;
    SELECT * INTO v_limits FROM sdd.effective_limits(p_batch_id,p_spec_id);
    RETURN jsonb_build_object('batch_id',p_batch_id,'spec_id',p_spec_id,'state',v_batch.state,
      'max_attempts',v_limits.max_attempts,'max_seconds',v_limits.max_seconds,'idempotent_replay',true);
  END IF;
  IF v_batch.state <> 'PAUSED' THEN RAISE EXCEPTION 'Limits can only be extended on a paused batch'; END IF;
  INSERT INTO sdd.authorizations (batch_id,spec_id,authorization_type,manifest_hash,approved_by,
    reason,additional_attempts,additional_seconds,idempotency_key)
  VALUES (p_batch_id,p_spec_id,'LIMIT_EXTENSION',v_batch.manifest_hash,p_approved_by,p_reason,
    p_additional_attempts,p_additional_seconds,p_idempotency_key);
  SELECT * INTO v_limits FROM sdd.effective_limits(p_batch_id,p_spec_id);
  PERFORM sdd.write_event(p_batch_id,p_spec_id,NULL,'USER',p_approved_by,'LIMITS_EXTENDED',
    'PAUSED','PAUSED',jsonb_build_object('additional_attempts',p_additional_attempts,
      'additional_seconds',p_additional_seconds,'effective_max_attempts',v_limits.max_attempts,
      'effective_max_seconds',v_limits.max_seconds,'reason',p_reason),p_idempotency_key);
  RETURN jsonb_build_object('batch_id',p_batch_id,'spec_id',p_spec_id,'state','PAUSED',
    'max_attempts',v_limits.max_attempts,'max_seconds',v_limits.max_seconds);
END;
$$;

CREATE FUNCTION public.sdd_resume_batch(
  p_batch_id uuid,
  p_approved_by text,
  p_reason text,
  p_confirmation text,
  p_owner_id text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_token uuid;
  v_blocked_spec_id text;
  v_resume_spec_id text;
  v_limits record;
  v_attempt_limit_reached boolean;
  v_elapsed bigint;
  v_spec_state text;
BEGIN
  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF FOUND AND v_batch.state = 'RUNNING' AND EXISTS (
    SELECT 1 FROM sdd.authorizations WHERE batch_id = p_batch_id
      AND authorization_type = 'RESUME' AND idempotency_key = p_idempotency_key
      AND manifest_hash = v_batch.manifest_hash AND approved_by = p_approved_by AND reason = p_reason
  ) THEN
    SELECT lease_token INTO v_token FROM sdd.execution_leases
    WHERE batch_id = p_batch_id AND idempotency_key = p_idempotency_key
      AND owner_id = p_owner_id AND expires_at > clock_timestamp();
    IF v_token IS NULL THEN RAISE EXCEPTION 'The prior resume lease expired; recover before retrying'; END IF;
    RETURN jsonb_build_object('batch_id',p_batch_id,'state','RUNNING','lease_token',v_token,
      'resumed_spec_id',v_batch.current_spec_id);
  END IF;
  IF NOT FOUND OR v_batch.state <> 'PAUSED' THEN RAISE EXCEPTION 'Only a paused batch can resume'; END IF;
  IF p_confirmation <> ('RETOMAR ' || p_batch_id::text || ' ' || v_batch.manifest_hash)
     OR length(btrim(p_approved_by)) = 0 OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Explicit authorization for the exact paused batch is required';
  END IF;

  SELECT item.spec_id INTO v_blocked_spec_id FROM sdd.batch_specs item
  WHERE item.batch_id = p_batch_id AND item.state = 'BLOCKED' ORDER BY item.position LIMIT 1;
  v_resume_spec_id := COALESCE(v_blocked_spec_id,v_batch.current_spec_id);
  IF v_blocked_spec_id IS NOT NULL THEN
    SELECT * INTO v_limits FROM sdd.effective_limits(p_batch_id,v_blocked_spec_id);
    SELECT EXISTS (
      SELECT 1 FROM sdd.failures f JOIN sdd.runs r USING (run_id)
      WHERE r.batch_id = p_batch_id AND r.spec_id = v_blocked_spec_id
        AND f.state IN ('OPEN','BLOCKED')
        AND (SELECT COUNT(*) FROM sdd.correction_attempts a WHERE a.failure_id=f.failure_id)
          >= v_limits.max_attempts
    ) INTO v_attempt_limit_reached;
    v_elapsed := sdd.fix_elapsed_seconds(p_batch_id,v_blocked_spec_id);
    IF v_attempt_limit_reached OR v_elapsed >= v_limits.max_seconds THEN
      RAISE EXCEPTION 'Authorize a limit extension before resuming this blocked SPEC';
    END IF;
  END IF;

  INSERT INTO sdd.authorizations (batch_id,authorization_type,manifest_hash,approved_by,reason,idempotency_key)
  VALUES (p_batch_id,'RESUME',v_batch.manifest_hash,p_approved_by,p_reason,p_idempotency_key);
  INSERT INTO sdd.execution_leases (batch_id,owner_id,idempotency_key)
  VALUES (p_batch_id,p_owner_id,p_idempotency_key) ON CONFLICT (batch_id) DO NOTHING RETURNING lease_token INTO v_token;
  IF v_token IS NULL THEN RAISE EXCEPTION 'An active lease already exists for this batch'; END IF;

  UPDATE sdd.batches SET state = 'RUNNING', paused_at = NULL, pause_reason = NULL,
    state_version = state_version + 1, updated_at = clock_timestamp() WHERE batch_id = p_batch_id;
  UPDATE sdd.batch_specs SET state = 'RUNNING'
  WHERE batch_id = p_batch_id AND state = 'BLOCKED';
  UPDATE sdd.failures f SET state = 'OPEN'
  FROM sdd.runs r
  WHERE r.run_id = f.run_id AND r.batch_id = p_batch_id
    AND r.spec_id = v_resume_spec_id AND f.state = 'BLOCKED';
  v_spec_state := CASE
    WHEN EXISTS (SELECT 1 FROM sdd.failures f JOIN sdd.runs r USING (run_id)
      WHERE r.batch_id = p_batch_id AND r.spec_id = v_resume_spec_id AND f.state = 'OPEN') THEN 'FIXING'
    WHEN EXISTS (SELECT 1 FROM sdd.quality_gates g JOIN sdd.runs r USING (run_id)
      WHERE r.batch_id = p_batch_id AND r.spec_id = v_resume_spec_id AND g.state <> 'PASSED') THEN 'TESTING'
    ELSE 'IMPLEMENTING' END;
  UPDATE sdd.runs SET state = v_spec_state, ended_at = NULL
  WHERE run_id = (SELECT run_id FROM sdd.runs WHERE batch_id = p_batch_id
    AND spec_id = v_resume_spec_id ORDER BY run_number DESC LIMIT 1)
    AND state IN ('PAUSED','BLOCKED');
  UPDATE sdd.specifications SET state = v_spec_state, updated_at = clock_timestamp()
  WHERE spec_id = v_resume_spec_id;
  UPDATE sdd.batches SET current_spec_id = v_resume_spec_id WHERE batch_id = p_batch_id;
  PERFORM sdd.write_event(p_batch_id,v_resume_spec_id,NULL,'USER',p_approved_by,
    'BATCH_RESUMED','PAUSED','RUNNING',jsonb_build_object('reason',p_reason),p_idempotency_key);
  RETURN jsonb_build_object('batch_id',p_batch_id,'state','RUNNING','lease_token',v_token,
    'resumed_spec_id',v_resume_spec_id);
END;
$$;

CREATE FUNCTION public.sdd_status(p_batch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
  SELECT jsonb_build_object(
    'server_time', clock_timestamp(),
    'batches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'batch_id', b.batch_id, 'name', b.name, 'state', b.state,
        'manifest_hash', b.manifest_hash, 'created_by', b.created_by,
        'approved_by', b.approved_by, 'approved_at', b.approved_at,
        'current_spec_id', b.current_spec_id, 'pause_reason', b.pause_reason,
        'state_version', b.state_version, 'created_at', b.created_at,
        'lease_expires_at', lease.expires_at,
        'specs', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'spec_id', item.spec_id, 'position', item.position, 'state', item.state,
          'version', version.version, 'content_hash', version.content_hash,
          'run_id', latest.run_id, 'run_state', latest.state,
          'attempts', (SELECT COUNT(*) FROM sdd.correction_attempts a
            JOIN sdd.failures f USING (failure_id) JOIN sdd.runs r USING (run_id)
            WHERE r.batch_id=b.batch_id AND r.spec_id=item.spec_id),
          'fix_elapsed_seconds', sdd.fix_elapsed_seconds(b.batch_id,item.spec_id),
          'worker_seconds', sdd.worker_seconds(b.batch_id,item.spec_id)
        ) ORDER BY item.position)
        FROM sdd.batch_specs item
        JOIN sdd.spec_versions version USING (spec_version_id)
        LEFT JOIN LATERAL (SELECT r.run_id,r.state FROM sdd.runs r
          WHERE r.batch_id=b.batch_id AND r.spec_id=item.spec_id
          ORDER BY r.run_number DESC LIMIT 1) latest ON true
        WHERE item.batch_id=b.batch_id), '[]'::jsonb)
      ) ORDER BY b.created_at DESC)
      FROM sdd.batches b
      LEFT JOIN sdd.execution_leases lease USING (batch_id)
      WHERE p_batch_id IS NULL OR b.batch_id=p_batch_id
    ), '[]'::jsonb)
  );
$$;

CREATE FUNCTION public.sdd_events(p_batch_id uuid, p_after_event_id bigint DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.event_id), '[]'::jsonb)
  FROM sdd.audit_events e
  WHERE e.batch_id = p_batch_id AND e.event_id > p_after_event_id;
$$;

-- Operational RPCs are restricted to the server-side runner role. Approval,
-- limit-extension and resume RPCs stay owner-only for the privileged SQL channel.
-- No governance tables or functions are granted to browser roles.
REVOKE ALL ON FUNCTION public.sdd_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_register_spec_version(text,text,integer,text,text[],text[],jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_create_batch(text,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_validate_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_approve_batch(uuid,text,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sdd_claim_batch(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_heartbeat(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_start_next_spec(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_record_task(uuid,uuid,text,text,text,text,text,text,text[],jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_record_gate(uuid,uuid,text,text,boolean,text,text,integer,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_save_checkpoint(uuid,uuid,text,bigint,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_open_failure(uuid,uuid,text,uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_begin_correction(uuid,uuid,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_open_fix_window(uuid,uuid,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_close_fix_window(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_finish_correction(uuid,uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_complete_spec(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_pause_batch(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_recover_interrupted(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_extend_limits(uuid,text,integer,integer,text,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sdd_resume_batch(uuid,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sdd_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sdd_events(uuid,bigint) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.sdd_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_register_spec_version(text,text,integer,text,text[],text[],jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_create_batch(text,jsonb,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_validate_batch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_claim_batch(uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_heartbeat(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_start_next_spec(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_record_task(uuid,uuid,text,text,text,text,text,text,text[],jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_record_gate(uuid,uuid,text,text,boolean,text,text,integer,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_save_checkpoint(uuid,uuid,text,bigint,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_open_failure(uuid,uuid,text,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_begin_correction(uuid,uuid,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_open_fix_window(uuid,uuid,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_close_fix_window(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_finish_correction(uuid,uuid,text,text,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_complete_spec(uuid,uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_pause_batch(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_recover_interrupted(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sdd_events(uuid,bigint) TO service_role;

COMMIT;
