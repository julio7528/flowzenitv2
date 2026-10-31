import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGateWaiverPolicies,
  validateGateWaiverRequest,
} from '../../scripts/sdd/sddctl.js';

const batchWith = (overrides = {}) => ({
  state: 'RUNNING',
  current_spec_id: 'SPEC-016',
  manifest_hash: 'a'.repeat(64),
  specs: [{
    spec_id: 'SPEC-016',
    run_id: '11111111-1111-4111-8111-111111111111',
    quality_gates: [{
      gate_key: 'database-contracts',
      required: true,
      state: 'FAILED',
      waiver_policy: 'ALTERNATIVE_EVIDENCE',
    }],
  }],
  ...overrides,
});

test('missing Gate waiver policies leaves every gate at the fail-closed NEVER default', () => {
  assert.deepEqual(parseGateWaiverPolicies('# Plan\n\n## Summary\nNo exception declared.'), {});
});

test('immutable SPEC plans can declare explicit gate waiver policies', () => {
  assert.deepEqual(parseGateWaiverPolicies(`## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| database-contracts | ALTERNATIVE_EVIDENCE |
| local-only-test | UNAVAILABLE |
| security-review | NEVER |

## Decisions
No other policies.`), {
    'database-contracts': 'ALTERNATIVE_EVIDENCE',
    'local-only-test': 'UNAVAILABLE',
    'security-review': 'NEVER',
  });
});

test('invalid and duplicate immutable gate policies are rejected during registration', () => {
  assert.throws(() => parseGateWaiverPolicies(`## Gate waiver policies
| Gate key | Policy |
| --- | --- |
| database-contracts | SOMETIMES |`), /Invalid waiver policy/);
  assert.throws(() => parseGateWaiverPolicies(`## Gate waiver policies
| Gate key | Policy |
| --- | --- |
| database-contracts | NEVER |
| database-contracts | UNAVAILABLE |`), /Duplicate waiver policy/);
});

test('alternative evidence requires the exact current failed required gate and exit code zero', () => {
  const batch = batchWith();
  const request = {
    batch,
    runId: '11111111-1111-4111-8111-111111111111',
    gateKey: 'database-contracts',
    basis: 'ALTERNATIVE_EVIDENCE',
    exitCode: '0',
  };
  assert.equal(validateGateWaiverRequest(request).gate.gate_key, 'database-contracts');
  assert.throws(() => validateGateWaiverRequest({ ...request, exitCode: '1' }), /exit code 0/);
  assert.throws(() => validateGateWaiverRequest({ ...request, gateKey: 'unknown-gate' }), /gate requerido/);
  assert.throws(() => validateGateWaiverRequest({ ...request, runId: '22222222-2222-4222-8222-222222222222' }), /SPEC atual/);
  assert.throws(() => validateGateWaiverRequest({ ...request, batch: batchWith({ current_spec_id: 'SPEC-005' }) }), /SPEC atual/);
});

test('unavailable basis requires an eligible skipped gate, a reason, and no linked failure', () => {
  const batch = batchWith({ specs: [{
    spec_id: 'SPEC-016',
    run_id: '11111111-1111-4111-8111-111111111111',
    quality_gates: [{
      gate_key: 'local-only-test', required: true, state: 'SKIPPED', waiver_policy: 'UNAVAILABLE',
    }],
  }] });
  const request = {
    batch,
    runId: '11111111-1111-4111-8111-111111111111',
    gateKey: 'local-only-test',
    basis: 'UNAVAILABLE',
    unavailableReason: 'Isolated local PostgreSQL service is unavailable.',
  };
  assert.equal(validateGateWaiverRequest(request).gate.state, 'SKIPPED');
  assert.throws(() => validateGateWaiverRequest({ ...request, unavailableReason: '' }), /motivo ambiental/);
  assert.throws(() => validateGateWaiverRequest({ ...request, failureId: '11111111-1111-4111-8111-111111111111' }), /não aceita --failure/);
  const differentPolicy = batchWith({ specs: [{
    spec_id: 'SPEC-016',
    run_id: request.runId,
    quality_gates: [{
      gate_key: 'local-only-test', required: true, state: 'SKIPPED', waiver_policy: 'ALTERNATIVE_EVIDENCE',
    }],
  }] });
  assert.throws(() => validateGateWaiverRequest({ ...request, batch: differentPolicy }), /snapshot imutável define ALTERNATIVE_EVIDENCE/);
});

test('NEVER gates and optional gates cannot be prepared for waiver', () => {
  const batch = batchWith({ specs: [{
    spec_id: 'SPEC-016',
    run_id: '11111111-1111-4111-8111-111111111111',
    quality_gates: [{ gate_key: 'security-review', required: true, state: 'SKIPPED', waiver_policy: 'NEVER' }],
  }] });
  const base = {
    batch,
    runId: '11111111-1111-4111-8111-111111111111',
    gateKey: 'security-review',
    basis: 'UNAVAILABLE',
    unavailableReason: 'Synthetic reason',
  };
  assert.throws(() => validateGateWaiverRequest(base), /snapshot imutável define NEVER/);
  assert.throws(() => validateGateWaiverRequest({ ...base, batch: batchWith({ specs: [{
    spec_id: 'SPEC-016', run_id: base.runId,
    quality_gates: [{ gate_key: 'security-review', required: false, state: 'SKIPPED', waiver_policy: 'UNAVAILABLE' }],
  }] }) }), /gate requerido/);
});
