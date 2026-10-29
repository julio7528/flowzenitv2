# Feature Specification: LangGraph Runtime and DeepSeek Model Integration

**SPEC ID**: SPEC-002<br>
**Version**: 2
<br>**Dependencies**: [SPEC-001, SPEC-004]<br>
**Risk**: high

**Feature Branch**: existing main preserved<br>
**Updated**: 2026-10-29<br>
**Status**: Draft

## Version 2 rationale

Version 2 records the owner's SPEC-scoped decisions for a real LangGraph runtime, the DeepSeek Chat Completions adapter, bounded execution values, and a root Vercel Node Function. It also makes the fail-closed boundary explicit because DEC-001 remains closed and DEC-006 permits only public or synthetic content for this SPEC. These are material changes from the published version 1. The SDD check found no registered SPEC-002 snapshot, so version 1 remains preserved in the consulted GitHub commit and version 2 will be registered as a new immutable snapshot.

## Scope and exclusions

### In scope

- Implement one synchronous server-side turn using a real LangGraph StateGraph with explicit validation, capability, model, tool, response, and terminal paths.
- Add the root Vercel Node Function endpoint POST /api/agent/turn. The production handler fails closed while no server-verifiable access capability is approved. An unauthenticated request must not reach DeepSeek, Supabase, or a tool handler.
- Use LangChain's model and tool contracts with DeepSeek as the primary provider. The SPEC-scoped starting configuration is model deepseek-flash, OpenAI-compatible Chat Completions, and non-thinking mode.
- Use the six existing SPEC-004 typed read contracts only: getHierarchy, getItemById, searchItems, getDailySchedule, getWeeklyAllocation, and getRoutineTemplates. Production invocation remains denied while DEC-001 is closed.
- Preserve SPEC-004 result meaning, including UNSUPPORTED_ENTITY, requiresNarrowing, candidate references, hierarchy context, opaque AES-256-GCM cursor pagination, and truncation metadata.
- Define injected checkpoint and execution-ledger ports, deterministic test doubles, provider and tool normalization, bounded retries, timeouts, cancellation, and terminal responses.
- Use only public or synthetic content for the optional provider smoke test. Never send real FlowZenit or Supabase content to DeepSeek.

### Explicitly out of scope

- Changing DEC-001, adding authentication, treating the client passkey as server authentication, enabling private reads, or enabling privileged tools.
- Sending real FlowZenit data, private task or demand content, personal history, stored prompts, credentials, or Supabase data to any model or external tracing service.
- Persisting conversations or graph checkpoints, implementing long-term history, implementing mutations, or enabling write tools.
- Adding a chat UI, streaming, background execution, queues, RAG, embeddings, Gemini, reindexing, arbitrary code, SQL, or unrestricted PostgREST input.
- Deploying or publishing the endpoint, selecting a production region, or asserting production availability.

## Approved decisions scoped to SPEC-002

- DEC-010 for this SPEC: Node.js ESM, root Vercel Node Functions, synchronous JSON, no streaming or background work. The selected route is POST /api/agent/turn. Use Node 24.x to match the local Node 24 runtime and Vercel's current default. Set this function's maximum duration to 45 seconds and cancellation support. Do not set a region; validate the actual project and region before any future deployment.
- DEC-011 for this SPEC: DeepSeek, model deepseek-flash, OpenAI-compatible Chat Completions at the provider's documented base URL, with thinking disabled. Prefer ChatDeepSeek. Pin only packages required by the implementation. Use a minimal server-side REST adapter behind the same provider-neutral port only if ChatDeepSeek cannot satisfy the required request, tool, timeout, cancellation, or normalization contract.
- DEC-006 for this SPEC: only public or synthetic content may be used in an optional live smoke test. This scoped allowance does not resolve DEC-006 globally. Production route calls remain disabled because user input may contain private content.
- DEC-012 for this SPEC: at most 12 graph steps, 3 model invocations, 4 tool invocations, one additional retry for an eligible transient failure, 15 seconds per model call, 5 seconds per tool call, 45 seconds total per turn, 8 KiB request body, 16 KiB response, and 2,048 output tokens when supported. These are not a global financial budget.
- DEC-005 and SPEC-003 continue to own durable persistence and retention. This SPEC defines ports and test doubles only.
- DEC-001 remains closed. No decision in this SPEC authorizes private access or changes authentication.

