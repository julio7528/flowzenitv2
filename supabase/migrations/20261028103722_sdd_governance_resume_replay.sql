-- Mark an idempotent, still-live resume replay explicitly for supervisor callers.
BEGIN;

CREATE OR REPLACE FUNCTION public.sdd_resume_batch(
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
      'resumed_spec_id',v_batch.current_spec_id,'idempotent_replay',true);
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

COMMIT;
