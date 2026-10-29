import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { RUNTIME_LIMITS } from './limits.js';
import { assertServerOnlyRuntime } from './server-only.js';

assertServerOnlyRuntime();

export const GRAPH_VERSION = 'agent-turn-v1';

export const TERMINAL_OUTCOMES = Object.freeze([
  'completed',
  'needs-clarification',
  'denied',
  'refused',
  'timed-out',
  'cancelled',
  'failed',
]);

export const SAFE_PROVIDER_ERROR_CATEGORIES = Object.freeze([
  'transient',
  'permanent',
  'timeout',
  'cancelled',
  'configuration',
  'unsupported_response',
  'unknown',
]);

export const SPEC004_READ_TOOL_NAMES = Object.freeze([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

export const TerminalOutcomeSchema = z.enum(TERMINAL_OUTCOMES);
export const ProviderErrorCategorySchema = z.enum(SAFE_PROVIDER_ERROR_CATEGORIES);
export const Spec004ReadToolNameSchema = z.enum(SPEC004_READ_TOOL_NAMES);

export const AgentTurnRequestSchema = z.strictObject({
  message: z.string().refine((value) => value.trim().length > 0, {
    message: 'A non-empty message is required.',
  }),
  conversationId: z.string().nullable().optional(),
});

export const TrustedTurnContextSchema = z.strictObject({
  requestId: z.uuid(),
  turnId: z.uuid(),
  correlationId: z.uuid(),
  graphVersion: z.literal(GRAPH_VERSION),
  accessDecision: z.enum(['allow', 'deny']),
  disclosureDecision: z.enum(['allow', 'deny']),
});

/** Response-safe identity references; deliberately excludes access decisions. */
export const TrustedTurnContextReferenceSchema = z.strictObject({
  requestId: z.uuid(),
  turnId: z.uuid(),
  correlationId: z.uuid(),
  graphVersion: z.literal(GRAPH_VERSION),
});

export const RuntimeMessageSchema = z.strictObject({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  toolCallId: z.string().min(1).optional(),
  toolName: Spec004ReadToolNameSchema.optional(),
});

export const NormalizedToolCallSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  // Provider JSON remains untrusted text until the local tool schema validates it.
  arguments: z.string(),
});

export const ModelUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export const ModelAdapterResultSchema = z.strictObject({
  content: z.string().nullable(),
  toolCalls: z.array(NormalizedToolCallSchema).max(RUNTIME_LIMITS.maxToolCalls),
  finishReason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'unknown']),
  usage: ModelUsageSchema.optional(),
  providerErrorCategory: ProviderErrorCategorySchema.optional(),
});

export const ToolProposalSchema = z.strictObject({
  providerCallId: z.string().min(1),
  toolName: Spec004ReadToolNameSchema,
  toolVersion: z.string().min(1),
  // Deliberately unknown: the proposal has no authority until local validation.
  arguments: z.unknown(),
  validatedInput: z.unknown().optional(),
  policyDecision: z.enum(['not-evaluated', 'allow', 'deny']),
  safeResultReference: z.string().min(1).nullable().optional(),
  provenanceReference: z.string().min(1).nullable().optional(),
});

export const SafeToolReferenceSchema = z.strictObject({
  toolName: Spec004ReadToolNameSchema,
  toolVersion: z.string().min(1),
  referenceId: z.string().min(1),
  parentReferenceId: z.string().min(1).nullable().optional(),
  opaqueCursor: z.string().nullable().optional(),
  truncated: z.boolean().optional(),
  hasMore: z.boolean().optional(),
  complete: z.boolean().optional(),
});

const ResponseClassificationSchema = z.enum([
  'answer',
  'needs-clarification',
  'denied',
  'refused',
  'timed-out',
  'cancelled',
  'failed',
]);

export const GraphStateSchema = z.strictObject({
  request: AgentTurnRequestSchema,
  trustedContext: TrustedTurnContextSchema,
  // This is the current turn's bounded working set, never cross-turn history.
  messages: z.array(RuntimeMessageSchema).max(RUNTIME_LIMITS.maxGraphSteps),
  graphStepCount: z.number().int().min(0).max(RUNTIME_LIMITS.maxGraphSteps),
  modelCallCount: z.number().int().min(0).max(RUNTIME_LIMITS.maxModelCalls),
  toolCallCount: z.number().int().min(0).max(RUNTIME_LIMITS.maxToolCalls),
  retryCount: z.number().int().min(0).max(RUNTIME_LIMITS.maxRetries),
  modelResult: ModelAdapterResultSchema.nullable(),
  pendingProposal: ToolProposalSchema.nullable(),
  toolReferences: z.array(SafeToolReferenceSchema),
  responseClassification: ResponseClassificationSchema.nullable(),
  terminalOutcome: TerminalOutcomeSchema.nullable(),
});

export const TerminalOutcomeDTOSchema = z.strictObject({
  turnId: z.uuid(),
  conversationId: z.string().nullable(),
  graphVersion: z.literal(GRAPH_VERSION),
  outcome: TerminalOutcomeSchema,
  correlationId: z.uuid(),
});

export function parseAgentTurnRequest(value) {
  return AgentTurnRequestSchema.parse(value);
}

/** Create server-owned identifiers and a default-deny context. */
export function createTrustedTurnContext() {
  return TrustedTurnContextSchema.parse({
    requestId: randomUUID(),
    turnId: randomUUID(),
    correlationId: randomUUID(),
    graphVersion: GRAPH_VERSION,
    accessDecision: 'deny',
    disclosureDecision: 'deny',
  });
}

export function createInitialGraphState(requestValue) {
  const request = AgentTurnRequestSchema.parse(requestValue);

  return GraphStateSchema.parse({
    request,
    trustedContext: createTrustedTurnContext(),
    messages: [{ role: 'user', content: request.message }],
    graphStepCount: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    retryCount: 0,
    modelResult: null,
    pendingProposal: null,
    toolReferences: [],
    responseClassification: null,
    terminalOutcome: null,
  });
}

export function createTerminalOutcomeDTO({ request, trustedContext, outcome }) {
  const validatedRequest = AgentTurnRequestSchema.parse(request);
  const validatedContext = TrustedTurnContextSchema.parse(trustedContext);

  return TerminalOutcomeDTOSchema.parse({
    turnId: validatedContext.turnId,
    conversationId: validatedRequest.conversationId ?? null,
    graphVersion: validatedContext.graphVersion,
    outcome,
    correlationId: validatedContext.correlationId,
  });
}
