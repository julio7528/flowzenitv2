# Data model and graph state: SPEC-002@2

**Status**: Proposed implementation contract for a Draft SPEC. No production persistence schema or access policy is created here.

## Runtime objects

| Object | Fields and constraints | Lifetime and owner |
| --- | --- | --- |
| AgentTurnRequest | message string, optional opaque conversationId; reject unknown fields and bodies over 8 KiB. No owner, role, passkey, session, tool, SQL, or query fields. | HTTP DTO; validated before graph invocation |
| TrustedTurnContext | Server-generated requestId, turnId, correlationId, graphVersion; server-created access and disclosure decisions. | One invocation; cannot be constructed from request or model fields |
| GraphState | Validated current-turn message, bounded model messages, IDs/version, node and call counters, normalized result, pending proposal, safe tool references, response classification, one terminal outcome. | In-memory for one invocation; no conversation history |
| ModelAdapterResult | Normalized content, toolCalls, finishReason, optional usage, safe provider error category. | One provider call; raw body, headers, reasoning, and credentials excluded |
| ToolProposal | Provider call ID, allowlisted name/version, untrusted JSON arguments, locally validated input, policy decision, bounded sanitized result and provenance reference. | One turn; policy and budgets are checked immediately before execution |
| ExecutionLedgerEntry | Server-generated idempotencyKey, turn/call sequence, canonical tool name/version, argument hash, reserved/started/succeeded/failed/denied state, safe outcome reference, timestamp. | Test fake only in this SPEC; production writes and durable replay remain disabled |
| TerminalOutcome | completed, needs-clarification, denied, refused, timed-out, cancelled, or failed. | Exactly one per graph turn |
| RuntimeLimits | maxGraphSteps 12, maxModelCalls 3, maxToolCalls 4, maxRetries 1, modelTimeoutMs 15000, toolTimeoutMs 5000, deadlineMs 45000, maxRequestBytes 8192, maxResponseBytes 16384, maxOutputTokens 2048. | Immutable server configuration; no request override |

## Graph transition invariants

- Every graph turn uses one server-generated correlation ID and graph version and sets exactly one terminal outcome.
- A production turn with the access gate absent or closed terminates as denied before invoking DeepSeek, a Supabase client, or any tool.
- The passkey, sessionStorage, a conversation ID, public Supabase key, caller headers, and provider output never create access authority.
- The DeepSeek adapter receives only public or synthetic content. The production HTTP route is disabled while real user input could be private.
- The six SPEC-004 tool adapters validate input and preserve source, hierarchy, unsupported entity, narrowing, candidate, cursor, bigint-string, and truncation metadata.
- A hierarchy operation passes the existing opaque AES-256-GCM cursor through unchanged and does not decode or reconstruct it. HIERARCHY_CURSOR_SECRET is a server-only Uint8Array of at least 32 bytes, shared across instances, with no hard-coded fallback. Rotation invalidates cursors.
- A tool proposal never carries authority. Validation checks tool name/version, exact schema, argument size, gate, capability, domain preconditions, budget, deadline, and cancellation.
- No mutation handler is registered in the production registry. A synthetic mutation test cannot run unless a fake durable ledger acknowledges reservation and outcome.
- Only eligible transient provider errors or verified idempotent reads may receive the single additional retry. Retries count toward per-turn call and deadline limits.
- Provider-specific reasoning fields are discarded from normalized public output and logs. No external LangSmith tracing is enabled.
- The response is bounded to 16 KiB. If required metadata cannot fit, return a safe bounded error rather than silently claiming completeness.

## SPEC-004 tool result preservation

Typed operations are getHierarchy, getItemById, searchItems, getDailySchedule, getWeeklyAllocation, and getRoutineTemplates. The executor forwards the structured result without selecting candidates or rewriting evidence.

- UNSUPPORTED_ENTITY stays explicit and does not produce a fabricated ID or record.
- requiresNarrowing, narrowingReason, candidate IDs, and hierarchy context remain available to graph response composition.
- Truncation and continuation metadata are preserved; a truncated page is not complete.
- Cursor values are opaque AES-256-GCM tokens and server-bound. They are passed through unchanged and are never decoded, reconstructed, or modified by model output.
- Bigint IDs remain strings from tool input through final evidence references.

## Persistence boundary

CheckpointPort and ExecutionLedger are injected interfaces. This SPEC specifies only port contracts and deterministic fakes. It creates no Supabase table or migration and stores no production checkpoint or conversation. SPEC-003 and DEC-005 own durable storage, retention, deletion, and cross-request resume. Production writes remain disabled until future authorization, tool ownership, and durable ledger requirements are satisfied.
