/** Test-only matrix. It is never imported by server production modules. */
export const SYNTHETIC_CONFIRMATION_MATRIX_VERSION = 'synthetic-confirmation-matrix@1';

export const SYNTHETIC_CONFIRMATION_MATRIX = Object.freeze({
  version: SYNTHETIC_CONFIRMATION_MATRIX_VERSION,
  status: 'approved',
  approvedForTestsOnly: true,
  entries: Object.freeze({
    'synthetic.read@1': Object.freeze({ outcome: 'ALLOW', confirmationRequired: false }),
    'synthetic.write@1': Object.freeze({ outcome: 'ALLOW', confirmationRequired: true }),
    'synthetic.unknown@1': Object.freeze({ outcome: 'DENY', confirmationRequired: true }),
  }),
});
