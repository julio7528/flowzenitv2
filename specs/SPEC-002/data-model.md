# Data model and graph state: SPEC-002

**Status:** Proposed runtime contracts for Draft review. No database schema or persistence policy is approved by this document.

## Runtime objects

| Object | Fields and constraints | Lifetime / owner |
| --- | --- | --- |
| `AgentTurnRequest` | `message`, optional opaque `conversationId`; exact body and string limits are configuration decisions. Reject unknown properties. No owner ID, role, passkey assertion, session claim, SQL, or raw tool input. | HTTP request DTO, validated before graph invocation; SPEC-002. |
| `TrustedTurnContext` | Server-generated `requestId`, `turnId`, `correlationId`, `graphVersion`; access-gate result and capability set created server-side. `conversationId` is a correlation key only and never proves identity. | One invocation; no request field may construct its trusted capability values. |
| `GraphState` | Current message, in-turn normalized model messages, `turnId`, `conversationId`, correlation/version metadata, context classification, model result, pending proposals, bounded tool ledger, tool results, response classification, terminal outcome, sanitized failure category. | In-memory turn state; no long-term conversation history in SPEC-002. Provider-specific reasoning content, if required for a tool-call protocol, stays ephemeral and is excluded from user output and logs. |
| `ModelAdapterResult` | Normalized `content`, `toolCalls[]`, `finishReason`, optional usage metadata, provider error category, optional provider continuation fields. Raw provider body and headers are excluded. | Adapter boundary; one model call. |
| `ToolProposal` | Provider call ID, allowlisted `name`, `version`, raw JSON argument string, then validated DTO/hash, decision, and bounded result reference. Model-provided names/arguments are untrusted. | One graph turn; execution requires a local policy decision immediately before the handler. |
| `ExecutionLedgerEntry` | Server-generated `idempotencyKey`, turn/call sequence, canonical tool name/version, argument hash, state `reserved|started|succeeded|failed|denied`, safe result reference, and timestamp. No raw private result or prompt. | In-memory for reads in this SPEC; durable reserve/outcome operations are a required port for mutation execution and are not implemented here. Persistence/retention belongs to SPEC-003 and DEC-005. |
| `TerminalOutcome` | `completed|needs-clarification|denied|refused|timed-out|cancelled|failed`. | Exactly one per completed invocation. |
| `RuntimeLimits` | Required positive finite configuration for max graph steps, model calls, tools per turn, provider/tool timeout, retry count and delay, deadline, and result/prompt byte/token bounds. The plan lists provisional defaults/ceilings for user review; they are not approved values. | Server configuration. Missing/invalid production limits disable runtime startup or the relevant capability. |

## State transition invariants

- Every turn has one server-generated correlation ID and graph version; every terminal path sets exactly one terminal outcome.
- The trusted access decision cannot be derived from the passkey, `sessionStorage`, a client-supplied ID, public Supabase key, or provider output. Until DEC-001 is satisfied, private reads and privileged tools are denied before domain/provider calls involving private FlowZenit content.
- Provider calls carrying real FlowZenit content remain disabled until DEC-006 and DEC-011 are resolved and their approved runtime configuration exists.
- A tool proposal never contains authority. Validation checks tool name/version, exact schema, argument size, capability, access gate, policy decision, preconditions, budget, and cancellation at execution time.
- A mutation proposal cannot reach a handler without a durable idempotency reservation first. Its outcome must be durably recorded before graph continuation. Missing checkpoint/ledger persistence denies the mutation. No mutation tool is registered by this SPEC.
- Each retry and loop consumes the same finite turn budget. Unknown, malformed, unauthorized, or domain-invalid proposals are not retried as transient failures.
- Completion text identifies tool-grounded facts, model inference, missing evidence, and uncompleted actions separately.

## Persistence boundary

LangGraph's checkpointer and the runtime execution ledger are adapter ports. This SPEC specifies their minimum operations and replay invariants; SPEC-003 owns persistent conversation/checkpoint implementation and DEC-005 owns retention/deletion policy. Until those are available and approved, tests use deterministic in-memory fakes, production has no durable resume, and any operation requiring durable replay remains disabled. The runtime must not silently replace a missing durable adapter with a process-local cache while claiming crash-safe behavior.
