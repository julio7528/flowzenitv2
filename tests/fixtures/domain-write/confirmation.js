// Test-only data. This reference is deliberately not accepted as a real grant.
export const SYNTHETIC_CONFIRMATION_FIXTURE = Object.freeze({
  reference: 'synthetic-confirmation-reference',
  approved: false,
  authoritative: false,
});

export const SYNTHETIC_CONFIRMATION_CASES = Object.freeze({
  missing: null,
  untrusted: SYNTHETIC_CONFIRMATION_FIXTURE,
  stale: Object.freeze({ ...SYNTHETIC_CONFIRMATION_FIXTURE, fingerprint: 'stale-synthetic-fingerprint' }),
});
