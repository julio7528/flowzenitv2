import { assertServerOnlyRuntime } from './server-only.js';
import { TrustedTurnContextSchema } from './state.js';
import {
  AGENT_READ_TOOL_NAMES,
  AGENT_RECURRENCE_TOOL_NAMES,
  AGENT_WRITE_TOOL_NAMES,
} from '../tools/registry.js';

assertServerOnlyRuntime();

/** Owner-approved public POC decision; it is fixed on the server, not request-controlled. */
export const PRODUCTION_ACCESS_GATE = 'open';

const POC_DECISION_REASON = 'server_authorized';
const serverCreatedDecisions = new WeakSet();

/**
 * Derive the owner-approved public POC decision from server-owned turn context.
 * Request fields, passkey state, headers, model output, and context decision
 * fields cannot toggle the fixed policy.
 */
export function decideProductionCapabilities(trustedContext) {
  const context = TrustedTurnContextSchema.parse(trustedContext);

  const decision = Object.freeze({
    requestId: context.requestId,
    turnId: context.turnId,
    correlationId: context.correlationId,
    graphVersion: context.graphVersion,
    accessDecision: 'allow',
    disclosureDecision: 'allow',
    reason: POC_DECISION_REASON,
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

/** Production POC policy permits the provider, typed reads, and scoped create tools. */
export function productionCapabilityPolicy(trustedContext) {
  const decision = decideProductionCapabilities(trustedContext);

  return Object.freeze({
    ...decision,
    mayInvokeProvider: true,
    mayInvokeSupabase: true,
    mayInvokeTools: true,
    allowedToolNames: Object.freeze([
      ...AGENT_READ_TOOL_NAMES,
      ...AGENT_WRITE_TOOL_NAMES,
      ...AGENT_RECURRENCE_TOOL_NAMES,
    ]),
  });
}
