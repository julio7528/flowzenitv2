import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStatusGateReporting } from '../../scripts/sdd/sddctl.js';

const report = {
  batches: [{
    batch_id: 'c379828d-235f-4b8b-bd09-11def8519aec',
    specs: [{
      spec_id: 'SPEC-016',
      quality_gates: [
        { gate_key: 'passed-check', required: true, state: 'PASSED', waiver: null },
        { gate_key: 'failed-check', required: true, state: 'FAILED', waiver: null },
        { gate_key: 'skipped-check', required: true, state: 'SKIPPED', waiver: null },
        {
          gate_key: 'waived-check',
          required: true,
          state: 'WAIVED',
          waiver: {
            waiver_id: '3f276abb-c97b-4e18-b0b4-0feb1219300d',
            outcome_basis: 'ALTERNATIVE_EVIDENCE',
            approved_by: 'owner',
            reason: 'Accepted the residual risk with alternative evidence.',
            evidence_ref: 'tests/evidence/database-contracts.json',
          },
        },
      ],
    }],
  }],
};

test('status reporting preserves each gate outcome and its waiver attribution', () => {
  assert.equal(validateStatusGateReporting(report), report);
  assert.deepEqual(
    report.batches[0].specs[0].quality_gates.map((gate) => gate.state),
    ['PASSED', 'FAILED', 'SKIPPED', 'WAIVED'],
  );
  assert.equal(report.batches[0].specs[0].quality_gates[3].waiver.approved_by, 'owner');
});

test('status reporting fails closed if WAIVED lacks the owner authorization fields', () => {
  const invalid = structuredClone(report);
  invalid.batches[0].specs[0].quality_gates[3].waiver = null;
  assert.throws(() => validateStatusGateReporting(invalid), /missing its required owner authorization/);
});

test('status reporting rejects unknown outcomes and waiver details attached to PASSED', () => {
  const unknown = structuredClone(report);
  unknown.batches[0].specs[0].quality_gates[0].state = 'ACCEPTED';
  assert.throws(() => validateStatusGateReporting(unknown), /Unknown quality gate outcome/);

  const mislabeled = structuredClone(report);
  mislabeled.batches[0].specs[0].quality_gates[0].waiver = report.batches[0].specs[0].quality_gates[3].waiver;
  assert.throws(() => validateStatusGateReporting(mislabeled), /Non-WAIVED gate/);
});
