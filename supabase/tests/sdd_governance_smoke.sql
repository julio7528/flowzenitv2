-- Isolated SDD control-plane integration test. All test rows roll back at the end.
BEGIN;

DO $sdd_smoke$
DECLARE
  v_spec_id text := 'SMOKE-' || lpad((floor(random()*1000000000)::bigint)::text,9,'0');
  v_hash text := repeat('a',64);
  v_spec_key uuid := gen_random_uuid();
  v_batch_key uuid := gen_random_uuid();
  v_batch_id uuid;
  v_create jsonb;
  v_repeat jsonb;
  v_manifest_hash text;
  v_result jsonb;
  v_lease uuid;
  v_run_id uuid;
  v_task_id uuid;
  v_gate_id uuid;
  v_failure_id uuid;
  v_attempt_id uuid;
  v_attempt jsonb;
  v_window_a uuid;
  v_window_b uuid;
  v_base timestamptz;
  v_attempt_no integer;
  v_elapsed bigint;
  v_worker bigint;
  v_wrong_lease_rejected boolean := false;
  v_limits_key uuid := gen_random_uuid();
  v_resume_key uuid := gen_random_uuid();
  v_resume jsonb;
  v_more jsonb;
  v_state text;
  v_recovery_spec_id text := 'SMOKE-' || lpad((floor(random()*1000000000)::bigint)::text,9,'0');
  v_recovery_spec_key uuid := gen_random_uuid();
  v_recovery_batch_key uuid := gen_random_uuid();
  v_recovery_batch_id uuid;
  v_recovery_manifest_hash text;
  v_recovery_lease uuid;
  v_recovery_run_id uuid;
  v_recovery_task_id uuid;
  v_recovery_failure_id uuid;
  v_recovery_attempt_id uuid;
  v_recovery_window_id uuid;
  v_recovery_result jsonb;
  v_recovery_limits_key uuid := gen_random_uuid();
  v_recovery_resume_key uuid := gen_random_uuid();
  v_recovery_ended_at timestamptz;
  v_recovery_worker_seconds bigint;
  v_bad_resume_rejected boolean := false;
  v_batch_key_collision_rejected boolean := false;
  v_seq_spec_first text := 'SEQ-' || lpad((floor(random()*1000000000)::bigint)::text,9,'0');
  v_seq_spec_second text := 'SEQ-' || lpad((floor(random()*1000000000)::bigint)::text,9,'0');
  v_seq_batch_id uuid;
  v_seq_manifest_hash text;
  v_seq_lease uuid;
  v_seq_run_id uuid;
  v_seq_task_id uuid;
  v_seq_result jsonb;
  v_seq_order_rejected boolean := false;