## Dependencies and existing contracts

SPEC-001@2 and SPEC-004@2 are recorded as COMPLETED by the SDD supervisor. The new batch must contain only SPEC-002@2 and pass the supervisor's dependency validation.

The model must treat every provider tool call as an untrusted proposal. Local schema validation, a server-created access decision, capability policy, domain preconditions, cancellation, and remaining budgets are rechecked immediately before any handler.

The existing SPEC-004 hierarchy cursor is an opaque AES-256-GCM token bound to its item and ordering. SPEC-002 passes it through without decoding, changing, or reconstructing it. HIERARCHY_CURSOR_SECRET is supplied only on the server as a Uint8Array of at least 32 bytes and is identical across runtime instances. Never hard-code it, put it in a VITE variable, expose it to the browser, or include it in evidence. Missing or invalid configuration fails closed. Rotation invalidates existing cursors.

## User scenarios and acceptance criteria

### User story 1 — A bounded graph turn

A deterministic test model returns answer text, a typed tool proposal, a refusal, or a malformed result. The real LangGraph graph follows the corresponding path and ends in one declared terminal outcome within the configured budgets.

Acceptance:

1. An answer-only result reaches response composition without invoking a tool.
2. A valid synthetic tool proposal is validated and executed through the injected test capability; the response distinguishes evidence from inference.
3. Unknown, malformed, unauthorized, or over-budget proposals execute zero handlers.
4. A mixed or unsupported provider response is handled according to the explicit adapter contract without leaking raw provider data.

### User story 2 — Safe typed reads and closed production access

The runtime recognizes the six SPEC-004 read contracts and preserves their output metadata. The production HTTP route remains disabled while no server access capability is available.

Acceptance:

1. Tests exercise each typed read using synthetic injected handlers, never product records.
2. UNSUPPORTED_ENTITY, requiresNarrowing, candidate references, hierarchy context, and truncation state survive model normalization and response composition.
3. With DEC-001 closed and no server-verifiable identity, POST /api/agent/turn returns a bounded denied response and makes zero provider, Supabase, and tool-handler calls.
4. The runtime never chooses one ambiguous candidate silently or claims a truncated result is complete.

### User story 3 — Bounded and reproducible execution

A reviewer can reproduce graph routing, timeouts, retries, cancellation, and replay behavior using versioned fixtures and deterministic doubles.

Acceptance:

1. Each path terminates within 12 graph steps, 3 model calls, 4 tool calls, the per-call deadlines, and the 45-second total deadline.
2. Only eligible transient failures receive one additional retry; validation, authorization, domain, and permanent provider errors are not retried.
3. Cancellation stops starting nodes and tools and propagates through the model and tool ports.
4. A fake ledger replay returns a completed synthetic outcome without repeating the synthetic effect.
5. No production mutation tool or persistent checkpoint implementation exists.

## Functional requirements

