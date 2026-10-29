-- Controlled, one-off administrative reopen for the specifically authorized
-- SPEC-004@2 T029 correction. This does not alter product data or SDD counters.
BEGIN;

ALTER TABLE sdd.authorizations
  DROP CONSTRAINT authorizations_authorization_type_check;

ALTER TABLE sdd.authorizations
  ADD CONSTRAINT authorizations_authorization_type_check
  CHECK (authorization_type = ANY (ARRAY[
    'BATCH_APPROVAL', 'RESUME', 'LIMIT_EXTENSION', 'CANCEL', 'TASK_REOPEN'
  ]));

CREATE FUNCTION public.sdd_reopen_blocked_task(
  p_batch_id uuid,
  p_run_id uuid,
  p_manifest_hash text,
  p_spec_id text,
  p_spec_version integer,
  p_task_key text,
  p_approved_by text,
  p_reason text,
  p_confirmation text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch sdd.batches%ROWTYPE;
  v_run sdd.runs%ROWTYPE;
  v_item sdd.batch_specs%ROWTYPE;
  v_version sdd.spec_versions%ROWTYPE;
  v_task sdd.tasks%ROWTYPE;
  v_authorization sdd.authorizations%ROWTYPE;
  v_event sdd.audit_events%ROWTYPE;
  v_event_id bigint;
  v_confirmation text;
BEGIN
  -- Bind this operation to the exact owner-authorized batch, immutable
  -- manifest, SPEC snapshot, run, and task. It is not a generic state bypass.
  IF p_batch_id IS DISTINCT FROM 'f1363558-237b-46c8-8ddf-259ac7ede903'::uuid
     OR p_run_id IS DISTINCT FROM 'fdafac5f-7521-4e83-9051-c1b9badeec3e'::uuid
     OR p_manifest_hash IS DISTINCT FROM '088d7a65001a86136546d802569857308bbc8fe08397ca2c9c9663af2bb0e8a7'
     OR p_spec_id IS DISTINCT FROM 'SPEC-004'
     OR p_spec_version IS DISTINCT FROM 2
     OR p_task_key IS DISTINCT FROM 'T029' THEN
    RAISE EXCEPTION 'Administrative reopen is limited to the authorized SPEC-004@2 T029 run';
  END IF;

  IF p_approved_by IS DISTINCT FROM 'proprietario'
     OR p_reason IS NULL OR length(pg_catalog.btrim(p_reason)) = 0
     OR length(p_reason) > 1000
     OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Authorized approver, non-empty reason, and UUID idempotency key are required';
  END IF;

  v_confirmation := pg_catalog.format(
    'REABRIR %s %s %s@%s %s %s',
    p_batch_id, p_manifest_hash, p_spec_id, p_spec_version, p_run_id, p_task_key
  );
  IF p_confirmation IS DISTINCT FROM v_confirmation THEN
    RAISE EXCEPTION 'Explicit confirmation of the exact batch, manifest, SPEC, run, and task is required';
  END IF;

  -- Lock the exact batch first to serialize calls which reuse this operation's
  -- idempotency key. An exact replay returns its original event even after the
  -- batch has moved forward.
  SELECT * INTO v_batch
  FROM sdd.batches
  WHERE batch_id = p_batch_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authorized batch not found'; END IF;

  -- Reusing a key for any other authorization or payload is rejected.
  SELECT * INTO v_authorization
  FROM sdd.authorizations
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_authorization.batch_id IS DISTINCT FROM p_batch_id
       OR v_authorization.spec_id IS DISTINCT FROM p_spec_id
       OR v_authorization.authorization_type IS DISTINCT FROM 'TASK_REOPEN'
       OR v_authorization.manifest_hash IS DISTINCT FROM p_manifest_hash
       OR v_authorization.approved_by IS DISTINCT FROM p_approved_by
       OR v_authorization.reason IS DISTINCT FROM p_reason THEN
      RAISE EXCEPTION 'Idempotency key was reused with different administrative reopen data';
    END IF;

    SELECT * INTO v_event
    FROM sdd.audit_events
    WHERE idempotency_key = p_idempotency_key;
    IF NOT FOUND OR v_event.event_type IS DISTINCT FROM 'ADMIN_TASK_REOPENED'
       OR v_event.batch_id IS DISTINCT FROM p_batch_id
       OR v_event.run_id IS DISTINCT FROM p_run_id
       OR v_event.spec_id IS DISTINCT FROM p_spec_id
       OR v_event.details ->> 'task_key' IS DISTINCT FROM p_task_key
       OR v_event.details ->> 'manifest_hash' IS DISTINCT FROM p_manifest_hash
       OR v_event.details ->> 'reason' IS DISTINCT FROM p_reason
       OR v_event.details ->> 'spec_reference' IS DISTINCT FROM p_spec_id || '@' || p_spec_version::text
       OR v_event.details #>> '{previous_task,state}' IS DISTINCT FROM 'BLOCKED' THEN
      RAISE EXCEPTION 'Administrative reopen idempotency record is inconsistent';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'batch_id', p_batch_id,
      'run_id', p_run_id,
      'spec_id', p_spec_id,
      'task_key', p_task_key,
      'state', 'PENDING',
      'event_id', v_event.event_id,
      'idempotent_replay', true
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM sdd.audit_events WHERE idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'Idempotency key is already used by another audit event';
  END IF;

  -- A paused batch may not have a live executor.
  IF v_batch.state <> 'PAUSED' THEN
    RAISE EXCEPTION 'Task reopen requires the exact batch to be PAUSED';
  END IF;
  IF v_batch.manifest_hash IS DISTINCT FROM p_manifest_hash
     OR v_batch.current_spec_id IS DISTINCT FROM p_spec_id
     OR v_batch.approved_by IS DISTINCT FROM p_approved_by THEN
    RAISE EXCEPTION 'Paused batch approval, manifest, or current SPEC does not match authorization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sdd.execution_leases
    WHERE batch_id = p_batch_id AND expires_at > pg_catalog.clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'An active execution lease prevents task reopen';
  END IF;

  SELECT * INTO v_run
  FROM sdd.runs
  WHERE run_id = p_run_id
  FOR UPDATE;
  IF NOT FOUND OR v_run.batch_id IS DISTINCT FROM p_batch_id
     OR v_run.spec_id IS DISTINCT FROM p_spec_id
     OR v_run.state <> 'PAUSED' OR v_run.ended_at IS NULL THEN
    RAISE EXCEPTION 'The exact paused SPEC run does not match authorization';
  END IF;

  SELECT * INTO v_item
  FROM sdd.batch_specs
  WHERE batch_id = p_batch_id AND spec_id = p_spec_id
  FOR UPDATE;
  IF NOT FOUND OR v_item.state NOT IN ('RUNNING', 'BLOCKED')
     OR v_item.spec_version_id IS DISTINCT FROM v_run.spec_version_id THEN
    RAISE EXCEPTION 'The active batch SPEC entry does not match the paused run';
  END IF;

  SELECT * INTO v_version
  FROM sdd.spec_versions
  WHERE spec_version_id = v_item.spec_version_id;
  IF NOT FOUND OR v_version.spec_id IS DISTINCT FROM p_spec_id
     OR v_version.version IS DISTINCT FROM p_spec_version
     OR v_version.content_hash IS DISTINCT FROM '92f0c83a8c24c44119b5709a8fb3a2b1eb6846d4819f5d4624358091e854e956' THEN
    RAISE EXCEPTION 'The immutable SPEC-004@2 snapshot does not match authorization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sdd.tasks
    WHERE run_id = p_run_id AND state = 'RUNNING'
  ) THEN
    RAISE EXCEPTION 'A running task prevents administrative task reopen';
  END IF;

  SELECT * INTO v_task
  FROM sdd.tasks
  WHERE run_id = p_run_id AND task_key = p_task_key
  FOR UPDATE;
  IF NOT FOUND OR v_task.state <> 'BLOCKED' THEN
    RAISE EXCEPTION 'Only the specifically authorized BLOCKED T029 task can be reopened';
  END IF;

  INSERT INTO sdd.authorizations (
    batch_id, spec_id, authorization_type, manifest_hash,
    approved_by, reason, idempotency_key
  ) VALUES (
    p_batch_id, p_spec_id, 'TASK_REOPEN', p_manifest_hash,
    p_approved_by, p_reason, p_idempotency_key
  );

  UPDATE sdd.tasks
  SET state = 'PENDING', started_at = NULL, ended_at = NULL,
      updated_at = pg_catalog.clock_timestamp()
  WHERE task_id = v_task.task_id;

  v_event_id := sdd.write_event(
    p_batch_id,
    p_spec_id,
    p_run_id,
    'SUPERVISOR',
    p_approved_by,
    'ADMIN_TASK_REOPENED',
    'BLOCKED',
    'PENDING',
    pg_catalog.jsonb_build_object(
      'task_key', p_task_key,
      'spec_reference', p_spec_id || '@' || p_spec_version::text,
      'manifest_hash', p_manifest_hash,
      'reason', p_reason,
      'previous_task', pg_catalog.jsonb_build_object(
        'task_id', v_task.task_id,
        'state', v_task.state,
        'created_at', v_task.created_at,
        'updated_at', v_task.updated_at,
        'started_at', v_task.started_at,
        'ended_at', v_task.ended_at
      )
    ),
    p_idempotency_key
  );

  RETURN pg_catalog.jsonb_build_object(
    'batch_id', p_batch_id,
    'run_id', p_run_id,
    'spec_id', p_spec_id,
    'task_key', p_task_key,
    'state', 'PENDING',
    'batch_state', 'PAUSED',
    'event_id', v_event_id,
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sdd_reopen_blocked_task(uuid,uuid,text,text,integer,text,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
