import { assertServerOnlyRuntime } from './server-only.js';
import { TrustedTurnContextSchema } from './state.js';

assertServerOnlyRuntime();

/** DEC-001 is intentionally closed for this SPEC and cannot be toggled by input. */
export const PRODUCTION_ACCESS_GATE = 'closed';

const DENIAL_REASON = 'dec001_closed';
const serverCreatedDecisions = new WeakSet();

/**
 * Derive the production capability decision from server-owned turn context.
 * The request, passkey state, headers, model output, and context's decision
 * fields never grant access. There is no production override in this module.
 */
export function decideProductionCapabilities(trustedContext) {
  const context = TrustedTurnContextSchema.parse(trustedContext);

  const decision = Object.freeze({
    requestId: context.requestId,
    turnId: context.turnId,
    correlationId: context.correlationId,
    graphVersion: context.graphVersion,
    accessDecision: 'deny',
    disclosureDecision: 'deny',
    reason: DENIAL_REASON,
  });

  serverCreatedDecisions.add(decision);
  return decision;
}

/** Fail closed unless both server-created decisions explicitly allow a call. */
export function mayInvokeExternalCapability(decision) {
  if (!decision || typeof decision !== 'object' || !serverCreatedDecisions.has(decision)) return false;
  return decision.accessDecision === 'allow'
    && decision.disclosureDecision === 'allow'
    && decision.reason === 'server_authorized';
}

/** Production policy: provider, Supabase, and all tool handlers stay disabled. */
export function productionCapabilityPolicy(trustedContext) {
  const decision = decideProductionCapabilities(trustedContext);

  return Object.freeze({
    ...decision,
    mayInvokeProvider: false,
    mayInvokeSupabase: false,
    mayInvokeTools: false,
    allowedToolNames: Object.freeze([]),
  });
}
