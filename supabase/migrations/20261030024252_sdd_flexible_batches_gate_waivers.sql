-- Dependency-aware cross-batch scopes and exact, owner-authorized gate waivers.
BEGIN;

ALTER TABLE sdd.quality_gates
  DROP CONSTRAINT IF EXISTS quality_gates_state_check;
ALTER TABLE sdd.quality_gates
  ADD CONSTRAINT quality_gates_state_check
  CHECK (state IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED', 'WAIVED'));

ALTER TABLE sdd.quality_gates
  ADD COLUMN waiver_policy text NOT NULL DEFAULT 'NEVER'
  CHECK (waiver_policy IN ('NEVER', 'ALTERNATIVE_EVIDENCE', 'UNAVAILABLE', 'ALTERNATIVE_AND_UNAVAILABLE'));

CREATE TABLE sdd.gate_waiver_authorizations (
  waiver_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES sdd.batches(batch_id) ON DELETE RESTRICT,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  run_id uuid NOT NULL REFERENCES sdd.runs(run_id) ON DELETE RESTRICT,
  spec_id text NOT NULL,
  spec_version integer NOT NULL CHECK (spec_version > 0),
  spec_content_hash text NOT NULL CHECK (spec_content_hash ~ '^[0-9a-f]{64}$'),
  gate_id uuid NOT NULL UNIQUE REFERENCES sdd.quality_gates(gate_id) ON DELETE RESTRICT,
  gate_key text NOT NULL CHECK (length(btrim(gate_key)) > 0),
  outcome_basis text NOT NULL CHECK (outcome_basis IN ('ALTERNATIVE_EVIDENCE', 'UNAVAILABLE')),
  approved_by text NOT NULL CHECK (length(btrim(approved_by)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  evidence_ref text NOT NULL CHECK (length(btrim(evidence_ref)) BETWEEN 1 AND 500),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  failure_id uuid REFERENCES sdd.failures(failure_id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE sdd.gate_waiver_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sdd.gate_waiver_authorizations FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER gate_waiver_authorizations_append_only
BEFORE UPDATE OR DELETE ON sdd.gate_waiver_authorizations
FOR EACH ROW EXECUTE FUNCTION sdd.reject_audit_mutation();

CREATE INDEX gate_waivers_batch_run_idx
  ON sdd.gate_waiver_authorizations (batch_id, run_id, created_at DESC);

CREATE FUNCTION sdd.normalize_file_scope(p_scope text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_scope text;
BEGIN
  IF p_scope IS NULL OR length(btrim(p_scope)) = 0 THEN
    RAISE EXCEPTION 'Writable file scope must be a non-empty relative path';
  END IF;
  v_scope := replace(btrim(p_scope), E'\\', '/');
  v_scope := regexp_replace(v_scope, '/+', '/', 'g');
  IF left(v_scope, 1) = '/' OR v_scope ~ '^[A-Za-z]:' THEN
    RAISE EXCEPTION 'Writable file scope cannot be absolute';
  END IF;
  v_scope := regexp_replace(v_scope, '^(\./)+', '');
  v_scope := regexp_replace(v_scope, '/\*\*/?$', '');
  v_scope := regexp_replace(v_scope, '/+$', '');
  IF v_scope = '' OR v_scope ~ '(^|/)\.\.?(/|$)' OR v_scope ~ '[[:cntrl:]]'
     OR v_scope ~ '[*?]' THEN
    RAISE EXCEPTION 'Writable file scope is invalid or contains traversal/glob syntax';
  END IF;
  RETURN lower(v_scope);
END;
$$;

CREATE FUNCTION sdd.file_scopes_overlap(p_left text, p_right text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, sdd
AS $$
  SELECT left_scope = right_scope
    OR left(left_scope, length(right_scope) + 1) = right_scope || '/'
    OR left(right_scope, length(left_scope) + 1) = left_scope || '/'
  FROM (SELECT sdd.normalize_file_scope(p_left) AS left_scope,
               sdd.normalize_file_scope(p_right) AS right_scope) AS normalized;
$$;

CREATE FUNCTION sdd.has_cross_batch_scope_conflict(p_batch_id uuid, p_file_scope text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, sdd
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM sdd.tasks reserved
    JOIN sdd.runs reserved_run USING (run_id)
    JOIN sdd.execution_leases lease ON lease.batch_id = reserved_run.batch_id
      AND lease.expires_at > clock_timestamp()
    CROSS JOIN LATERAL unnest(COALESCE(p_file_scope, '{}'::text[])) AS requested(scope)
    CROSS JOIN LATERAL unnest(reserved.file_scope) AS occupied(scope)
    WHERE reserved_run.batch_id <> p_batch_id
      AND reserved_run.ended_at IS NULL
      AND reserved.state = 'RUNNING'
      AND sdd.file_scopes_overlap(requested.scope, occupied.scope)
  ) OR EXISTS (
    SELECT 1
    FROM sdd.fix_windows fix_window
    JOIN sdd.correction_attempts attempt USING (correction_attempt_id)
    JOIN sdd.failures failure USING (failure_id)
    JOIN sdd.runs reserved_run USING (run_id)
    JOIN sdd.tasks reserved ON reserved.task_id = failure.task_id
      AND reserved.run_id = failure.run_id
    CROSS JOIN LATERAL unnest(COALESCE(p_file_scope, '{}'::text[])) AS requested(scope)
    CROSS JOIN LATERAL unnest(reserved.file_scope) AS occupied(scope)
    WHERE reserved_run.batch_id <> p_batch_id
      AND fix_window.ended_at IS NULL
      AND sdd.file_scopes_overlap(requested.scope, occupied.scope)
  );
$$;

CREATE FUNCTION sdd.gate_waiver_policy(p_spec_version_id uuid, p_gate_key text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_policy text;
BEGIN
  SELECT version.snapshot #>> ARRAY['gate_waiver_policies', p_gate_key]
    INTO v_policy
  FROM sdd.spec_versions version
  WHERE version.spec_version_id = p_spec_version_id;
  v_policy := COALESCE(v_policy, 'NEVER');
  IF v_policy NOT IN ('NEVER', 'ALTERNATIVE_EVIDENCE', 'UNAVAILABLE', 'ALTERNATIVE_AND_UNAVAILABLE') THEN
    RAISE EXCEPTION 'Invalid waiver policy in immutable SPEC snapshot';
  END IF;
  RETURN v_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.sdd_record_task(
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
  v_file_scope text[];
  v_scope text;
  v_task_found boolean;
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
  PERFORM sdd.require_active_lease(v_batch_id, p_lease_token, p_owner_id, v_spec_id);

  SELECT * INTO v_task FROM sdd.tasks WHERE run_id = p_run_id AND task_key = p_task_key FOR UPDATE;
  v_task_found := FOUND;
  v_file_scope := COALESCE(p_file_scope, v_task.file_scope, '{}'::text[]);
  FOREACH v_scope IN ARRAY v_file_scope LOOP
    PERFORM sdd.normalize_file_scope(v_scope);
  END LOOP;
  IF p_state = 'RUNNING' THEN
    IF cardinality(v_file_scope) = 0 THEN
      RAISE EXCEPTION 'An active task requires an explicit writable file scope';
    END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended('sdd-active-file-scope-guard', 0));
    IF sdd.has_cross_batch_scope_conflict(v_batch_id, v_file_scope) THEN
      RAISE EXCEPTION 'Writable file scope overlaps active work in another batch';
    END IF;
  END IF;

  IF NOT v_task_found THEN
    INSERT INTO sdd.tasks (run_id, task_key, description, state, agent_profile, agent_ref,
      file_scope, started_at, ended_at, evidence)
    VALUES (p_run_id, p_task_key, p_description, p_state, p_agent_profile, p_agent_ref,
      v_file_scope, CASE WHEN p_state = 'RUNNING' THEN clock_timestamp() END,
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
    file_scope = v_file_scope,
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

CREATE OR REPLACE FUNCTION public.sdd_record_gate(
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
  v_spec_version_id uuid;
  v_policy text;
  v_gate_id uuid;
BEGIN
  IF p_state NOT IN ('PENDING','RUNNING','PASSED','FAILED','SKIPPED') THEN
    RAISE EXCEPTION 'Invalid gate state; WAIVED requires privileged authorization';
  END IF;
  IF p_state = 'PASSED' AND p_exit_code IS NOT NULL AND p_exit_code <> 0 THEN
    RAISE EXCEPTION 'A passed command must exit with code 0';
  END IF;
  IF p_state = 'PASSED' AND COALESCE(p_required,true) AND p_exit_code IS NULL THEN
    RAISE EXCEPTION 'A required passed gate must include the executed command exit code';
  END IF;
  IF p_state = 'FAILED' AND p_exit_code = 0 THEN
    RAISE EXCEPTION 'A failed command cannot exit with code 0';
  END IF;
  IF sdd.has_sensitive_key(COALESCE(p_evidence,'{}'::jsonb)) THEN
    RAISE EXCEPTION 'Gate evidence cannot contain credential or transcript fields';
  END IF;
  SELECT batch_id, spec_id, spec_version_id INTO v_batch_id, v_spec_id, v_spec_version_id
  FROM sdd.runs WHERE run_id = p_run_id AND ended_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active run required'; END IF;
  PERFORM sdd.require_active_lease(v_batch_id, p_lease_token, p_owner_id, v_spec_id);
  v_policy := sdd.gate_waiver_policy(v_spec_version_id, p_gate_key);
  SELECT * INTO v_gate FROM sdd.quality_gates WHERE run_id = p_run_id AND gate_key = p_gate_key FOR UPDATE;
  IF FOUND AND v_gate.state = 'WAIVED' THEN
    RAISE EXCEPTION 'An authorized WAIVED gate cannot be changed by the runner';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO sdd.quality_gates (run_id, gate_key, required, state, command, exit_code,
      waiver_policy, started_at, ended_at, evidence, recorded_by)
    VALUES (p_run_id, p_gate_key, COALESCE(p_required,true), p_state, p_command, p_exit_code,
      v_policy, CASE WHEN p_state <> 'PENDING' THEN clock_timestamp() END,
      CASE WHEN p_state IN ('PASSED','FAILED','SKIPPED') THEN clock_timestamp() END,
      COALESCE(p_evidence,'{}'::jsonb), p_recorded_by)
    RETURNING gate_id INTO v_gate_id;
  ELSE
    UPDATE sdd.quality_gates SET required = COALESCE(p_required,required), state = p_state,
      command = p_command, exit_code = p_exit_code, waiver_policy = v_policy,
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

CREATE OR REPLACE FUNCTION public.sdd_authorize_gate_waiver(
  p_batch_id uuid,
  p_manifest_hash text,
  p_run_id uuid,
  p_gate_key text,
  p_outcome_basis text,
  p_approved_by text,
  p_reason text,
  p_evidence jsonb,
  p_failure_id uuid,
  p_confirmation text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_run sdd.runs%ROWTYPE;
  v_gate sdd.quality_gates%ROWTYPE;
  v_version sdd.spec_versions%ROWTYPE;
  v_existing sdd.gate_waiver_authorizations%ROWTYPE;
  v_batch_check jsonb;
  v_waiver_id uuid;
  v_evidence_ref text;
  v_policy text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user::text = 'service_role' THEN
    RAISE EXCEPTION 'Gate-waiver authorization requires the privileged owner channel';
  END IF;
  IF p_idempotency_key IS NULL OR p_batch_id IS NULL OR p_run_id IS NULL
     OR p_gate_key IS NULL OR length(btrim(p_gate_key)) = 0
     OR p_confirmation IS NULL OR p_approved_by IS NULL OR length(btrim(p_approved_by)) = 0
     OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000
     OR p_evidence IS NULL
     OR jsonb_typeof(p_evidence) <> 'object'
     OR sdd.has_sensitive_key(COALESCE(p_evidence, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Gate-waiver request is incomplete or contains prohibited evidence';
  END IF;
  IF p_outcome_basis IS NULL OR p_outcome_basis NOT IN ('ALTERNATIVE_EVIDENCE','UNAVAILABLE') THEN
    RAISE EXCEPTION 'Unsupported gate-waiver outcome basis';
  END IF;
  IF p_manifest_hash IS NULL OR p_confirmation IS DISTINCT FROM (
      'WAIVE ' || p_batch_id::text || ' ' || p_manifest_hash || ' ' || p_run_id::text || ' ' || p_gate_key) THEN
    RAISE EXCEPTION 'Exact gate-waiver confirmation is required';
  END IF;
  v_evidence_ref := p_evidence->>'evidence_ref';
  IF length(btrim(COALESCE(v_evidence_ref, ''))) NOT BETWEEN 1 AND 500
     OR length(btrim(COALESCE(p_evidence->>'method', ''))) = 0 THEN
    RAISE EXCEPTION 'Gate-waiver evidence requires a safe method and reference';
  END IF;

  SELECT * INTO v_existing FROM sdd.gate_waiver_authorizations
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.batch_id <> p_batch_id OR v_existing.manifest_hash <> p_manifest_hash
       OR v_existing.run_id <> p_run_id OR v_existing.gate_key <> p_gate_key
       OR v_existing.outcome_basis <> p_outcome_basis OR v_existing.approved_by <> p_approved_by
       OR v_existing.reason <> p_reason OR v_existing.evidence <> p_evidence
       OR v_existing.failure_id IS DISTINCT FROM p_failure_id THEN
      RAISE EXCEPTION 'Gate-waiver idempotency key was reused for a different request';
    END IF;
    RETURN jsonb_build_object('waiver_id', v_existing.waiver_id, 'batch_id', p_batch_id,
      'run_id', p_run_id, 'gate_key', p_gate_key, 'state', 'WAIVED',
      'outcome_basis', p_outcome_basis, 'idempotent_replay', true);
  END IF;

  SELECT * INTO v_batch FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.state NOT IN ('RUNNING','PAUSED') THEN
    RAISE EXCEPTION 'A running or paused batch is required for gate waiver';
  END IF;
  IF p_manifest_hash IS NULL OR v_batch.manifest_hash <> p_manifest_hash THEN
    RAISE EXCEPTION 'Gate waiver manifest hash does not match the approved batch';
  END IF;
  v_batch_check := public.sdd_validate_batch(p_batch_id);
  IF NOT COALESCE((v_batch_check->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'Gate waiver batch manifest failed integrity validation';
  END IF;
  SELECT * INTO v_run FROM sdd.runs
  WHERE run_id = p_run_id AND batch_id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gate-waiver SPEC run does not belong to the exact batch'; END IF;
  IF v_batch.current_spec_id IS DISTINCT FROM v_run.spec_id THEN
    RAISE EXCEPTION 'Gate-waiver run is not the current SPEC position in this batch';
  END IF;
  SELECT version.* INTO v_version
  FROM sdd.spec_versions version
  JOIN sdd.batch_specs item ON item.spec_version_id = version.spec_version_id
    AND item.spec_id = version.spec_id
  WHERE item.batch_id = p_batch_id AND item.spec_id = v_run.spec_id
    AND item.spec_version_id = v_run.spec_version_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM sdd.batch_specs item
    JOIN sdd.spec_versions version ON version.spec_version_id = item.spec_version_id
      AND version.spec_id = item.spec_id
    WHERE item.batch_id = p_batch_id AND item.spec_id = v_run.spec_id
      AND item.spec_version_id = v_run.spec_version_id
      AND v_batch.manifest #>> ARRAY['items', (item.position - 1)::text, 'content_hash'] = version.content_hash
      AND v_batch.manifest #>> ARRAY['items', (item.position - 1)::text, 'spec_id'] = item.spec_id
  ) THEN
    RAISE EXCEPTION 'Gate-waiver SPEC version does not match the approved manifest';
  END IF;

  SELECT * INTO v_gate FROM sdd.quality_gates
  WHERE run_id = p_run_id AND gate_key = p_gate_key FOR UPDATE;
  IF NOT FOUND OR NOT v_gate.required OR v_gate.state NOT IN ('FAILED','SKIPPED') THEN
    RAISE EXCEPTION 'Only a required failed or skipped gate may be waived';
  END IF;
  v_policy := sdd.gate_waiver_policy(v_run.spec_version_id, p_gate_key);
  IF v_gate.waiver_policy <> v_policy THEN
    RAISE EXCEPTION 'Gate waiver policy does not match the immutable SPEC snapshot';
  END IF;
  IF p_outcome_basis = 'ALTERNATIVE_EVIDENCE' THEN
    IF v_policy NOT IN ('ALTERNATIVE_EVIDENCE','ALTERNATIVE_AND_UNAVAILABLE')
       OR p_evidence->>'exit_code' IS DISTINCT FROM '0' THEN
      RAISE EXCEPTION 'Gate is not eligible for a passing alternative evidence waiver';
    END IF;
  ELSE
    IF v_policy NOT IN ('UNAVAILABLE','ALTERNATIVE_AND_UNAVAILABLE')
       OR v_gate.state <> 'SKIPPED' OR p_failure_id IS NOT NULL
       OR length(btrim(COALESCE(p_evidence->>'unavailable_reason',''))) = 0 THEN
      RAISE EXCEPTION 'Environmental-unavailability waiver requires an eligible skipped gate';
    END IF;
  END IF;
  IF p_failure_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sdd.failures failure
    WHERE failure.failure_id = p_failure_id AND failure.run_id = p_run_id
      AND failure.state IN ('OPEN','BLOCKED')
  ) THEN
    RAISE EXCEPTION 'The failure to be resolved does not belong to this run or is already resolved';
  END IF;

  INSERT INTO sdd.gate_waiver_authorizations (
    batch_id, manifest_hash, run_id, spec_id, spec_version, spec_content_hash,
    gate_id, gate_key, outcome_basis, approved_by, reason, evidence_ref, evidence,
    failure_id, idempotency_key
  ) VALUES (
    p_batch_id, p_manifest_hash, p_run_id, v_run.spec_id, v_version.version,
    v_version.content_hash, v_gate.gate_id, v_gate.gate_key, p_outcome_basis,
    p_approved_by, p_reason, v_evidence_ref, p_evidence, p_failure_id, p_idempotency_key
  ) RETURNING waiver_id INTO v_waiver_id;

  UPDATE sdd.quality_gates SET state = 'WAIVED', ended_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE gate_id = v_gate.gate_id;
  IF p_failure_id IS NOT NULL THEN
    UPDATE sdd.failures SET state = 'RESOLVED', resolved_at = clock_timestamp(),
      resolution_evidence = jsonb_build_object(
        'type', 'AUTHORIZED_GATE_WAIVER', 'waiver_id', v_waiver_id,
        'evidence_ref', v_evidence_ref, 'outcome_basis', p_outcome_basis
      )
    WHERE failure_id = p_failure_id;
  END IF;
  PERFORM sdd.write_event(p_batch_id, v_run.spec_id, p_run_id, 'USER', p_approved_by,
    'GATE_WAIVER_AUTHORIZED', v_gate.state, 'WAIVED',
    jsonb_build_object('waiver_id', v_waiver_id, 'gate_key', p_gate_key,
      'outcome_basis', p_outcome_basis, 'reason', p_reason, 'evidence_ref', v_evidence_ref,
      'manifest_hash', p_manifest_hash), p_idempotency_key);
  RETURN jsonb_build_object('waiver_id', v_waiver_id, 'batch_id', p_batch_id,
    'run_id', p_run_id, 'spec_id', v_run.spec_id, 'gate_key', p_gate_key,
    'state', 'WAIVED', 'outcome_basis', p_outcome_basis, 'idempotent_replay', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.sdd_complete_spec(
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
  IF EXISTS (
    SELECT 1 FROM sdd.quality_gates gate
    WHERE gate.run_id = p_run_id AND gate.required
      AND NOT (
        gate.state = 'PASSED'
        OR gate.state = 'WAIVED' AND EXISTS (
          SELECT 1 FROM sdd.gate_waiver_authorizations waiver
          JOIN sdd.spec_versions version ON version.spec_id = waiver.spec_id
            AND version.version = waiver.spec_version
          WHERE waiver.gate_id = gate.gate_id
            AND waiver.batch_id = v_run.batch_id
            AND waiver.run_id = p_run_id
            AND waiver.gate_key = gate.gate_key
            AND waiver.manifest_hash = (SELECT manifest_hash FROM sdd.batches WHERE batch_id = v_run.batch_id)
            AND waiver.spec_content_hash = version.content_hash
            AND version.spec_version_id = v_run.spec_version_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Every required quality gate must pass or have an exact authorized waiver';
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

CREATE OR REPLACE FUNCTION public.sdd_status(p_batch_id uuid DEFAULT NULL)
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
          'worker_seconds', sdd.worker_seconds(b.batch_id,item.spec_id),
          'quality_gates', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'gate_key', gate.gate_key, 'required', gate.required, 'state', gate.state,
              'waiver_policy', gate.waiver_policy, 'command', gate.command,
              'exit_code', gate.exit_code, 'evidence', gate.evidence,
              'waiver', CASE WHEN waiver.waiver_id IS NULL THEN NULL ELSE jsonb_build_object(
                'waiver_id', waiver.waiver_id, 'outcome_basis', waiver.outcome_basis,
                'approved_by', waiver.approved_by, 'reason', waiver.reason,
                'evidence_ref', waiver.evidence_ref, 'created_at', waiver.created_at
              ) END
            ) ORDER BY gate.gate_key)
            FROM sdd.quality_gates gate
            LEFT JOIN sdd.gate_waiver_authorizations waiver ON waiver.gate_id = gate.gate_id
            WHERE gate.run_id = latest.run_id
          ), '[]'::jsonb)
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

REVOKE ALL ON FUNCTION public.sdd_authorize_gate_waiver(uuid,text,uuid,text,text,text,text,jsonb,uuid,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sdd_authorize_gate_waiver(uuid,text,uuid,text,text,text,text,jsonb,uuid,text,uuid)
  TO postgres;

REVOKE ALL ON FUNCTION
  sdd.normalize_file_scope(text),
  sdd.file_scopes_overlap(text,text),
  sdd.has_cross_batch_scope_conflict(uuid,text[]),
  sdd.gate_waiver_policy(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
