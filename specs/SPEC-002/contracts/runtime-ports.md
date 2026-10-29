# Runtime ports and failure contract — SPEC-002@2

**Status**: Internal implementation contract for a Draft SPEC. No provider call, durable storage adapter, private capability, or mutation is activated by this document.

## Model adapter

    ModelAdapter.complete({
      messages,
      toolSchemas,
      modelConfig,
      signal,
      timeoutMs,
      maxOutputTokens
    }) -> {
      content,
      toolCalls[],
      finishReason,
      usage?,
      providerErrorCategory?
    }

- Use deepseek-flash, OpenAI-compatible Chat Completions, and thinking disabled for this SPEC.
- modelConfig is server-only and fixed by validated runtime configuration. A request or model cannot select the endpoint, model, token limit, thinking mode, or tools.
- Prefer ChatDeepSeek from the pinned @langchain/deepseek package. Verify request fields and tool-call normalization through mocked fetch. The approved REST fallback is limited to this provider and the same model-neutral port.
- toolCalls[].arguments is untrusted JSON text until local parse, Zod validation, allowlist, capability, and budget checks finish.
- maxOutputTokens is at most 2,048. Each request timeout is at most 15 seconds and the signal aborts underlying fetch. Usage, finish reason, and safe provider error category are normalized.
- Drop raw response objects, headers, provider error bodies, reasoning_content, credentials, and hidden reasoning. No raw provider data reaches response, logs, checkpoint, or ledger.
- If the response is empty, mixed, malformed, unsupported, truncated by token limit, or has unknown fields, follow the tested normalizer contract and do not claim success from incomplete content.
- No LangSmith tracing.

## Typed tool registry and executor

    ToolDefinition = {
      name,
      version,
      kind: "read",
      inputSchema,
      outputSchema,
      capability
    }

    ToolRegistry.resolve(name, version) -> ToolDefinition | NOT_FOUND
    ToolPolicy.authorize({ definition, validatedInput, trustedContext, ledger })
      -> ALLOW | DENY

The production registry contains only the six SPEC-004 read contracts and is default-deny while DEC-001 is closed. No mutation, SQL, code, arbitrary table/column, or arbitrary PostgREST tool is registered.

- Model-facing tools use Zod schemas and the LangChain tool helper. Local validation and policy remain separate and authoritative.
- Recheck tool name/version, schema, access, disclosure, domain preconditions, budget, deadline, and cancellation immediately before a handler.
- Bind only the owning SPEC-004 service functions. Do not create a server Supabase client or duplicate queries in this SPEC.
- Preserve UNSUPPORTED_ENTITY, requiresNarrowing, narrowingReason, candidate IDs/context, opaque AES-256-GCM hierarchy cursors, truncation, provenance, and bigint strings in results and response composition.
- Pass existing hierarchy cursor tokens through unchanged; do not decode, reconstruct, or modify them. The hierarchy service requires HIERARCHY_CURSOR_SECRET from server configuration as a Uint8Array of at least 32 bytes shared across instances. Missing/invalid key denies hierarchy operations; no constant fallback exists. Rotation invalidates cursors.
- Synthetic integration tests inject handlers and never connect to the product database.

## Checkpoint and execution ledger

    CheckpointPort.load(threadId) -> checkpoint | NOT_FOUND
    CheckpointPort.save(threadId, graphVersion, checkpoint) -> safe reference
    ExecutionLedger.reserve(idempotencyKey, proposalHash) -> reserved | priorOutcome
    ExecutionLedger.recordStarted(idempotencyKey) -> acknowledgement
    ExecutionLedger.recordOutcome(idempotencyKey, safeOutcomeReference) -> acknowledgement
    ExecutionLedger.lookup(idempotencyKey) -> state and safe outcome reference

These are ports only. This SPEC creates no Supabase schema and persists no conversation or checkpoint. Deterministic tests use fake implementations. Production writes are absent.

For a synthetic mutation test, the fake ledger must acknowledge reservation before the synthetic effect and outcome before continuation. Replay with a completed fake result returns the old result without invoking the test handler twice. Missing or ambiguous acknowledgements deny execution. No real product mutation occurs.

Checkpoint serialization allowlists only safe graph metadata and references; it excludes request messages, private data, credentials, raw provider objects, reasoning, authorization material, tool arguments/results, and logs. Durable storage and retention belong to SPEC-003 and DEC-005.

## Failure, retry, cancellation, and budgets

| Failure | Graph behavior | Retry |
| --- | --- | --- |
| Invalid request, schema, tool, authorization, or domain input | Safe failed, needs-clarification, or denied terminal; denied proposals call zero handlers | Never |
| Transient provider failure | Safe provider category and bounded terminal after exhaustion | At most one additional call if total limits permit |
| Permanent provider/configuration/unsupported response | Safe dependency or configuration terminal; no raw body | Never |
| Read dependency timeout/transient failure | Distinguish dependency failure from empty data | At most one additional call if the operation is known idempotent |
| Tool handler uncertainty or mutation-like synthetic failure | Report uncompleted action unless fake ledger proves the result | No production mutation; no retry absent a safe ledger outcome |
| Client cancellation | Propagate AbortSignal; stop scheduling nodes/tools | Never |
| Budget exhaustion | Stop new calls and set timed-out or failed with an explicit uncompleted-action list | Never |
| Checkpoint or ledger unavailable | Disable resume and deny any operation requiring durable replay | Never for ambiguous effects |

The maximums are 12 graph steps, 3 model calls including retries, 4 tool calls, 15 seconds per model call, 5 seconds per tool call, 45 seconds total, 8 KiB request, 16 KiB response, and 2,048 model output tokens where supported. The retry delay is a deterministic 250 ms and remains inside the total deadline. No model or caller field can increase a limit.

Safe operational events may contain only correlation ID, graph version, node/tool name and version, outcome category, elapsed time, and bounded call counts. Never log messages, prompts, arguments, results, reasoning, credentials, authorization data, cookies, raw provider errors, or raw Supabase errors.
