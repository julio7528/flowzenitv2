/** Non-credential markers used only to detect accidental test-data disclosure. */
export const SECRET_SENTINEL_FIXTURE_VERSION = '1.0.0';

export const SECRET_SENTINELS = Object.freeze([
  'SYNTHETIC_SECRET_SENTINEL_ALPHA_01',
  'SYNTHETIC_SECRET_SENTINEL_BETA_02',
  'SYNTHETIC_PRIVATE_FIELD_SENTINEL_GAMMA_03',
]);
