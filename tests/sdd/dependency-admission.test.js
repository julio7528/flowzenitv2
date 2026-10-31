import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateIndependentBatchAdmission,
  fileScopesOverlap,
  normalizeFileScope,
} from '../../scripts/sdd/sdd-policy.js';
import { SDD_FLEXIBLE_EXECUTION_FIXTURES as fixtures } from '../fixtures/sdd-flexible-execution/fixtures.js';

const exactHash = 'f'.repeat(64);

function validAdmission(overrides = {}) {
  return evaluateIndependentBatchAdmission({
    manifestHash: exactHash,
    manifestHashCurrent: exactHash,
    items: fixtures.independentBatch.items.map((item) => ({
      specId: item.specId,
      dependencies: item.dependencies,
    })),
    completedSpecIds: fixtures.independentBatch.completedDependencies,
    activeSpecIds: [fixtures.pausedBatch.specId],
    requestedScopes: fixtures.independentBatch.writableScopes,
    activeScopes: fixtures.pausedBatch.writableScopes.map((scope) => ({
      scope,
      batchState: 'PAUSED',
      hasLiveLease: false,
      hasOpenCorrectionWindow: false,
    })),
    ...overrides,
  });
}

test('a dependency-ready independent batch can proceed while an unrelated batch stays paused', () => {
  const result = validAdmission();

  assert.deepEqual(result, { allowed: true, reasons: [] });
  assert.equal(fixtures.pausedBatch.state, 'PAUSED');
  assert.equal(fixtures.pausedBatch.manifestHash, 'a'.repeat(64));
});

test('independent admission preserves the paused batch state and exact manifest hash', () => {
  const pausedBeforeAdmission = structuredClone(fixtures.pausedBatch);

  const result = validAdmission();

  assert.equal(result.allowed, true);
  assert.deepEqual(fixtures.pausedBatch, pausedBeforeAdmission);
  assert.equal(fixtures.pausedBatch.state, 'PAUSED');
  assert.equal(fixtures.pausedBatch.manifestHash, pausedBeforeAdmission.manifestHash);
});

test('an incomplete prerequisite fails closed', () => {
  const result = evaluateIndependentBatchAdmission({
    ...validAdmissionInput(),
    items: [{ specId: fixtures.incompleteDependencyBatch.specId, dependencies: fixtures.incompleteDependencyBatch.dependencies }],
    completedSpecIds: fixtures.incompleteDependencyBatch.completedDependencies,
  });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('dependency_missing_or_out_of_order'));
});

test('a duplicate SPEC in an approved, running, or paused batch fails closed', () => {
  const result = evaluateIndependentBatchAdmission({
    ...validAdmissionInput(),
    items: [{ specId: fixtures.duplicateSpecBatch.specId, dependencies: [] }],
    activeSpecIds: [fixtures.duplicateSpecBatch.specId],
  });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('duplicate_active_spec'));
});

test('an immutable manifest hash mismatch fails closed', () => {
  const result = validAdmission({ manifestHashCurrent: '0'.repeat(64) });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('manifest_hash_mismatch'));
});

test('active overlapping write scopes fail closed and directory boundaries are exact', () => {
  const result = validAdmission({
    activeScopes: [{
      scope: fixtures.activeScopeConflict.writableScopes[0],
      batchState: 'RUNNING',
      hasLiveLease: true,
      hasOpenCorrectionWindow: false,
    }],
  });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes('overlapping_writable_scope'));
  assert.equal(fileScopesOverlap('supabase/migrations/', 'supabase/migrations/20261030120000_sdd_policy.sql'), true);
  assert.equal(fileScopesOverlap('server/agent/memory/', 'server/agent/memory2/'), false);
});

test('a paused batch without a live lease or correction window does not reserve its old scope', () => {
  const result = validAdmission({
    requestedScopes: ['docs/independent/readme.md'],
    activeScopes: [{
      scope: 'docs/independent/',
      batchState: 'PAUSED',
      hasLiveLease: false,
      hasOpenCorrectionWindow: false,
    }],
  });

  assert.equal(result.allowed, true);
});

test('scope normalization accepts Windows separators and rejects traversal/absolute paths', () => {
  assert.equal(normalizeFileScope('scripts\\sdd\\'), 'scripts/sdd');
  assert.throws(() => normalizeFileScope('../secrets'), /traversal/i);
  assert.throws(() => normalizeFileScope('C:\\private\\file.js'), /absolute/i);
});

function validAdmissionInput() {
  return {
    manifestHash: exactHash,
    manifestHashCurrent: exactHash,
    items: [{ specId: 'SPEC-016', dependencies: [] }],
    completedSpecIds: [],
    activeSpecIds: [],
    requestedScopes: ['scripts/sdd/'],
    activeScopes: [],
  };
}
