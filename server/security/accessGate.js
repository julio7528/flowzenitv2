const DENIED_CAPABILITY = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: 'CAPABILITY_DISABLED',
    message: 'Capability unavailable',
  }),
});

/**
 * The owner-selected POC decision is public and fixed on the server. This
 * opens the existing typed agent path without adding database privileges:
 * Supabase's current anon grants and RLS remain the final data boundary.
 * Browser state, request fields, and model output cannot change this decision.
 */
export function isAgentAccessGateOpen() {
  return true;
}

/**
 * Runs only a server-owned operation callback. This gate does not create a
 * Supabase client, grant database permissions, or interpret request data.
 * Callers remain responsible for dispatching only registered typed operations.
 */
export function withAgentAccess(_request, operation) {
  if (typeof operation !== 'function') return DENIED_CAPABILITY;
  return operation();
}
