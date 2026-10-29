-- Correct correction-window closure timestamps in the governance core.
-- Recovery clamps elapsed time to lease expiration; explicit pauses clamp to now.
BEGIN;

CREATE OR REPLACE FUNCTION sdd.pause_for_limit(p_batch_id uuid, p_spec_id text, p_reason text, p_actor_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_batch_state text;
  v_close_at timestamptz := clock_timestamp();
BEGIN
  SELECT state INTO v_batch_state
  FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF v_batch_state IS NULL OR v_batch_state IN ('COMPLETED', 'CANCELLED') THEN
    RETURN;
  END IF;

  UPDATE sdd.fix_windows w SET ended_at = v_close_at,
    worker_seconds = GREATEST(w.worker_seconds,CEIL(EXTRACT(EPOCH FROM v_close_at-w.started_at))::bigint)
  FROM sdd.correction_attempts a
  JOIN sdd.failures f USING (failure_id)
  JOIN sdd.runs r USING (run_id)
  WHERE w.correction_attempt_id = a.correction_attempt_id
    AND r.batch_id = p_batch_id AND r.spec_id = p_spec_id AND w.ended_at IS NULL;
  UPDATE sdd.correction_attempts a SET state = 'INTERRUPTED', ended_at = v_close_at
  FROM sdd.failures f JOIN sdd.runs r USING (run_id)
  WHERE a.failure_id = f.failure_id AND r.run_id = f.run_id
    AND r.batch_id = p_batch_id AND r.spec_id = p_spec_id AND a.state = 'IN_PROGRESS';

  UPDATE sdd.specifications SET state = 'BLOCKED', updated_at = v_close_at
  WHERE spec_id = p_spec_id;
  UPDATE sdd.batch_specs SET state = 'BLOCKED'
  WHERE batch_id = p_batch_id AND spec_id = p_spec_id;
  UPDATE sdd.runs SET state = 'BLOCKED', ended_at = v_close_at
  WHERE batch_id = p_batch_id AND spec_id = p_spec_id
    AND state NOT IN ('COMPLETED', 'BLOCKED', 'PAUSED', 'CANCELLED')
    AND ended_at IS NULL;
  UPDATE sdd.batches
  SET state = 'PAUSED', paused_at = v_close_at, pause_reason = p_reason,
      state_version = state_version + 1, updated_at = v_close_at
  WHERE batch_id = p_batch_id;
  DELETE FROM sdd.execution_leases WHERE batch_id = p_batch_id;
  PERFORM sdd.write_event(p_batch_id, p_spec_id, NULL, 'SUPERVISOR', p_actor_id,
    'LIMIT_REACHED', v_batch_state, 'PAUSED', jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.sdd_pause_batch(
  p_batch_id uuid,
  p_lease_token uuid,
  p_owner_id text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, sdd
AS $$
DECLARE
  v_state text;
  v_paused_at timestamptz := clock_timestamp();
BEGIN
  SELECT state INTO v_state FROM sdd.batches WHERE batch_id = p_batch_id FOR UPDATE;
  IF v_state = 'PAUSED' THEN
    RETURN jsonb_build_object('batch_id',p_batch_id,'state','PAUSED');
  END IF;
  IF v_state <> 'RUNNING' OR NOT EXISTS (
    SELECT 1 FROM sdd.execution_leases WHERE batch_id = p_batch_id AND lease_token = p_lease_token
      AND owner_id = p_owner_id AND expires_at > v_paused_at
  ) THEN RAISE EXCEPTION 'Active batch lease required'; END IF;
  UPDATE sdd.fix_windows w SET ended_at = v_paused_at,
    worker_seconds = GREATEST(w.worker_seconds,CEIL(EXTRACT(EPOCH FROM v_paused_at-w.started_at))::bigint)
  FROM sdd.correction_attempts a
  JOIN sdd.failures f USING (failure_id)
  JOIN sdd.runs r USING (run_id)
  WHERE w.correction_attempt_id = a.correction_attempt_id
    AND r.batch_id = p_batch_id AND w.ended_at IS NULL;
  UPDATE sdd.correction_attempts a SET state = 'INTERRUPTED', ended_at = v_paused_at
  FROM sdd.failures f JOIN sdd.runs r USING (run_id)
  WHERE a.failure_id = f.failure_id AND r.run_id = f.run_id
    AND r.batch_id = p_batch_id AND a.state = 'IN_PROGRESS';
  UPDATE sdd.batches SET state = 'PAUSED', paused_at = v_paused_at, pause_reason = p_reason,
    state_version = state_version + 1, updated_at = v_paused_at WHERE batch_id = p_batch_id;
  UPDATE sdd.runs SET state = 'PAUSED', ended_at = v_paused_at
  WHERE batch_id = p_batch_id AND ended_at IS NULL;
  DELETE FROM sdd.execution_leases WHERE batch_id = p_batch_id;
  PERFORM sdd.write_event(p_batch_id,NULL,NULL,'ORCHESTRATOR',p_owner_id,
    'BATCH_PAUSED','RUNNING','PAUSED',jsonb_build_object('reason',p_reason));
  RETURN jsonb_build_object('batch_id',p_batch_id,'state','PAUSED','reason',p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.sdd_recover_interrupted(
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

  UPDATE sdd.fix_windows w SET ended_at = v_window_end,
    worker_seconds = GREATEST(w.worker_seconds,CEIL(EXTRACT(EPOCH FROM v_window_end-w.started_at))::bigint)
  FROM sdd.correction_attempts a JOIN sdd.failures f USING (failure_id)
  JOIN sdd.runs r USING (run_id)
  WHERE w.correction_attempt_id = a.correction_attempt_id AND r.batch_id = p_batch_id AND w.ended_at IS NULL;
  UPDATE sdd.correction_attempts a SET state = 'INTERRUPTED', ended_at = v_window_end
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
    UPDATE sdd.batches SET state = 'PAUSED', paused_at = v_recovery_at,
      pause_reason = 'Codex session or runner interrupted; explicit user resume required',
      state_version = state_version + 1, updated_at = v_recovery_at WHERE batch_id = p_batch_id;
    UPDATE sdd.runs SET state = 'PAUSED', ended_at = v_recovery_at
      WHERE batch_id = p_batch_id AND ended_at IS NULL;
    DELETE FROM sdd.execution_leases WHERE batch_id = p_batch_id;
  END IF;
  PERFORM sdd.write_event(p_batch_id,v_batch.current_spec_id,NULL,'SUPERVISOR',p_recovered_by,
    'INTERRUPTION_RECOVERED','RUNNING','PAUSED',jsonb_build_object('blocked_spec_id',v_blocked_spec));
  RETURN jsonb_build_object('batch_id',p_batch_id,'state','PAUSED','blocked_spec_id',v_blocked_spec,
    'resume_requires_user_authorization',true);
END;
$$;

COMMIT;
