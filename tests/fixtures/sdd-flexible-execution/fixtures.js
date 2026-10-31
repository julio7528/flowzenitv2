const TEST_HASH = 'a'.repeat(64);

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function createFixtures(marker) {
  if (typeof marker !== 'string' || marker.trim().length === 0) {
    throw new TypeError('Fixture marker must be a non-empty string.');
  }

  return {
    version: 1,
    marker,
    pausedBatch: {
      batchId: `${marker}-paused-batch`,
      state: 'PAUSED',
      manifestHash: TEST_HASH,
      specId: 'SPEC-003',
      leaseExpiresAt: null,
      openCorrectionWindows: 0,
      writableScopes: ['server/agent/memory/', 'tests/integration/conversation/'],
    },
    independentBatch: {
      batchId: `${marker}-independent-batch`,
      state: 'READY_FOR_APPROVAL',
      manifestHash: 'b'.repeat(64),
      items: [
        { specId: 'SPEC-016', version: 1, position: 1, dependencies: [] },
        {
          specId: 'SPEC-005',
          version: 1,
          position: 2,
          dependencies: ['SPEC-001', 'SPEC-002', 'SPEC-004'],
        },
      ],
      completedDependencies: ['SPEC-001', 'SPEC-002', 'SPEC-004'],
      writableScopes: ['scripts/sdd/', 'supabase/migrations/', 'tests/sdd/'],
    },
    incompleteDependencyBatch: {
      batchId: `${marker}-missing-dependency-batch`,
      specId: 'SPEC-005',
      dependencies: ['SPEC-001', 'SPEC-002', 'SPEC-004'],
      completedDependencies: ['SPEC-001', 'SPEC-002'],
    },
    duplicateSpecBatch: {
      batchId: `${marker}-duplicate-spec-batch`,
      specId: 'SPEC-003',
      existingBatchId: `${marker}-paused-batch`,
      existingBatchState: 'PAUSED',
    },
    activeScopeConflict: {
      batchId: `${marker}-active-conflict-batch`,
      runId: `${marker}-active-run`,
      state: 'RUNNING',
      hasLiveLease: true,
      writableScopes: ['scripts/sdd/'],
    },
    independentScopes: {
      first: ['server/agent/memory/'],
      second: ['server/agent/guardrails/'],
      overlapping: ['supabase/migrations/', 'supabase/migrations/20261030120000_sdd_policy.sql'],
    },
    waiver: {
      batchId: `${marker}-waiver-batch`,
      manifestHash: 'c'.repeat(64),
      specId: 'SPEC-016',
      specVersion: 1,
      specContentHash: 'd'.repeat(64),
      runId: `${marker}-waiver-run`,
      gateKey: 'database-contracts',
      outcomeBasis: 'ALTERNATIVE_EVIDENCE',
      approver: 'synthetic-owner',
      reason: 'Synthetic waiver fixture for exact binding tests.',
      evidenceRef: `${marker}-evidence-1`,
      idempotencyKey: `${marker}-waiver-once`,
    },
    mismatchedWaiver: {
      manifestHash: 'e'.repeat(64),
      runId: `${marker}-different-run`,
      gateKey: 'security-review',
    },
  };
}

/** Immutable synthetic-only fixture set for SDD scheduling and waiver tests. */
export const SDD_FLEXIBLE_EXECUTION_FIXTURES = deepFreeze(createFixtures('sdd-flexible-v1'));

/** Build fresh synthetic fixtures for tests that need isolated markers. */
export function createSddFlexibleExecutionFixtures(marker) {
  return deepFreeze(createFixtures(marker));
}
