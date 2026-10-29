-- Reject idempotency-key reuse when the request name or actor differs.
BEGIN;

CREATE OR REPLACE FUNCTION public.sdd_create_batch(
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
    IF NOT EXISTS (SELECT 1 FROM sdd.batches WHERE batch_id = v_batch_id AND manifest_hash = v_hash AND name = p_name AND created_by = p_created_by) THEN
      RAISE EXCEPTION 'Idempotency key was reused with a different batch request';
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

COMMIT;
