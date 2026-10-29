import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUNNER_RPCS,
  canonicalContentHash,
  parseEnvFile,
  parseDependencies,
  parseSpecVersion,
  parseSpecReference,
  prepareApprovalSql,
  redactSecretValues,
  resolveSupabaseCredentials,
  stableIdempotencyKey,
} from '../scripts/sdd/sddctl.js';

test('SDD CLI parses the unified env file, including comments and a UTF-8 BOM', () => {
  const env = parseEnvFile([
    '\uFEFF# frontend and server variables share one local file',
    'VITE_SUPABASE_URL=https://example.supabase.co',
    'VITE_SUPABASE_PUBLISHABLE_KEY="publishable-test-value"',
    'SUPABASE_URL=https://example.supabase.co # optional explicit server URL',
    "SUPABASE_SECRET_KEY='server-secret-test-value'",
    'export IGNORED_EXAMPLE=value',
  ].join('\n'));

  assert.equal(env.VITE_SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(env.VITE_SUPABASE_PUBLISHABLE_KEY, 'publishable-test-value');
  assert.equal(env.SUPABASE_URL, 'https://example.supabase.co');
  assert.equal(env.SUPABASE_SECRET_KEY, 'server-secret-test-value');
  assert.equal(env.IGNORED_EXAMPLE, 'value');
});

test('SDD CLI accepts SUPABASE_URL or falls back to the Vite URL, but requires the server secret', () => {
  assert.deepEqual(resolveSupabaseCredentials({
    fileEnv: { VITE_SUPABASE_URL: 'https://frontend.supabase.co', SUPABASE_SECRET_KEY: 'server-test' },
  }), { url: 'https://frontend.supabase.co', key: 'server-test' });

  assert.deepEqual(resolveSupabaseCredentials({
    processEnv: { SUPABASE_URL: 'https://server.supabase.co', SUPABASE_SECRET_KEY: 'process-test' },
    fileEnv: { SUPABASE_URL: 'https://file.supabase.co', VITE_SUPABASE_URL: 'https://vite.supabase.co', SUPABASE_SECRET_KEY: 'file-test' },
  }), { url: 'https://server.supabase.co', key: 'process-test' });

  assert.deepEqual(resolveSupabaseCredentials({
    fileEnv: { VITE_SUPABASE_URL: 'https://frontend.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'publishable-test' },
  }), { url: 'https://frontend.supabase.co', key: '' });
});

test('configured Supabase secret values are redacted from CLI text output', () => {
  assert.equal(
    redactSecretValues('request failed for server-secret-test-value', ['server-secret-test-value']),
    'request failed for [REDACTED]',
  );
});

test('Vite client exposure is restricted to VITE_ and frontend Supabase code uses publishable variables only', () => {
  const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  const frontendClient = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8');

  assert.match(viteConfig, /envPrefix:\s*['"]VITE_['"]/);
  assert.doesNotMatch(viteConfig, /SUPABASE_SECRET_KEY|define:\s*\{/);
  assert.match(frontendClient, /import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(frontendClient, /SUPABASE_SECRET_KEY|process\.env/);
});

test('SPEC content hash is stable across path order and Windows line endings', () => {
  const first = [
    { path: 'spec.md', content: '# Test\r\nversion: 1\r\n' },
    { path: 'plan.md', content: '# Plan\n' },
  ];
  const second = [
    { path: 'plan.md', content: '# Plan\r\n' },
    { path: 'spec.md', content: '# Test\nversion: 1\n' },
  ];
  assert.equal(canonicalContentHash(first), canonicalContentHash(second));
  assert.notEqual(canonicalContentHash(first), '');
});

test('SPEC dependency list is deduplicated and normalized', () => {
  assert.deepEqual(parseDependencies('dependencies: [CORE-001, DATA-002, CORE-001]'), ['CORE-001', 'DATA-002']);
  assert.deepEqual(parseDependencies('**Dependencies**: `[]`'), []);
  assert.deepEqual(parseDependencies('**Dependencies**: `[CORE-001, DATA-002, CORE-001]`'), ['CORE-001', 'DATA-002']);
  assert.deepEqual(parseDependencies('# no dependencies here'), []);
});

test('SPEC version parser accepts the Spec Kit template metadata', () => {
  assert.equal(parseSpecVersion('**Version**: `7`'), 7);
  assert.equal(parseSpecVersion('version: 2'), 2);
  assert.equal(parseSpecVersion('# legacy SPEC'), 1);
  assert.throws(() => parseSpecVersion('**Version**: `0`'));
});

test('operation idempotency keys are stable, namespaced UUIDs', () => {
  const input = { batch: 'batch-1', owner: 'session-1' };
  const key = stableIdempotencyKey('claim-batch', input);
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(stableIdempotencyKey('claim-batch', input), key);
  assert.notEqual(stableIdempotencyKey('create-batch', input), key);
});

test('batch references require a version and preserve their immutable ID', () => {
  assert.deepEqual(parseSpecReference('AGENT-001@3'), { spec_id: 'AGENT-001', version: 3 });
  assert.throws(() => parseSpecReference('AGENT-001'), /Use ID@VERSÃO/);
});

test('runner allowlist cannot authorize, extend limits, or resume blocked work', () => {
  for (const rpc of ['sdd_approve_batch', 'sdd_extend_limits', 'sdd_resume_batch']) {
    assert.equal(RUNNER_RPCS.has(rpc), false);
  }
  assert.equal(RUNNER_RPCS.has('sdd_record_task'), true);
  assert.equal(RUNNER_RPCS.has('sdd_heartbeat'), true);
});

test('approval SQL binds the exact batch and manifest hash with safe SQL literals', () => {
  const sql = prepareApprovalSql({
    batchId: '123e4567-e89b-12d3-a456-426614174000',
    manifestHash: 'a'.repeat(64),
    approvedBy: "Julio O'Neil",
    idempotencyKey: '123e4567-e89b-12d3-a456-426614174001',
  });
  assert.match(sql, /APROVAR 123e4567-e89b-12d3-a456-426614174000 a{64}/);
  assert.match(sql, /'Julio O''Neil'/);
  assert.match(sql, /privileged Supabase SQL\/MCP channel/);
});