- **FR-001**: The runtime MUST construct and execute a real LangGraph StateGraph with named states, nodes, transitions, and terminal routing. Graph tests MUST execute the real graph with deterministic model and tool doubles.
- **FR-002**: Every turn MUST use server-generated request, turn, correlation, and graph-version identifiers. The passkey, sessionStorage, caller-supplied conversationId, public key, or model output MUST NOT create authority. With DEC-001 closed, the production route MUST deny access before any provider, Supabase, or tool call.
- **FR-003**: The provider-neutral model adapter MUST return normalized content, typed tool proposals, usage when available, finish reason, and a safe provider error category. Raw bodies, headers, reasoning, and credentials MUST not escape the adapter.
- **FR-004**: Tool names, versions, and arguments MUST be validated locally and authorized immediately before execution. Prompt instructions and provider strict mode MUST NOT grant capabilities.
- **FR-005**: Production tools MUST be named, versioned, allowlisted typed operations. The model MUST NOT supply SQL, code, table or column names, or arbitrary PostgREST expressions.
- **FR-006**: Runtime limits MUST enforce at most 12 graph steps, 3 model invocations, 4 tool invocations, one extra eligible retry, 15 seconds per model call, 5 seconds per tool call, a 45-second total deadline, an 8 KiB request body, a 16 KiB response, and at most 2,048 output tokens when supported. Runtime ceilings MUST not be user-controlled.
- **FR-007**: Only transient provider failures or verified idempotent read failures MAY receive the single permitted additional retry. Validation, authorization, domain, cancellation, configuration, and permanent errors MUST not retry.
- **FR-008**: The runtime MUST define checkpoint and ledger ports and prove replay safety with test doubles. No mutation tool may be enabled without a future approved durable ledger; this SPEC MUST NOT implement writes.
- **FR-009**: Responses MUST distinguish tool evidence, model inference, missing evidence, and uncompleted actions and preserve tool provenance, narrowing, unsupported-entity, cursor, and truncation metadata.
- **FR-010**: Exactly one terminal outcome MUST be returned: completed, needs-clarification, denied, refused, timed-out, cancelled, or failed.
- **FR-011**: Provider credentials, hierarchy cursor keys, model configuration, and capability policy MUST remain server-only. LangSmith tracing MUST remain disabled.
- **FR-012**: Ordinary automated tests MUST use deterministic doubles and synthetic data. At most one live DeepSeek smoke request MAY be made with public or synthetic content, only if a valid server-only credential already exists. The smoke is optional; missing credentials do not block deterministic tests.
- **FR-013**: The Vercel route MUST accept synchronous JSON only, enforce the 8 KiB request and 16 KiB response limits, and fail closed without server-verifiable authentication. It MUST not cause anonymous requests to call DeepSeek or Supabase.
- **FR-014**: Any SPEC-004 hierarchy integration MUST preserve the existing opaque AES-256-GCM cursor contract and pass cursor values through without decoding, changing, or reconstructing them. HIERARCHY_CURSOR_SECRET MUST be a non-hard-coded server-only Uint8Array of at least 32 bytes, consistent across runtime instances. The key MUST never appear in the client bundle, response, logs, or SDD evidence.

## Success criteria

- **SC-001**: 100% of malformed, unknown, unauthorized, or over-budget synthetic tool proposals execute zero handlers.
- **SC-002**: Every graph test reaches exactly one declared terminal outcome within the configured limits.
- **SC-003**: Replaying a completed synthetic ledger entry does not repeat its effect.
- **SC-004**: Repeated deterministic fixtures produce the same graph path, tool decisions, terminal outcome, and correlation handling.
- **SC-005**: An unauthenticated production-route test observes zero model, repository, and tool calls while DEC-001 is closed.
- **SC-006**: The six typed contract adapters preserve unsupported-entity, narrowing, candidate, hierarchy-context, and truncation metadata.
- **SC-007**: Browser build output contains no server module, DeepSeek credential, or hierarchy cursor secret.
- **SC-008**: The optional provider smoke test sends no more than one public or synthetic request and is recorded as NOT VERIFIED if no credential is already configured.

## Required verification gates

| Gate | Required | Evidence |
| --- | --- | --- |
| Lint and static checks | Yes | Project lint, no unsafe client imports or secret-bearing VITE variables |
| Build and server module checks | Yes | Production Vite build, Node ESM syntax/import checks, and endpoint contract tests |
| Unit and graph integration | Yes | Real StateGraph paths exercised with deterministic model, tool, clock, and ledger doubles |
| Provider adapter contract | Yes | Mocked Chat Completions response normalization, tool binding, usage, limits, cancellation, and error handling |
| SPEC-004 tool contracts | Yes | Synthetic handler integration for all six typed operations; no Supabase product writes |
| Budget, retry, timeout, cancellation, replay | Yes | Exact approved limits, transient-only retry, abort behavior, and fake-ledger replay tests |
| Security and redaction | Yes | Closed production access gate, zero external calls, zero unauthorized tools, no leaked prompts/reasoning/secrets |
| Optional live provider smoke | No | At most one synthetic/public request; otherwise explicitly NOT VERIFIED |
| Production deployment and region | No | No deployment in this SPEC; region and account-specific settings remain NOT VERIFIED |

## Completion evidence

All executable tasks and required gates have actual evidence recorded through the approved SDD run. Optional smoke or deployment checks are never marked PASS if not executed. Completing this SPEC does not open DEC-001, resolve global DEC-006, authorize persistent history, enable writes, deploy the endpoint, or make the agent available to end users.
