const DENIED_CAPABILITY = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: 'CAPABILITY_DISABLED',
    message: 'Capability unavailable',
  }),
});

/**
 * SPEC-001 keeps private agent capabilities disabled until a separately
 * approved and verified server-side access control exists. Browser state,
 * request fields, and runtime flags cannot change this result.
 */
export function isAgentAccessGateOpen() {
  return false;
}

/**
 * Denies every current protected operation before its callback can run.
 * The arguments are intentionally ignored; this module has no opt-in path.
 */
export function withAgentAccess(_request, _operation) {
  return DENIED_CAPABILITY;
}
