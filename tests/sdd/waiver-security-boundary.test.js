import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RUNNER_RPCS } from '../../scripts/sdd/sddctl.js';

const migrationUrl = new URL('../../supabase/migrations/20261030024252_sdd_flexible_batches_gate_waivers.sql', import.meta.url);
const migration = await readFile(migrationUrl, 'utf8');

test('waiver migration changes only the private SDD governance tables', () => {
  const createTargets = [...migration.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.]+)/gi)]
    .map((match) => match[1].toLowerCase());
  const alterTargets = [...migration.matchAll(/\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w.]+)/gi)]
    .map((match) => match[1].toLowerCase());

  assert.deepEqual(createTargets, ['sdd.gate_waiver_authorizations']);
  assert.ok(alterTargets.length > 0);
  assert.ok(alterTargets.every((target) => target.startsWith('sdd.')));
  assert.doesNotMatch(migration, /\bCREATE\s+POLICY\b|\bDROP\s+POLICY\b|ALTER\s+DEFAULT\s+PRIVILEGES/i);
  assert.doesNotMatch(migration, /DEC-001|DEC-009|DEC-012|conversation_private|auth\.users/i);
});

test('gate waiver authorization remains unavailable to the runner roles', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.sdd_authorize_gate_waiver\([\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.sdd_authorize_gate_waiver\([\s\S]*?TO postgres;/i);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.sdd_authorize_gate_waiver\([\s\S]*?TO (?:service_role|authenticated|anon|PUBLIC)\s*;/i);
  assert.equal(RUNNER_RPCS.has('sdd_authorize_gate_waiver'), false);
});

test('scope and waiver policy helpers are not executable by browser or runner roles', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION\s+sdd\.normalize_file_scope\(text\),\s+sdd\.file_scopes_overlap\(text,text\),\s+sdd\.has_cross_batch_scope_conflict\(uuid,text\[\]\),\s+sdd\.gate_waiver_policy\(uuid,text\)\s+FROM PUBLIC, anon, authenticated, service_role;/i);
});
