import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SDD_FLEXIBLE_EXECUTION_FIXTURES,
  createSddFlexibleExecutionFixtures,
} from '../../fixtures/sdd-flexible-execution/fixtures.js';

const SENSITIVE_KEY = /(secret|token|password|api[_-]?key|authorization|credential|transcript)/i;

function assertNoSensitiveKeys(value, path = 'root') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.equal(SENSITIVE_KEY.test(key), false, `Sensitive key at ${path}.${key}`);
    assertNoSensitiveKeys(child, `${path}.${key}`);
  }
}

test('SDD scheduling fixtures are immutable, synthetic, and keep paused-batch state explicit', () => {
  const fixtures = SDD_FLEXIBLE_EXECUTION_FIXTURES;

  assert.equal(Object.isFrozen(fixtures), true);
  assert.match(fixtures.marker, /^sdd-flexible-/);
  assert.equal(fixtures.pausedBatch.state, 'PAUSED');
  assert.equal(fixtures.pausedBatch.leaseExpiresAt, null);
  assert.equal(fixtures.pausedBatch.openCorrectionWindows, 0);
  assert.deepEqual(fixtures.independentBatch.completedDependencies, ['SPEC-001', 'SPEC-002', 'SPEC-004']);
  assert.equal(fixtures.independentBatch.items[0].position, 1);
  assert.equal(fixtures.independentBatch.items[1].position, 2);
  assertNoSensitiveKeys(fixtures);
});

test('fixture factory requires and preserves a unique synthetic marker', () => {
  assert.throws(() => createSddFlexibleExecutionFixtures('  '), /non-empty string/i);
  const fixtures = createSddFlexibleExecutionFixtures('contract-test-0042');
  assert.equal(fixtures.marker, 'contract-test-0042');
  assert.equal(fixtures.pausedBatch.batchId, 'contract-test-0042-paused-batch');
  assert.equal(fixtures.waiver.runId, 'contract-test-0042-waiver-run');
});

test('waiver request fixture binds batch hash, SPEC snapshot, run, gate, owner, reason, and evidence', () => {
  const request = SDD_FLEXIBLE_EXECUTION_FIXTURES.waiver;
  const required = [
    'batchId', 'manifestHash', 'specId', 'specVersion', 'specContentHash',
    'runId', 'gateKey', 'outcomeBasis', 'approver', 'reason', 'evidenceRef', 'idempotencyKey',
  ];

  assert.deepEqual(Object.keys(request).sort(), required.sort());
  assert.match(request.manifestHash, /^[a-f0-9]{64}$/);
  assert.match(request.specContentHash, /^[a-f0-9]{64}$/);
  assert.equal(request.outcomeBasis, 'ALTERNATIVE_EVIDENCE');
  assert.ok(request.reason.trim().length > 0);
  assert.ok(request.evidenceRef.startsWith(SDD_FLEXIBLE_EXECUTION_FIXTURES.marker));
  assertNoSensitiveKeys(request);
});

test('mismatched manifest, run, or gate fixtures are distinguishable from an authorized waiver', () => {
  const { waiver, mismatchedWaiver } = SDD_FLEXIBLE_EXECUTION_FIXTURES;

  assert.notEqual(mismatchedWaiver.manifestHash, waiver.manifestHash);
  assert.notEqual(mismatchedWaiver.runId, waiver.runId);
  assert.notEqual(mismatchedWaiver.gateKey, waiver.gateKey);
  assert.deepEqual(SDD_FLEXIBLE_EXECUTION_FIXTURES.independentScopes.overlapping, [
    'supabase/migrations/',
    'supabase/migrations/20261030120000_sdd_policy.sql',
  ]);
});
