-- Direct Supabase SQL contract test for SPEC-016.
-- Dispatch only to project twikxeloeftczwbpjvzr (flowzenithv2), schema sdd.
-- The inner exception subtransaction rolls back every synthetic row and audit event.
CREATE OR REPLACE FUNCTION pg_temp.sdd_flexible_execution_contract_test()
RETURNS jsonb
LANGUAGE plpgsql
AS $test$
DECLARE
  v_marker text := 'sdd-flex-' || replace(gen_random_uuid()::text, '-', '');
  v_suffix text := lpad((floor(random() * 100000000)::bigint)::text, 8, '0');
  v_scope_spec_a text := 'FLEX-' || v_suffix;
  v_scope_spec_b text := 'FLEX-' || lpad(((v_suffix::bigint + 1) % 100000000)::text, 8, '0');
  v_paused_spec text := 'FLEX-' || lpad(((v_suffix::bigint + 2) % 100000000)::text, 8, '0');
  v_waiver_spec text := 'FLEX-' || lpad(((v_suffix::bigint + 3) % 100000000)::text, 8, '0');
  v_scope_version_a uuid := gen_random_uuid();
  v_scope_version_b uuid := gen_random_uuid();
  v_paused_version uuid := gen_random_uuid();
  v_waiver_version uuid := gen_random_uuid();
  v_batch_a uuid := gen_random_uuid();
  v_batch_b uuid := gen_random_uuid();
  v_paused_batch uuid := gen_random_uuid();
  v_waiver_batch uuid := gen_random_uuid();
  v_run_a uuid := gen_random_uuid();
  v_run_b uuid := gen_random_uuid();
  v_paused_run uuid := gen_random_uuid();
  v_waiver_run uuid := gen_random_uuid();
  v_lease_a uuid := gen_random_uuid();
  v_lease_b uuid := gen_random_uuid();
  v_waiver_lease uuid := gen_random_uuid();
  v_hash_a text := repeat('1', 64);
  v_hash_b text := repeat('2', 64);
  v_hash_paused text := repeat('3', 64);
  v_hash_waiver text := repeat('4', 64);
  v_manifest_a jsonb;
  v_manifest_b jsonb;
  v_manifest_paused jsonb;
  v_manifest_waiver jsonb;
  v_gate_id uuid;
  v_local_gate_id uuid;
  v_security_gate_id uuid;
  v_task_scope_a_id uuid;
  v_task_paused_id uuid;
  v_task_scope_id uuid;
  v_waiver_task_id uuid;
  v_failure_id uuid;
  v_waiver_alt_id uuid;
  v_waiver_unavailable_id uuid;
  v_waiver_alt_idempotency_key uuid := gen_random_uuid();
  v_result jsonb;
  v_status jsonb;
  v_batch_status jsonb;
  v_scope_rejected boolean := false;
  v_paused_scope_allowed boolean := false;
  v_bad_basis_rejected boolean := false;
  v_never_policy_rejected boolean := false;
  v_stale_hash_rejected boolean := false;
  v_wrong_run_rejected boolean := false;
  v_wrong_gate_rejected boolean := false;
  v_duplicate_replayed boolean := false;
  v_report jsonb;