BEGIN
  IF NOT COALESCE((public.sdd_health()->>'ready')::boolean,false) THEN
    RAISE EXCEPTION 'SDD health check did not report ready';
  END IF;

  IF has_schema_privilege('anon','sdd','USAGE')
     OR has_schema_privilege('authenticated','sdd','USAGE')
     OR has_schema_privilege('service_role','sdd','USAGE')
     OR has_table_privilege('anon','sdd.batches','SELECT')
     OR has_table_privilege('authenticated','sdd.batches','SELECT')
     OR has_table_privilege('service_role','sdd.batches','SELECT') THEN
    RAISE EXCEPTION 'A browser/runner role has direct access to the private SDD schema';
  END IF;

  IF has_function_privilege('service_role','public.sdd_approve_batch(uuid,text,text,text,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.sdd_extend_limits(uuid,text,integer,integer,text,text,text,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.sdd_resume_batch(uuid,text,text,text,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.sdd_health()','EXECUTE')
     OR has_function_privilege('authenticated','public.sdd_health()','EXECUTE') THEN
    RAISE EXCEPTION 'An unprivileged role can invoke an operator-only or server-only SDD function';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='sdd' AND c.relkind='r' AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'A governance table does not have RLS enabled'; END IF;

  PERFORM public.sdd_register_spec_version(v_spec_id,'Smoke test SPEC',1,v_hash,
    ARRAY['specs/'||v_spec_id||'/spec.md'],ARRAY[]::text[],
    jsonb_build_object('documents',jsonb_build_object('spec.md','# Smoke test')),
    'sdd-smoke',v_spec_key);
  IF public.sdd_register_spec_version(v_spec_id,'Smoke test SPEC',1,v_hash,
    ARRAY['specs/'||v_spec_id||'/spec.md'],ARRAY[]::text[],
    jsonb_build_object('documents',jsonb_build_object('spec.md','# Smoke test')),
    'sdd-smoke',v_spec_key) IS NULL THEN
    RAISE EXCEPTION 'SPEC version idempotent replay failed';
  END IF;

  v_create := public.sdd_create_batch('SDD rollback smoke test',
    jsonb_build_array(jsonb_build_object('spec_id',v_spec_id,'version',1,'position',1)),
    'sdd-smoke',v_batch_key);
  v_batch_id := (v_create->>'batch_id')::uuid;
  v_manifest_hash := v_create->>'manifest_hash';
  v_repeat := public.sdd_create_batch('SDD rollback smoke test',
    jsonb_build_array(jsonb_build_object('spec_id',v_spec_id,'version',1,'position',1)),
    'sdd-smoke',v_batch_key);
  IF (v_repeat->>'batch_id')::uuid <> v_batch_id
     OR v_repeat->>'state' <> 'READY_FOR_APPROVAL' THEN
    RAISE EXCEPTION 'Batch creation idempotency did not preserve the original batch';
  END IF;
  BEGIN
    PERFORM public.sdd_create_batch('Different batch name',
      jsonb_build_array(jsonb_build_object('spec_id',v_spec_id,'version',1,'position',1)),
      'sdd-smoke',v_batch_key);
  EXCEPTION WHEN OTHERS THEN
    v_batch_key_collision_rejected := true;
  END;
  IF NOT v_batch_key_collision_rejected THEN
    RAISE EXCEPTION 'Batch idempotency key reuse with a different request was accepted';
  END IF;
  v_result := public.sdd_validate_batch(v_batch_id);
  IF NOT (v_result->>'valid')::boolean THEN RAISE EXCEPTION 'Manifest validation failed'; END IF;

  v_result := public.sdd_approve_batch(v_batch_id,v_manifest_hash,'sdd-smoke',
    'APROVAR '||v_batch_id::text||' '||v_manifest_hash,gen_random_uuid());
  IF v_result->>'state' <> 'APPROVED' THEN RAISE EXCEPTION 'Approval did not transition the batch'; END IF;

  v_result := public.sdd_claim_batch(v_batch_id,'sdd-smoke-runner',gen_random_uuid());
  v_lease := (v_result->>'lease_token')::uuid;
  v_result := public.sdd_start_next_spec(v_batch_id,v_lease,'sdd-smoke-runner');
  v_run_id := (v_result->>'run_id')::uuid;
  IF v_result->>'spec_id' <> v_spec_id THEN RAISE EXCEPTION 'Unexpected next SPEC'; END IF;

  BEGIN
    PERFORM public.sdd_record_task(v_run_id,gen_random_uuid(),'sdd-smoke-runner','wrong-lease',
      'Must be rejected','PENDING',NULL,NULL,ARRAY[]::text[],'{}'::jsonb,'sdd-smoke');
  EXCEPTION WHEN OTHERS THEN
    v_wrong_lease_rejected := true;
  END;
  IF NOT v_wrong_lease_rejected THEN RAISE EXCEPTION 'A write without the active lease was accepted'; END IF;

  v_task_id := public.sdd_record_task(v_run_id,v_lease,'sdd-smoke-runner','db-smoke',
    'Governance persistence check','PENDING','sdd_qa_tests','worker-1',
    ARRAY['supabase/tests/sdd_governance_smoke.sql'],'{}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_task(v_run_id,v_lease,'sdd-smoke-runner','db-smoke',
    'Governance persistence check','RUNNING','sdd_qa_tests','worker-1',
    ARRAY['supabase/tests/sdd_governance_smoke.sql'],'{}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_task(v_run_id,v_lease,'sdd-smoke-runner','db-smoke',
    'Governance persistence check','COMPLETED','sdd_qa_tests','worker-1',
    ARRAY['supabase/tests/sdd_governance_smoke.sql'],'{"result":"passed"}'::jsonb,'sdd-smoke');

  v_gate_id := public.sdd_record_gate(v_run_id,v_lease,'sdd-smoke-runner','smoke',true,
    'PASSED','transactional SDD smoke test',0,'{"isolated":true}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_save_checkpoint(v_run_id,v_lease,'sdd-smoke-runner',1,
    jsonb_build_object('task_id',v_task_id,'gate_id',v_gate_id),'sdd-smoke');

  v_failure_id := public.sdd_open_failure(v_run_id,v_lease,'sdd-smoke-runner',v_task_id,
    'smoke-correction-window','Test overlapping correction windows','Synthetic test diagnosis','sdd-smoke');
  v_attempt := public.sdd_begin_correction(v_failure_id,v_lease,'sdd-smoke-runner',
    'Measure unioned windows','sdd-smoke',gen_random_uuid());
  v_attempt_id := (v_attempt->>'correction_attempt_id')::uuid;
  v_window_a := public.sdd_open_fix_window(v_attempt_id,v_lease,'sdd-smoke-runner','sdd_qa_tests','worker-a',gen_random_uuid());
  v_window_b := public.sdd_open_fix_window(v_attempt_id,v_lease,'sdd-smoke-runner','sdd_backend_api','worker-b',gen_random_uuid());
  v_base := clock_timestamp()-interval '5 minutes';
  UPDATE sdd.fix_windows SET started_at=v_base, ended_at=v_base+interval '60 seconds', worker_seconds=60
    WHERE fix_window_id=v_window_a;
  UPDATE sdd.fix_windows SET started_at=v_base+interval '30 seconds', ended_at=v_base+interval '90 seconds', worker_seconds=60
    WHERE fix_window_id=v_window_b;
  v_elapsed := sdd.fix_elapsed_seconds(v_batch_id,v_spec_id);
  v_worker := sdd.worker_seconds(v_batch_id,v_spec_id);
  IF v_elapsed <> 90 OR v_worker <> 120 THEN
    RAISE EXCEPTION 'Overlapping-window accounting is incorrect: elapsed %, worker %',v_elapsed,v_worker;
  END IF;
  PERFORM public.sdd_close_fix_window(v_window_a,v_lease,'sdd-smoke-runner');
  PERFORM public.sdd_close_fix_window(v_window_b,v_lease,'sdd-smoke-runner');
  PERFORM public.sdd_finish_correction(v_attempt_id,v_lease,'sdd-smoke-runner','RESOLVED',
    '{"verification":"unioned windows"}'::jsonb,'sdd-smoke');
  v_result := public.sdd_finish_correction(v_attempt_id,v_lease,'sdd-smoke-runner','RESOLVED',
    '{"verification":"unioned windows"}'::jsonb,'sdd-smoke');
  IF NOT COALESCE((v_result->>'idempotent_replay')::boolean,false) THEN
    RAISE EXCEPTION 'Correction completion replay was not idempotent';
  END IF;

  v_failure_id := public.sdd_open_failure(v_run_id,v_lease,'sdd-smoke-runner',v_task_id,
    'smoke-attempt-limit','Test five-attempt pause','Synthetic retry diagnosis','sdd-smoke');
  FOR v_attempt_no IN 1..5 LOOP
    v_attempt := public.sdd_begin_correction(v_failure_id,v_lease,'sdd-smoke-runner',
      'Attempt '||v_attempt_no,'sdd-smoke',gen_random_uuid());
    IF COALESCE((v_attempt->>'blocked')::boolean,false) THEN RAISE EXCEPTION 'Correction blocked before attempt %',v_attempt_no; END IF;
    v_attempt_id := (v_attempt->>'correction_attempt_id')::uuid;
    v_result := public.sdd_finish_correction(v_attempt_id,v_lease,'sdd-smoke-runner','UNRESOLVED',
      jsonb_build_object('attempt',v_attempt_no),'sdd-smoke');
  END LOOP;
  SELECT state INTO v_state FROM sdd.batches WHERE batch_id=v_batch_id;
  IF v_state <> 'PAUSED' THEN RAISE EXCEPTION 'Fifth unresolved attempt did not pause the batch'; END IF;
  IF has_function_privilege('service_role','public.sdd_extend_limits(uuid,text,integer,integer,text,text,text,uuid)','EXECUTE')
     OR has_function_privilege('service_role','public.sdd_resume_batch(uuid,text,text,text,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Runner role can perform a privileged limit extension or resume';
  END IF;

  v_result := public.sdd_extend_limits(v_batch_id,v_spec_id,1,0,'sdd-smoke','Test additive extension',
    format('ESTENDER %s %s 1 0',v_batch_id,v_spec_id),v_limits_key);
  v_more := public.sdd_extend_limits(v_batch_id,v_spec_id,1,0,'sdd-smoke','Test additive extension',
    format('ESTENDER %s %s 1 0',v_batch_id,v_spec_id),v_limits_key);
  IF (v_result->>'max_attempts')::integer <> 6
     OR NOT COALESCE((v_more->>'idempotent_replay')::boolean,false) THEN
    RAISE EXCEPTION 'Limit extension or its replay is incorrect';
  END IF;

  v_resume := public.sdd_resume_batch(v_batch_id,'sdd-smoke','Test explicit recovery',
    'RETOMAR '||v_batch_id::text||' '||v_manifest_hash,'sdd-smoke-runner',v_resume_key);
  v_lease := (v_resume->>'lease_token')::uuid;
  v_more := public.sdd_resume_batch(v_batch_id,'sdd-smoke','Test explicit recovery',
    'RETOMAR '||v_batch_id::text||' '||v_manifest_hash,'sdd-smoke-runner',v_resume_key);
  IF NOT COALESCE((v_more->>'idempotent_replay')::boolean,false) THEN
    RAISE EXCEPTION 'Resume replay was not idempotent';
  END IF;

  v_attempt := public.sdd_begin_correction(v_failure_id,v_lease,'sdd-smoke-runner',
    'Authorized additional attempt','sdd-smoke',gen_random_uuid());
  v_attempt_id := (v_attempt->>'correction_attempt_id')::uuid;
  v_window_a := public.sdd_open_fix_window(v_attempt_id,v_lease,'sdd-smoke-runner','sdd_orchestrator','coordinator',gen_random_uuid());
  PERFORM pg_sleep(0.01);
  PERFORM public.sdd_close_fix_window(v_window_a,v_lease,'sdd-smoke-runner');
  PERFORM public.sdd_finish_correction(v_attempt_id,v_lease,'sdd-smoke-runner','RESOLVED',
    '{"verification":"limit extension"}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_gate(v_run_id,v_lease,'sdd-smoke-runner','smoke',true,
    'PASSED','transactional SDD smoke test',0,'{"isolated":true}'::jsonb,'sdd-smoke');

  v_result := public.sdd_complete_spec(v_run_id,v_lease,'sdd-smoke-runner','Smoke test passed','sdd-smoke');
  IF v_result->>'state' <> 'COMPLETED' THEN RAISE EXCEPTION 'SPEC or final batch did not complete'; END IF;
  v_more := public.sdd_complete_spec(v_run_id,v_lease,'sdd-smoke-runner','Smoke test passed','sdd-smoke');
  IF NOT COALESCE((v_more->>'idempotent_replay')::boolean,false) THEN
    RAISE EXCEPTION 'Completed SPEC replay was not idempotent';
  END IF;

  -- Verify a dependent second SPEC cannot run before its prerequisite and that
  -- the batch advances only after the first SPEC has passed its gates.
  PERFORM public.sdd_register_spec_version(v_seq_spec_first,'Sequential SPEC one',1,repeat('c',64),
    ARRAY['specs/'||v_seq_spec_first||'/spec.md'],ARRAY[]::text[],
    jsonb_build_object('documents',jsonb_build_object('spec.md','# Sequential SPEC one')),
    'sdd-smoke',gen_random_uuid());
  PERFORM public.sdd_register_spec_version(v_seq_spec_second,'Sequential SPEC two',1,repeat('d',64),
    ARRAY['specs/'||v_seq_spec_second||'/spec.md'],ARRAY[v_seq_spec_first],
    jsonb_build_object('documents',jsonb_build_object('spec.md','# Sequential SPEC two')),
    'sdd-smoke',gen_random_uuid());
  BEGIN
    PERFORM public.sdd_create_batch('SDD invalid dependency order smoke test',
      jsonb_build_array(
        jsonb_build_object('spec_id',v_seq_spec_second,'version',1,'position',1),
        jsonb_build_object('spec_id',v_seq_spec_first,'version',1,'position',2)
      ),'sdd-smoke',gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_seq_order_rejected := true;
  END;
  IF NOT v_seq_order_rejected THEN RAISE EXCEPTION 'Out-of-order dependent SPECs were accepted'; END IF;

  v_seq_result := public.sdd_create_batch('SDD sequential SPEC smoke test',
    jsonb_build_array(
      jsonb_build_object('spec_id',v_seq_spec_first,'version',1,'position',1),
      jsonb_build_object('spec_id',v_seq_spec_second,'version',1,'position',2)
    ),'sdd-smoke',gen_random_uuid());
  v_seq_batch_id := (v_seq_result->>'batch_id')::uuid;
  v_seq_manifest_hash := v_seq_result->>'manifest_hash';
  PERFORM public.sdd_approve_batch(v_seq_batch_id,v_seq_manifest_hash,'sdd-smoke',
    'APROVAR '||v_seq_batch_id::text||' '||v_seq_manifest_hash,gen_random_uuid());
  v_seq_result := public.sdd_claim_batch(v_seq_batch_id,'sdd-smoke-sequential',gen_random_uuid());
  v_seq_lease := (v_seq_result->>'lease_token')::uuid;
  v_seq_result := public.sdd_start_next_spec(v_seq_batch_id,v_seq_lease,'sdd-smoke-sequential');
  IF v_seq_result->>'spec_id' <> v_seq_spec_first THEN
    RAISE EXCEPTION 'The batch did not start with the first SPEC in manifest order';
  END IF;
  v_seq_run_id := (v_seq_result->>'run_id')::uuid;
  v_seq_task_id := public.sdd_record_task(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-first-task',
    'First sequential SPEC task','PENDING',NULL,NULL,ARRAY[]::text[],'{}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_task(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-first-task',
    'First sequential SPEC task','RUNNING',NULL,NULL,ARRAY[]::text[],'{}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_task(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-first-task',
    'First sequential SPEC task','COMPLETED',NULL,NULL,ARRAY[]::text[],'{"result":"passed"}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_gate(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-first-gate',true,
    'PASSED','First SPEC smoke gate',0,'{"isolated":true}'::jsonb,'sdd-smoke');
  v_seq_result := public.sdd_complete_spec(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential',
    'First sequential SPEC passed','sdd-smoke');
  IF v_seq_result->>'state' <> 'RUNNING' OR (v_seq_result->>'remaining_specs')::integer <> 1 THEN
    RAISE EXCEPTION 'The batch did not remain running with exactly one SPEC queued';
  END IF;
  v_seq_result := public.sdd_start_next_spec(v_seq_batch_id,v_seq_lease,'sdd-smoke-sequential');
  IF v_seq_result->>'spec_id' <> v_seq_spec_second THEN
    RAISE EXCEPTION 'The next SPEC did not follow the authorized manifest order';
  END IF;
  v_seq_run_id := (v_seq_result->>'run_id')::uuid;
  v_seq_task_id := public.sdd_record_task(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-second-task',
    'Second sequential SPEC task','PENDING',NULL,NULL,ARRAY[]::text[],'{}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_task(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-second-task',
    'Second sequential SPEC task','RUNNING',NULL,NULL,ARRAY[]::text[],'{}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_task(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-second-task',
    'Second sequential SPEC task','COMPLETED',NULL,NULL,ARRAY[]::text[],'{"result":"passed"}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_gate(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential','seq-second-gate',true,
    'PASSED','Second SPEC smoke gate',0,'{"isolated":true}'::jsonb,'sdd-smoke');
  v_seq_result := public.sdd_complete_spec(v_seq_run_id,v_seq_lease,'sdd-smoke-sequential',
    'Second sequential SPEC passed','sdd-smoke');
  IF v_seq_result->>'state' <> 'COMPLETED' THEN
    RAISE EXCEPTION 'The ordered two-SPEC batch did not complete';
  END IF;

  -- A second isolated batch simulates process loss. The open correction window
  -- ends at the expired lease timestamp, not at the later recovery call.
  PERFORM public.sdd_register_spec_version(v_recovery_spec_id,'Recovery smoke test',1,repeat('b',64),
    ARRAY['specs/'||v_recovery_spec_id||'/spec.md'],ARRAY[]::text[],
    jsonb_build_object('documents',jsonb_build_object('spec.md','# Recovery smoke test')),
    'sdd-smoke',v_recovery_spec_key);
  v_result := public.sdd_create_batch('SDD interruption recovery smoke test',
    jsonb_build_array(jsonb_build_object('spec_id',v_recovery_spec_id,'version',1,'position',1)),
    'sdd-smoke',v_recovery_batch_key);
  v_recovery_batch_id := (v_result->>'batch_id')::uuid;
  v_recovery_manifest_hash := v_result->>'manifest_hash';
  v_result := public.sdd_approve_batch(v_recovery_batch_id,v_recovery_manifest_hash,'sdd-smoke',
    'APROVAR '||v_recovery_batch_id::text||' '||v_recovery_manifest_hash,gen_random_uuid());
  v_result := public.sdd_claim_batch(v_recovery_batch_id,'sdd-smoke-recovery',gen_random_uuid());
  v_recovery_lease := (v_result->>'lease_token')::uuid;
  v_result := public.sdd_start_next_spec(v_recovery_batch_id,v_recovery_lease,'sdd-smoke-recovery');
  v_recovery_run_id := (v_result->>'run_id')::uuid;
  v_recovery_task_id := public.sdd_record_task(v_recovery_run_id,v_recovery_lease,'sdd-smoke-recovery',
    'recovery-task','Recovery persistence check','COMPLETED',NULL,NULL,ARRAY[]::text[],
    '{"result":"persisted"}'::jsonb,'sdd-smoke');
  v_recovery_failure_id := public.sdd_open_failure(v_recovery_run_id,v_recovery_lease,'sdd-smoke-recovery',
    v_recovery_task_id,'recovery-failure','Simulated runner interruption','Synthetic recovery test','sdd-smoke');
  v_attempt := public.sdd_begin_correction(v_recovery_failure_id,v_recovery_lease,'sdd-smoke-recovery',
    'Open a correction window before simulating interruption','sdd-smoke',gen_random_uuid());
  v_recovery_attempt_id := (v_attempt->>'correction_attempt_id')::uuid;
  v_recovery_window_id := public.sdd_open_fix_window(v_recovery_attempt_id,v_recovery_lease,
    'sdd-smoke-recovery','sdd_qa_tests','recovery-worker',gen_random_uuid());
  v_base := clock_timestamp();
  UPDATE sdd.fix_windows SET started_at=v_base-interval '122 minutes'
    WHERE fix_window_id=v_recovery_window_id;
  UPDATE sdd.execution_leases SET acquired_at=v_base-interval '20 minutes',
    heartbeat_at=v_base-interval '3 minutes',expires_at=v_base-interval '2 minutes'
    WHERE batch_id=v_recovery_batch_id;

  v_recovery_result := public.sdd_recover_interrupted(v_recovery_batch_id,'sdd-smoke-recovery');
  SELECT ended_at,worker_seconds INTO v_recovery_ended_at,v_recovery_worker_seconds
  FROM sdd.fix_windows WHERE fix_window_id=v_recovery_window_id;
  SELECT state INTO v_state FROM sdd.batches WHERE batch_id=v_recovery_batch_id;
  IF v_state <> 'PAUSED'
     OR v_recovery_result->>'state' <> 'PAUSED'
     OR NOT COALESCE((v_recovery_result->>'resume_requires_user_authorization')::boolean,false)
     OR v_recovery_ended_at <> v_base-interval '2 minutes'
     OR v_recovery_result->>'blocked_spec_id' <> v_recovery_spec_id
     OR v_recovery_worker_seconds <> 7200
     OR sdd.fix_elapsed_seconds(v_recovery_batch_id,v_recovery_spec_id) <> 7200
     OR EXISTS (SELECT 1 FROM sdd.execution_leases WHERE batch_id=v_recovery_batch_id) THEN
    RAISE EXCEPTION 'Interruption recovery did not pause safely at the expired lease boundary';
  END IF;
  IF (SELECT state FROM sdd.correction_attempts WHERE correction_attempt_id=v_recovery_attempt_id) <> 'INTERRUPTED'
     OR (SELECT COUNT(*) FROM sdd.correction_attempts WHERE failure_id=v_recovery_failure_id) <> 1 THEN
    RAISE EXCEPTION 'Recovery did not preserve the correction attempt';
  END IF;

  BEGIN
    PERFORM public.sdd_resume_batch(v_recovery_batch_id,'sdd-smoke','Unauthorized resume attempt',
      'incorrect confirmation','sdd-smoke-recovery',gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_bad_resume_rejected := true;
  END;
  IF NOT v_bad_resume_rejected
     OR (SELECT state FROM sdd.batches WHERE batch_id=v_recovery_batch_id) <> 'PAUSED'
     OR EXISTS (SELECT 1 FROM sdd.authorizations WHERE batch_id=v_recovery_batch_id
       AND authorization_type='RESUME') THEN
    RAISE EXCEPTION 'Recovery allowed a resume without explicit authorization';
  END IF;

  v_result := public.sdd_extend_limits(v_recovery_batch_id,v_recovery_spec_id,0,60,'sdd-smoke',
    'Authorize a short correction-time extension',
    format('ESTENDER %s %s 0 60',v_recovery_batch_id,v_recovery_spec_id),v_recovery_limits_key);
  v_more := public.sdd_extend_limits(v_recovery_batch_id,v_recovery_spec_id,0,60,'sdd-smoke',
    'Authorize a short correction-time extension',
    format('ESTENDER %s %s 0 60',v_recovery_batch_id,v_recovery_spec_id),v_recovery_limits_key);
  IF (v_result->>'max_seconds')::bigint <> 7260
     OR NOT COALESCE((v_more->>'idempotent_replay')::boolean,false)
     OR sdd.fix_elapsed_seconds(v_recovery_batch_id,v_recovery_spec_id) <> 7200 THEN
    RAISE EXCEPTION 'Time extension reset counters or did not add the authorized seconds';
  END IF;

  v_resume := public.sdd_resume_batch(v_recovery_batch_id,'sdd-smoke','Resume after explicit time extension',
    'RETOMAR '||v_recovery_batch_id::text||' '||v_recovery_manifest_hash,
    'sdd-smoke-recovery',v_recovery_resume_key);
  v_recovery_lease := (v_resume->>'lease_token')::uuid;
  v_more := public.sdd_resume_batch(v_recovery_batch_id,'sdd-smoke','Resume after explicit time extension',
    'RETOMAR '||v_recovery_batch_id::text||' '||v_recovery_manifest_hash,
    'sdd-smoke-recovery',v_recovery_resume_key);
  IF NOT COALESCE((v_more->>'idempotent_replay')::boolean,false) THEN
    RAISE EXCEPTION 'Authorized time-limit resume was not idempotent';
  END IF;

  v_attempt := public.sdd_begin_correction(v_recovery_failure_id,v_recovery_lease,'sdd-smoke-recovery',
    'Correct after an explicitly authorized time extension','sdd-smoke',gen_random_uuid());
  IF COALESCE((v_attempt->>'blocked')::boolean,false)
     OR (v_attempt->>'attempt_number')::integer <> 2 THEN
    RAISE EXCEPTION 'Time extension did not preserve attempts and allow the next correction';
  END IF;
  v_recovery_attempt_id := (v_attempt->>'correction_attempt_id')::uuid;
  v_recovery_window_id := public.sdd_open_fix_window(v_recovery_attempt_id,v_recovery_lease,
    'sdd-smoke-recovery','sdd_orchestrator','recovery-coordinator',gen_random_uuid());
  PERFORM pg_sleep(0.01);
  PERFORM public.sdd_close_fix_window(v_recovery_window_id,v_recovery_lease,'sdd-smoke-recovery');
  PERFORM public.sdd_finish_correction(v_recovery_attempt_id,v_recovery_lease,'sdd-smoke-recovery','RESOLVED',
    '{"verification":"authorized time extension"}'::jsonb,'sdd-smoke');
  PERFORM public.sdd_record_gate(v_recovery_run_id,v_recovery_lease,'sdd-smoke-recovery','recovery-gate',true,
    'PASSED','Recovery and time extension smoke gate',0,'{"isolated":true}'::jsonb,'sdd-smoke');
  v_result := public.sdd_complete_spec(v_recovery_run_id,v_recovery_lease,'sdd-smoke-recovery',
    'Recovery and authorized time extension passed','sdd-smoke');
  IF v_result->>'state' <> 'COMPLETED'
     OR (SELECT COUNT(*) FROM sdd.correction_attempts WHERE failure_id=v_recovery_failure_id) <> 2
     OR sdd.fix_elapsed_seconds(v_recovery_batch_id,v_recovery_spec_id) < 7200 THEN
    RAISE EXCEPTION 'Time extension completion failed or reset correction history';
  END IF;
END;
$sdd_smoke$;

ROLLBACK;
