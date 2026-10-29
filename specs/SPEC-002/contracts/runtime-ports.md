# Proposed runtime ports and failure contract — SPEC-002

**Status:** Internal interface design for Draft review; no provider, storage adapter, or protected capability is activated.

## Model adapter

```text
ModelAdapter.complete({ messages, toolSchemas, modelConfig, signal, timeoutMs })
  -> { content, toolCalls[], finishReason, usage?, providerErrorCategory?, continuation? }
```

- `messages` are limited to the current turn; no long-term conversation history is owned here.
- `toolSchemas` are server-defined and versioned. `modelConfig` is server-only and cannot be selected by the request or model.
- `toolCalls[].arguments` remains untrusted JSON text until local parsing and schema validation completes.
- Adapter output is normalized and allowlisted. Drop raw response objects, headers, provider error bodies, and hidden reasoning from the public response/logging path. Any provider-required continuation field remains transient in the in-turn adapter state only.
- Proposed accepted response shapes: (a) non-empty content and no tool calls, or (b) empty content and one or more tool calls. Reject empty results, mixed non-empty content plus tool calls, invalid tool arguments, unknown finish reasons, and counts over the configured bound unless a later provider-specific compatibility review approves another shape.

## Tool registry and executor

```text
ToolDefinition = { name, version, kind: "read"|"mutation", inputSchema, outputSchema, capability }
ToolRegistry.resolve(name, version) -> ToolDefinition | NOT_FOUND
ToolPolicy.authorize({ definition, validatedInput, trustedContext, ledger }) -> ALLOW | DENY
ToolExecutor.execute(definition, validatedInput, { signal, deadline, idempotencyKey }) -> sanitized result
```

- Unknown tools, unsupported versions, malformed arguments, and unregistered fields fail closed.
- LangChain's model-facing `tool()` schema declaration (candidate Zod) does not replace the runtime's independent validation and policy check; provider strict mode also does not replace either check.
- Authorization executes immediately before the handler and is independent of prompts, model output, provider strict mode, and caller-supplied conversation IDs.
- The default production registry contains no private/privileged capabilities. Read tools are supplied only through SPEC-004 after DEC-001. Mutations remain disabled until DEC-001, DEC-009, SPEC-005, the owning SPEC-006/007 capability, and durable replay support are satisfied.
- No tool accepts model-generated SQL, code, table/column names, or arbitrary PostgREST expressions.
- Tool results are size-bounded and preserve source/provenance metadata. Truncation is explicit; never silently claim complete evidence.

## Checkpoint and execution ledger

```text
CheckpointPort.load(threadId) -> checkpoint | NOT_FOUND
CheckpointPort.save(threadId, graphVersion, checkpoint) -> durable reference
ExecutionLedger.reserve(idempotencyKey, proposalHash) -> reserved | priorOutcome
ExecutionLedger.recordStarted(idempotencyKey) -> durable acknowledgement
ExecutionLedger.recordOutcome(idempotencyKey, safeOutcomeReference) -> durable acknowledgement
ExecutionLedger.lookup(idempotencyKey) -> state and safe outcome reference
```

- Ports are injected; SPEC-002 defines neither a Supabase schema nor a retention period. SPEC-003/DEC-005 own persistent conversation/checkpoint storage and retention.
- For a mutation, the key and reservation must be durable before invoking the tool; the outcome must be recorded before graph continuation. A replay with a completed outcome returns that outcome without calling the handler again. If durable reserve/outcome storage is unavailable or ambiguous, deny the mutation and do not retry it.
- A graph's in-memory saver is permitted only in deterministic tests. It is not crash-safe production persistence and cannot satisfy mutation idempotency.
- Checkpoint serialization allowlists state fields and excludes credentials, raw provider objects, logs, client authorization material, and unredacted provider reasoning. Retention/deletion is not decided by SPEC-002.

## Failure, retry, and cancellation matrix

| Failure class | Proposed graph behavior | Retry rule |
| --- | --- | --- |
| Request/schema/tool-name/authorization/domain validation | `needs-clarification`, `denied`, or `failed` as appropriate; zero handler calls for denied proposals | Never retry unchanged invalid/denied input |
| Provider timeout/network/rate limit/transient service failure | Normalize to a safe provider category; end as `timed-out` or `failed` after configured exhaustion | Bounded only; counts, backoff, and timeout values remain pending |
| Permanent provider/configuration/unsupported-response error | Stable dependency/configuration outcome, with no raw body exposed | No retry |
| Read-tool dependency timeout/transient error | Safe dependency category; tool result is not represented as empty data | Bounded retry only when operation is known read-only/idempotent |
| Mutation handler failure or uncertain completion | Deny continuation unless the durable ledger proves the prior outcome; return uncompleted action | No retry unless the same durable idempotency reservation safely resolves replay; mutation tools remain disabled in this SPEC |
| Client cancellation | Propagate request `AbortSignal`, stop starting nodes/tools, set `cancelled` when a terminal response can still be recorded | No retry |
| Budget exhausted | Stop model/tool routing and set `timed-out` or `failed` with a stable bounded response | No retry |
| Checkpoint/ledger failure | Disable resume and any mutation; never claim durability or success without an acknowledged outcome | No retry for ambiguous mutation state |

Error logs contain only correlation ID, graph/node/tool identifiers, outcome category, elapsed time, and dependency category. Do not include prompt, provider reasoning, tool arguments/results, authorization data, or raw provider/Supabase exceptions. External LangSmith tracing remains disabled until DEC-005/006 and SPEC-010 are resolved.