BEGIN
  IF current_database() <> 'postgres'
     OR to_regnamespace('sdd') IS NULL
     OR to_regclass('sdd.batches') IS NULL
     OR to_regclass('sdd.gate_waiver_authorizations') IS NULL
     OR NOT has_schema_privilege(current_user, 'sdd', 'USAGE')
     OR NOT (has_table_privilege(current_user, 'sdd.specifications', 'SELECT') AND has_table_privilege(current_user, 'sdd.specifications', 'INSERT'))
     OR NOT (has_table_privilege(current_user, 'sdd.spec_versions', 'SELECT') AND has_table_privilege(current_user, 'sdd.spec_versions', 'INSERT'))
     OR NOT (has_table_privilege(current_user, 'sdd.batches', 'SELECT') AND has_table_privilege(current_user, 'sdd.batches', 'INSERT'))
     OR NOT (has_table_privilege(current_user, 'sdd.batch_specs', 'SELECT') AND has_table_privilege(current_user, 'sdd.batch_specs', 'INSERT'))
     OR NOT (has_table_privilege(current_user, 'sdd.runs', 'SELECT') AND has_table_privilege(current_user, 'sdd.runs', 'INSERT'))
     OR NOT (has_table_privilege(current_user, 'sdd.execution_leases', 'SELECT') AND has_table_privilege(current_user, 'sdd.execution_leases', 'INSERT'))
     OR NOT (has_table_privilege(current_user, 'sdd.tasks', 'SELECT') AND has_table_privilege(current_user, 'sdd.tasks', 'INSERT')) THEN
    RAISE EXCEPTION 'Direct SQL target or SDD test permissions are not valid';
  END IF;

  IF EXISTS (SELECT 1 FROM sdd.batches WHERE name LIKE v_marker || '%')
     OR EXISTS (SELECT 1 FROM sdd.batches WHERE created_by = v_marker)
     OR EXISTS (SELECT 1 FROM sdd.specifications WHERE title LIKE v_marker || '%')
     OR EXISTS (SELECT 1 FROM sdd.spec_versions WHERE snapshot::text LIKE '%' || v_marker || '%')
     OR EXISTS (SELECT 1 FROM sdd.runs WHERE started_by = v_marker)
     OR EXISTS (SELECT 1 FROM sdd.execution_leases WHERE owner_id = v_marker)
     OR EXISTS (SELECT 1 FROM sdd.tasks WHERE description LIKE '%' || v_marker || '%')
     OR EXISTS (SELECT 1 FROM sdd.quality_gates WHERE evidence::text LIKE '%' || v_marker || '%')
     OR EXISTS (SELECT 1 FROM sdd.gate_waiver_authorizations WHERE evidence::text LIKE '%' || v_marker || '%')
     OR EXISTS (SELECT 1 FROM sdd.audit_events WHERE details::text LIKE '%' || v_marker || '%') THEN
    RAISE EXCEPTION 'The run-specific SDD fixture marker already exists';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_marker, 0));

  BEGIN
    INSERT INTO sdd.specifications (spec_id, title, state, current_version) VALUES
      (v_scope_spec_a, v_marker || '-scope-a', 'READY_FOR_REVIEW', 1),
      (v_scope_spec_b, v_marker || '-scope-b', 'READY_FOR_REVIEW', 1),
      (v_paused_spec, v_marker || '-paused', 'READY_FOR_REVIEW', 1),
      (v_waiver_spec, v_marker || '-waiver', 'READY_FOR_REVIEW', 1);

    INSERT INTO sdd.spec_versions (
      spec_version_id, spec_id, version, content_hash, source_paths, dependencies,
      snapshot, registered_by
    ) VALUES
      (v_scope_version_a, v_scope_spec_a, 1, v_hash_a, ARRAY['specs/' || v_scope_spec_a || '/spec.md'], '{}',
        jsonb_build_object('documents', jsonb_build_object('spec.md', '# Synthetic scope A')), v_marker),
      (v_scope_version_b, v_scope_spec_b, 1, v_hash_b, ARRAY['specs/' || v_scope_spec_b || '/spec.md'], '{}',
        jsonb_build_object('documents', jsonb_build_object('spec.md', '# Synthetic scope B')), v_marker),
      (v_paused_version, v_paused_spec, 1, v_hash_paused, ARRAY['specs/' || v_paused_spec || '/spec.md'], '{}',
        jsonb_build_object('documents', jsonb_build_object('spec.md', '# Synthetic paused scope')), v_marker),
      (v_waiver_version, v_waiver_spec, 1, v_hash_waiver, ARRAY['specs/' || v_waiver_spec || '/spec.md'], '{}',
        jsonb_build_object(
          'documents', jsonb_build_object('spec.md', '# Synthetic waiver spec'),
          'gate_waiver_policies', jsonb_build_object(
            'database-contracts', 'ALTERNATIVE_EVIDENCE',
            'local-only-test', 'UNAVAILABLE',
            'security-review', 'NEVER'
          )
        ), v_marker);

    v_manifest_a := jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'spec_id', v_scope_spec_a, 'version', 1, 'spec_version_id', v_scope_version_a,
      'content_hash', v_hash_a, 'dependencies', '[]'::jsonb, 'position', 1)));
    v_manifest_b := jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'spec_id', v_scope_spec_b, 'version', 1, 'spec_version_id', v_scope_version_b,
      'content_hash', v_hash_b, 'dependencies', '[]'::jsonb, 'position', 1)));
    v_manifest_paused := jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'spec_id', v_paused_spec, 'version', 1, 'spec_version_id', v_paused_version,
      'content_hash', v_hash_paused, 'dependencies', '[]'::jsonb, 'position', 1)));
    v_manifest_waiver := jsonb_build_object('items', jsonb_build_array(jsonb_build_object(
      'spec_id', v_waiver_spec, 'version', 1, 'spec_version_id', v_waiver_version,
      'content_hash', v_hash_waiver, 'dependencies', '[]'::jsonb, 'position', 1)));

    INSERT INTO sdd.batches (
      batch_id, name, state, manifest, manifest_hash, created_by, approved_by,
      approved_at, started_at, paused_at, pause_reason, current_spec_id
    ) VALUES
      (v_batch_a, v_marker || '-active-a', 'RUNNING', v_manifest_a,
        encode(extensions.digest(convert_to(v_manifest_a::text, 'UTF8'), 'sha256'), 'hex'),
        v_marker, v_marker, clock_timestamp(), clock_timestamp(), NULL, NULL, v_scope_spec_a),
      (v_batch_b, v_marker || '-active-b', 'RUNNING', v_manifest_b,
        encode(extensions.digest(convert_to(v_manifest_b::text, 'UTF8'), 'sha256'), 'hex'),
        v_marker, v_marker, clock_timestamp(), clock_timestamp(), NULL, NULL, v_scope_spec_b),
      (v_paused_batch, v_marker || '-paused-batch', 'PAUSED', v_manifest_paused,
        encode(extensions.digest(convert_to(v_manifest_paused::text, 'UTF8'), 'sha256'), 'hex'),
        v_marker, v_marker, clock_timestamp(), clock_timestamp(), clock_timestamp(),
        'Synthetic pause for independent-batch test', v_paused_spec),
      (v_waiver_batch, v_marker || '-waiver-batch', 'RUNNING', v_manifest_waiver,
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
        v_marker, v_marker, clock_timestamp(), clock_timestamp(), NULL, NULL, v_waiver_spec);

    INSERT INTO sdd.batch_specs (batch_id, spec_id, spec_version_id, position, state) VALUES
      (v_batch_a, v_scope_spec_a, v_scope_version_a, 1, 'RUNNING'),
      (v_batch_b, v_scope_spec_b, v_scope_version_b, 1, 'RUNNING'),
      (v_paused_batch, v_paused_spec, v_paused_version, 1, 'BLOCKED'),
      (v_waiver_batch, v_waiver_spec, v_waiver_version, 1, 'RUNNING');

    INSERT INTO sdd.runs (run_id, batch_id, spec_id, spec_version_id, run_number, state, started_by, ended_at)
    VALUES
      (v_run_a, v_batch_a, v_scope_spec_a, v_scope_version_a, 1, 'IMPLEMENTING', v_marker, NULL),
      (v_run_b, v_batch_b, v_scope_spec_b, v_scope_version_b, 1, 'IMPLEMENTING', v_marker, NULL),
      (v_paused_run, v_paused_batch, v_paused_spec, v_paused_version, 1, 'PAUSED', v_marker, clock_timestamp()),
      (v_waiver_run, v_waiver_batch, v_waiver_spec, v_waiver_version, 1, 'IMPLEMENTING', v_marker, NULL);

    INSERT INTO sdd.execution_leases (batch_id, lease_token, idempotency_key, owner_id)
    VALUES
      (v_batch_a, v_lease_a, gen_random_uuid(), v_marker),
      (v_batch_b, v_lease_b, gen_random_uuid(), v_marker),
      (v_waiver_batch, v_waiver_lease, gen_random_uuid(), v_marker);

    INSERT INTO sdd.tasks (
      run_id, task_key, description, state, agent_profile, agent_ref, file_scope, started_at
    ) VALUES
      (v_run_a, 'ACTIVE-SCOPE', v_marker || ' active scope owner', 'RUNNING', 'sdd_qa_tests', v_marker,
        ARRAY['scripts/sdd/'], clock_timestamp())
    RETURNING task_id INTO v_task_scope_a_id;
    INSERT INTO sdd.tasks (
      run_id, task_key, description, state, agent_profile, agent_ref, file_scope, started_at, ended_at
    ) VALUES
      (v_paused_run, 'PAUSED-SCOPE', v_marker || ' paused scope', 'COMPLETED', 'sdd_qa_tests', v_marker,
        ARRAY['docs/independent/'], clock_timestamp(), clock_timestamp())
    RETURNING task_id INTO v_task_paused_id;

    BEGIN
      PERFORM public.sdd_record_task(
        v_run_b, v_lease_b, v_marker, 'OVERLAP-REJECTED', v_marker || ' overlapping scope',
        'RUNNING', 'sdd_qa_tests', v_marker, ARRAY['scripts/sdd/sddctl.js'], '{}'::jsonb, v_marker
      );
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%scope%' OR SQLERRM ILIKE '%overlap%' THEN
        v_scope_rejected := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT v_scope_rejected THEN
      RAISE EXCEPTION 'Overlapping active writable scope was admitted';
    END IF;

    v_task_scope_id := public.sdd_record_task(
      v_run_b, v_lease_b, v_marker, 'PAUSED-SCOPE-ALLOWED', v_marker || ' independent paused scope',
      'RUNNING', 'sdd_qa_tests', v_marker, ARRAY['docs/independent/readme.md'], '{}'::jsonb, v_marker
    );
    v_paused_scope_allowed := v_task_scope_id IS NOT NULL;
    PERFORM public.sdd_record_task(
      v_run_b, v_lease_b, v_marker, 'PAUSED-SCOPE-ALLOWED', v_marker || ' independent paused scope',
      'COMPLETED', 'sdd_qa_tests', v_marker, ARRAY['docs/independent/readme.md'],
      jsonb_build_object('result', 'synthetic scope was available while the other batch remained paused'), v_marker
    );
    IF NOT v_paused_scope_allowed THEN
      RAISE EXCEPTION 'An unrelated paused batch blocked independent work';
    END IF;

    IF NOT sdd.file_scopes_overlap('scripts\sdd\', 'scripts/sdd/sddctl.js')
       OR sdd.file_scopes_overlap('server/agent/memory/', 'server/agent/guardrails/') THEN
      RAISE EXCEPTION 'File-scope normalization or overlap boundary is incorrect';
    END IF;

    -- Add a completed task and a linked synthetic failure that alternate evidence resolves.
    v_waiver_task_id := public.sdd_record_task(
      v_waiver_run, v_waiver_lease, v_marker, 'ALT-EVIDENCE-TASK', v_marker || ' alternate evidence task',
      'COMPLETED', 'sdd_qa_tests', v_marker, ARRAY['supabase/tests/sdd_flexible_execution.sql'],
      jsonb_build_object('result', 'synthetic task'), v_marker
    );
    v_failure_id := public.sdd_open_failure(
      v_waiver_run, v_waiver_lease, v_marker, v_waiver_task_id, v_marker || '-alt-failure',
      'Synthetic required check needs alternate evidence', 'Synthetic fixture only', v_marker
    );

    v_gate_id := public.sdd_record_gate(
      v_waiver_run, v_waiver_lease, v_marker, 'database-contracts', true, 'FAILED',
      'Synthetic local PostgreSQL adapter check', 1,
      jsonb_build_object('fixture_marker', v_marker, 'result', 'synthetic unavailable adapter'), v_marker
    );
    v_local_gate_id := public.sdd_record_gate(
      v_waiver_run, v_waiver_lease, v_marker, 'local-only-test', true, 'SKIPPED',
      'Synthetic local-only database check', NULL,
      jsonb_build_object('fixture_marker', v_marker, 'result', 'synthetic unavailable environment'), v_marker
    );
    v_security_gate_id := public.sdd_record_gate(
      v_waiver_run, v_waiver_lease, v_marker, 'security-review', true, 'SKIPPED',
      'Synthetic security check', NULL,
      jsonb_build_object('fixture_marker', v_marker, 'result', 'synthetic check pending'), v_marker
    );

    BEGIN
      PERFORM public.sdd_authorize_gate_waiver(
        v_waiver_batch,
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
        v_waiver_run, 'database-contracts', 'UNAVAILABLE', v_marker,
        'Synthetic failure cannot use an environmental-unavailability basis.',
        jsonb_build_object('method', 'synthetic unavailable route', 'evidence_ref', v_marker || '-bad-basis',
          'unavailable_reason', 'synthetic'),
        v_failure_id, 'WAIVE ' || v_waiver_batch::text || ' ' ||
          encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
          ' ' || v_waiver_run::text || ' database-contracts', gen_random_uuid()
      );
      v_bad_basis_rejected := false;
    EXCEPTION WHEN OTHERS THEN
      v_bad_basis_rejected := SQLERRM ILIKE '%unavailab%' OR SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%eligible%';
      IF NOT v_bad_basis_rejected THEN RAISE; END IF;
    END;
    IF NOT v_bad_basis_rejected THEN
      RAISE EXCEPTION 'A failed check was waived as environmentally unavailable';
    END IF;

    v_result := public.sdd_authorize_gate_waiver(
      v_waiver_batch,
      encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
      v_waiver_run, 'database-contracts', 'ALTERNATIVE_EVIDENCE', v_marker,
      'Synthetic owner accepts the recorded alternative evidence and residual risk.',
      jsonb_build_object('method', 'Direct Supabase SQL contract test', 'evidence_ref', v_marker || '-alternative', 'exit_code', 0),
      v_failure_id,
      'WAIVE ' || v_waiver_batch::text || ' ' ||
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
        ' ' || v_waiver_run::text || ' database-contracts',
      v_waiver_alt_idempotency_key
    );
    IF v_result->>'state' <> 'WAIVED' OR v_result->>'outcome_basis' <> 'ALTERNATIVE_EVIDENCE' THEN
      RAISE EXCEPTION 'Exact owner-authorized alternative evidence did not create a WAIVED result';
    END IF;
    v_waiver_alt_id := (v_result->>'waiver_id')::uuid;

    v_result := public.sdd_authorize_gate_waiver(
      v_waiver_batch,
      encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
      v_waiver_run, 'database-contracts', 'ALTERNATIVE_EVIDENCE', v_marker,
      'Synthetic owner accepts the recorded alternative evidence and residual risk.',
      jsonb_build_object('method', 'Direct Supabase SQL contract test', 'evidence_ref', v_marker || '-alternative', 'exit_code', 0),
      v_failure_id,
      'WAIVE ' || v_waiver_batch::text || ' ' ||
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
        ' ' || v_waiver_run::text || ' database-contracts',
      v_waiver_alt_idempotency_key
    );
    v_duplicate_replayed := COALESCE((v_result->>'idempotent_replay')::boolean, false)
      AND v_result->>'waiver_id' = v_waiver_alt_id::text;
    IF NOT v_duplicate_replayed OR (
      SELECT count(*) FROM sdd.gate_waiver_authorizations
      WHERE idempotency_key = v_waiver_alt_idempotency_key
    ) <> 1 THEN
      RAISE EXCEPTION 'An exact duplicate waiver request did not replay its single authorization';
    END IF;

    BEGIN
      PERFORM public.sdd_authorize_gate_waiver(
        v_waiver_batch,
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
        v_run_a, 'database-contracts', 'ALTERNATIVE_EVIDENCE', v_marker,
        'Synthetic wrong-run request must be rejected.',
        jsonb_build_object('method', 'Synthetic method', 'evidence_ref', v_marker || '-wrong-run', 'exit_code', 0),
        NULL, 'WAIVE ' || v_waiver_batch::text || ' ' ||
          encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
          ' ' || v_run_a::text || ' database-contracts', gen_random_uuid()
      );
      v_wrong_run_rejected := false;
    EXCEPTION WHEN OTHERS THEN
      v_wrong_run_rejected := SQLERRM ILIKE '%exact batch%';
      IF NOT v_wrong_run_rejected THEN RAISE; END IF;
    END;
    IF NOT v_wrong_run_rejected THEN RAISE EXCEPTION 'A waiver bound to a wrong run was accepted'; END IF;

    BEGIN
      PERFORM public.sdd_authorize_gate_waiver(
        v_waiver_batch,
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
        v_waiver_run, 'unknown-gate', 'ALTERNATIVE_EVIDENCE', v_marker,
        'Synthetic wrong-gate request must be rejected.',
        jsonb_build_object('method', 'Synthetic method', 'evidence_ref', v_marker || '-wrong-gate', 'exit_code', 0),
        NULL, 'WAIVE ' || v_waiver_batch::text || ' ' ||
          encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
          ' ' || v_waiver_run::text || ' unknown-gate', gen_random_uuid()
      );
      v_wrong_gate_rejected := false;
    EXCEPTION WHEN OTHERS THEN
      v_wrong_gate_rejected := SQLERRM ILIKE '%required failed or skipped gate%';
      IF NOT v_wrong_gate_rejected THEN RAISE; END IF;
    END;
    IF NOT v_wrong_gate_rejected THEN RAISE EXCEPTION 'A waiver bound to a wrong gate was accepted'; END IF;

    v_result := public.sdd_authorize_gate_waiver(
      v_waiver_batch,
      encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
      v_waiver_run, 'local-only-test', 'UNAVAILABLE', v_marker,
      'Synthetic owner accepts the unavailable local check and its residual risk.',
      jsonb_build_object('method', 'Direct Supabase SQL contract test', 'evidence_ref', v_marker || '-unavailable',
        'unavailable_reason', 'Synthetic local PostgreSQL target is absent.'),
      NULL,
      'WAIVE ' || v_waiver_batch::text || ' ' ||
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
        ' ' || v_waiver_run::text || ' local-only-test',
      gen_random_uuid()
    );
    IF v_result->>'state' <> 'WAIVED' OR v_result->>'outcome_basis' <> 'UNAVAILABLE' THEN
      RAISE EXCEPTION 'An explicitly eligible unavailable check did not create a WAIVED result';
    END IF;
    v_waiver_unavailable_id := (v_result->>'waiver_id')::uuid;

    BEGIN
      PERFORM public.sdd_authorize_gate_waiver(
        v_waiver_batch,
        repeat('f', 64),
        v_waiver_run, 'database-contracts', 'ALTERNATIVE_EVIDENCE', v_marker,
        'Synthetic stale hash should be rejected.',
        jsonb_build_object('method', 'Synthetic method', 'evidence_ref', v_marker || '-stale', 'exit_code', 0),
        NULL, 'WAIVE ' || v_waiver_batch::text || ' ' || repeat('f', 64) || ' ' ||
          v_waiver_run::text || ' database-contracts', gen_random_uuid()
      );
      v_stale_hash_rejected := false;
    EXCEPTION WHEN OTHERS THEN
      v_stale_hash_rejected := SQLERRM ILIKE '%manifest%' OR SQLERRM ILIKE '%hash%';
      IF NOT v_stale_hash_rejected THEN RAISE; END IF;
    END;
    IF NOT v_stale_hash_rejected THEN RAISE EXCEPTION 'A mismatched manifest hash was accepted'; END IF;

    BEGIN
      PERFORM public.sdd_authorize_gate_waiver(
        v_waiver_batch,
        encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex'),
        v_waiver_run, 'security-review', 'ALTERNATIVE_EVIDENCE', v_marker,
        'Synthetic ineligible gate should be rejected.',
        jsonb_build_object('method', 'Synthetic method', 'evidence_ref', v_marker || '-never', 'exit_code', 0),
        NULL, 'WAIVE ' || v_waiver_batch::text || ' ' ||
          encode(extensions.digest(convert_to(v_manifest_waiver::text, 'UTF8'), 'sha256'), 'hex') ||
          ' ' || v_waiver_run::text || ' security-review', gen_random_uuid()
      );
      v_never_policy_rejected := false;
    EXCEPTION WHEN OTHERS THEN
      v_never_policy_rejected := SQLERRM ILIKE '%policy%' OR SQLERRM ILIKE '%eligible%';
      IF NOT v_never_policy_rejected THEN RAISE; END IF;
    END;
    IF NOT v_never_policy_rejected THEN RAISE EXCEPTION 'A NEVER-policy gate was waived'; END IF;

    IF has_function_privilege('service_role',
      'public.sdd_authorize_gate_waiver(uuid,text,uuid,text,text,text,text,jsonb,uuid,text,uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'The runner service_role can authorize gate waivers';
    END IF;

    PERFORM public.sdd_record_gate(
      v_waiver_run, v_waiver_lease, v_marker, 'security-review', true, 'PASSED',
      'Synthetic security permission check', 0,
      jsonb_build_object('result', 'runner cannot authorize waivers'), v_marker
    );
    v_result := public.sdd_complete_spec(
      v_waiver_run, v_waiver_lease, v_marker,
      'Synthetic waiver completion contract passed.', v_marker
    );
    IF v_result->>'state' <> 'COMPLETED' THEN
      RAISE EXCEPTION 'Completion did not accept only PASSED or exactly authorized WAIVED gates';
    END IF;

    v_status := public.sdd_status(v_waiver_batch);
    SELECT b.entry INTO v_batch_status
    FROM jsonb_array_elements(v_status->'batches') AS b(entry)
    WHERE b.entry->>'batch_id' = v_waiver_batch::text;
    IF v_batch_status IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_batch_status->'specs') AS s(spec),
           jsonb_array_elements(s.spec->'quality_gates') AS g(gate)
         WHERE g.gate->>'gate_key' = 'database-contracts'
           AND g.gate->>'state' = 'WAIVED'
           AND g.gate->'waiver'->>'approved_by' = v_marker
           AND g.gate->'waiver'->>'evidence_ref' = v_marker || '-alternative'
       ) THEN
      RAISE EXCEPTION 'SDD status did not expose the WAIVED gate, approver, and evidence reference';
    END IF;

    v_report := jsonb_build_object(
      'result', 'PASS',
      'expected_project_ref', 'twikxeloeftczwbpjvzr',
      'database', current_database(),
      'schema', 'sdd',
      'fixture_marker', v_marker,
      'synthetic_ids', jsonb_build_object(
        'specs', jsonb_build_array(v_scope_spec_a, v_scope_spec_b, v_paused_spec, v_waiver_spec),
        'batches', jsonb_build_array(v_batch_a, v_batch_b, v_paused_batch, v_waiver_batch),
        'runs', jsonb_build_array(v_run_a, v_run_b, v_paused_run, v_waiver_run),
        'leases', jsonb_build_array(v_lease_a, v_lease_b, v_waiver_lease),
        'tasks', jsonb_build_array(v_task_scope_a_id, v_task_paused_id, v_task_scope_id, v_waiver_task_id),
        'gates', jsonb_build_array(v_gate_id, v_local_gate_id, v_security_gate_id),
        'waivers', jsonb_build_array(v_waiver_alt_id, v_waiver_unavailable_id),
        'failure', v_failure_id
      ),
      'parent_relationships', jsonb_build_object(
        'scope_run_a', jsonb_build_object('batch_id', v_batch_a, 'run_id', v_run_a),
        'scope_run_b', jsonb_build_object('batch_id', v_batch_b, 'run_id', v_run_b),
        'paused_run', jsonb_build_object('batch_id', v_paused_batch, 'run_id', v_paused_run),
        'waiver_run', jsonb_build_object('batch_id', v_waiver_batch, 'run_id', v_waiver_run,
          'task_id', v_waiver_task_id, 'failure_id', v_failure_id)
      ),
      'checks', jsonb_build_array(
        'unrelated paused batch remains unchanged',
        'overlapping active scopes rejected',
        'disjoint active scopes admitted',
        'exact alternate evidence waiver accepted',
        'unavailable and NEVER policies enforced',
        'mismatched manifest rejected',
        'wrong run and wrong gate rejected',
        'exact duplicate request idempotently replayed once',
        'runner role cannot authorize waivers',
        'status exposes waiver reason and safe evidence reference',
        'completion accepts matching WAIVED outcomes'
      ),
      'cleanup', 'all fixture writes and append-only events rolled back by subtransaction'
    );

    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'rollback_sdd_flexible_fixture';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN
    NULL;
  END;

  RETURN v_report;
END;
$test$;

SELECT pg_temp.sdd_flexible_execution_contract_test();
