---
description: "Dependency-ordered implementation tasks for SPEC-002@2"
---

# Tasks: LangGraph Runtime and DeepSeek Model Integration

**SPEC**: SPEC-002@2, Draft until supervisor registration and exact batch approval<br>
**Inputs**: spec.md, plan.md, research.md, data-model.md, contracts/agent-turn.md, contracts/runtime-ports.md, quickstart.md<br>
**Dependencies**: SPEC-001@2 and SPEC-004@2 are supervisor-recorded COMPLETED. The new batch must contain only SPEC-002@2 and pass supervisor validation.<br>
**Tests**: Use the real LangGraph implementation with deterministic model, tool, clock, and persistence doubles. No product database writes. No real FlowZenit data or private content may be sent to DeepSeek.

## Preconditions and gates

- DEC-001 remains closed. The production route denies requests before provider, Supabase, or tool calls. The client passkey is not authentication.
- DEC-006 is scoped to public or synthetic content for at most one optional provider smoke request. No real FlowZenit content or external trace is allowed. This does not resolve DEC-006 globally.
- DEC-010 for this SPEC selects Node.js 24 ESM, a root Vercel Node Function at POST /api/agent/turn, synchronous JSON, and no streaming, background work, or deployment. Set function maxDuration to 45 seconds and cancellation support. Do not set a region.
- DEC-011 for this SPEC selects DeepSeek deepseek-flash, OpenAI-compatible Chat Completions, and thinking disabled. Prefer ChatDeepSeek; evaluate the authorized minimal REST fallback only if the adapter fails a required contract.
- DEC-012 for this SPEC sets 12 graph steps, 3 model invocations, 4 tool invocations, one additional eligible transient retry, 15 seconds per model call, 5 seconds per tool call, 45 seconds total, 8 KiB request, 16 KiB response, and 2,048 output tokens when supported. Requests cannot change these limits.
- DEC-005/SPEC-003 own production checkpoint, conversation, and ledger storage. This SPEC defines ports and fakes only. No write tool is registered.
- HIERARCHY_CURSOR_SECRET is server-only, at least 32 bytes, shared across instances, and never hard-coded. The hierarchy operation fails closed if the key is absent or invalid.
- The existing hierarchy cursor is an opaque AES-256-GCM token; pass it through unchanged and never decode or reconstruct it in SPEC-002.
- Do not modify global decision status, authentication, product grants/RLS, product data, or deployment state.

## Phase 1: Setup

**Purpose**: Confirm package compatibility and establish server-only modules and isolated synthetic fixtures.

- [ ] T001 Verify Node 24 ESM and pin only required compatible dependencies in package.json and package-lock.json: @langchain/langgraph 1.5.3, @langchain/core 1.3.1, @langchain/deepseek 1.1.21, zod 4.6.7. Set engines.node to 24.x. Verify peer ranges and import paths. Do not add the langchain umbrella package unless an implementation import requires it.
- [ ] T002 Create the server-only runtime entry and synthetic model/tool/checkpoint fixtures under server/agent/runtime/ and tests/fixtures/agent/. Verify src and Vite client entry points cannot import server modules.

## Phase 2: Foundational contracts

**Purpose**: Define request/state/error/limit/capability/persistence boundaries shared by all stories.

- [ ] T003 [P] Define validated AgentTurnRequest, server-generated context, GraphState, ToolProposal, normalized result, and terminal DTOs in server/agent/runtime/state.js. Exclude client authority, private history, raw provider data, credentials, and reasoning.
- [ ] T004 [P] Implement fail-closed server parsing for all fixed DEC-012 limits in server/agent/runtime/limits.js, including call counts, deadlines, 8 KiB input, 16 KiB response, and 2,048 output tokens. Reject user-supplied limit overrides.
- [ ] T005 [P] Define safe provider/tool/runtime error categories, terminal outcomes, and HTTP mapping in server/agent/http/errors.js.
- [ ] T006 Implement server-created access/disclosure decisions and a production default-deny policy in server/agent/runtime/capabilities.js. Neither passkey state nor caller/model fields can enable a capability. Closed-gate requests execute zero external calls.
- [ ] T007 Define injected CheckpointPort and ExecutionLedger interfaces in server/agent/persistence/ports.js. Provide no database schema or production persistence implementation; deny any synthetic mutation execution without fake/real durable reserve and outcome acknowledgements.
- [ ] T008 [P] Define server-only DeepSeek and cursor-secret validation in server/agent/config/secrets.js, and safe allowlisted event fields in server/agent/observability/safe-events.js. Never log prompts, messages, reasoning, tool inputs/results, secrets, or raw exceptions; keep LangSmith tracing disabled.

**Checkpoint**: Shared contracts compile. Production access, provider invocation from the HTTP route, durable persistence, and mutations remain disabled.

## Phase 3: User Story 1 — Execute a real bounded LangGraph turn

**Goal**: Build a real graph and prove answer, tool proposal, refusal, validation, and terminal paths.

### Tests for User Story 1

- [ ] T009 [P] Add routing tests that execute the real LangGraph StateGraph with deterministic doubles for answer-only, tool-only, refusal, empty, mixed, malformed, and unsupported model output in tests/unit/agent/graph-routing.test.js.
- [ ] T010 [P] Add ChatDeepSeek adapter contract tests using mocked fetch in tests/contracts/agent/model-adapter.test.js. Verify request model, non-thinking mode, tool schema, output-token cap, normalized usage/finish reason/tool calls, malformed arguments, timeout, cancellation, and provider errors.
- [ ] T011 [P] Add security tests proving unknown, malformed, unauthorized, over-budget, or unregistered tool proposals invoke zero handlers in tests/security/agent/tool-proposals.test.js.

### Runtime and provider implementation

- [ ] T012 Implement provider-neutral ModelAdapter.complete with timeout, AbortSignal, fixed max tokens, normalized results, and safe provider error categories in server/agent/model/adapter.js.
- [ ] T013 Implement ChatDeepSeek in server/agent/model/deepseek.js using the pinned package, deepseek-flash, OpenAI-compatible Chat Completions, and thinking disabled. Confirm tool calling, usage, max tokens, abort, and error behavior with T010. If a required contract cannot be met, implement the SPEC-approved minimal REST adapter behind the same port; do not add a second provider.
- [ ] T014 Implement and version the actual LangGraph StateGraph and bounded node/edge routing in server/agent/runtime/build-graph.js and server/agent/runtime/turn.js. Enforce one terminal outcome and all graph/model/tool/deadline budgets.
- [ ] T015 Implement the six named/versioned typed read tools in server/agent/tools/registry.js using Zod schemas and the LangChain tool helper from @langchain/core/tools. Delegate only to the SPEC-004 service contracts. Preserve UNSUPPORTED_ENTITY, requiresNarrowing, candidate references, hierarchy context, opaque AES-256-GCM cursors passed through unchanged, bigint strings, and truncation metadata.
- [ ] T016 Implement server-side proposal validation, default-deny policy, and tool executor in server/agent/tools/execute.js. Recheck capability, exact schema, domain preconditions, budget, deadline, cancellation, and tool registration immediately before every handler.
- [ ] T017 Implement bounded evidence/inference/missing-evidence/uncompleted-action response composition in server/agent/runtime/response.js. Preserve SPEC-004 unsupported, narrowing, candidate, and truncation semantics.

### HTTP integration

- [ ] T018 Implement api/agent/turn.js and vercel.json for POST /api/agent/turn as a Node 24 ESM Vercel Function with maxDuration 45 and supportsCancellation true. The production handler returns CAPABILITY_DISABLED while the access gate is closed and calls no model, Supabase client, or tool. Do not add region, deployment, auth, or public provider activation.
- [ ] T019 Add request-to-terminal integration tests in tests/contracts/agent/turn-flow.test.js using the real graph, synthetic injected SPEC-004 handlers, and test model doubles. Test all six tool contracts, closed-route zero-call behavior, 405/415/400/413 request validation statuses, valid-turn terminal status mapping, 8 KiB input rejection, 16 KiB response cap, and terminal response shape.

**Checkpoint**: The real graph runs deterministically with synthetic injected capabilities. Production HTTP invocation remains denied.

## Phase 4: User Story 2 — Bound, cancel, retry, and replay safely

**Goal**: Prove finite work, safe errors, cancellation, and no duplicate synthetic effect.

### Tests for User Story 2

- [ ] T020 [P] Add retry classification tests proving one extra attempt is allowed only for eligible transient provider failures or verified idempotent reads in tests/unit/agent/retry-policy.test.js.
- [ ] T021 [P] Add deadline, per-call timeout, AbortSignal, 12-step, 3-model-call, 4-tool-call, 8 KiB, 16 KiB, and output-token limit tests in tests/contracts/agent/cancellation-and-bounds.test.js.
- [ ] T022 [P] Add fake-ledger reserve/start/outcome/replay tests proving a completed synthetic effect is not executed twice in tests/contracts/agent/replay.test.js.
- [ ] T023 [P] Add checkpoint/ledger-unavailable and uncertain-result security tests proving that no operation requiring durable replay proceeds in tests/security/agent/durability-gate.test.js.

### Bounded runtime implementation

- [ ] T024 Implement transient-only retry policy with one additional attempt and deterministic 250 ms delay in server/agent/runtime/retry.js. Count retry calls against the model/tool budgets and stop when the total deadline would be exceeded.
- [ ] T025 Implement request cancellation and deadlines in server/agent/runtime/cancellation.js and propagate signals to model and tool adapters; stop scheduling nodes after abort.
- [ ] T026 Integrate ledger reservation, started, outcome, and replay checks in server/agent/tools/execute.js. Production mutation registry stays empty; any synthetic mutation exists only in tests and requires the fake durable ledger.
- [ ] T027 Implement safe terminal responses and allowlisted correlation events in server/agent/http/errors.js and server/agent/observability/safe-events.js. Never expose prompt, reasoning, credential, raw provider exception/body, or raw tool result.

**Checkpoint**: Every injected failure reaches one bounded terminal outcome. The production route remains fail-closed and has no write capability.

## Phase 5: User Story 3 — Deterministic inspection and regression

**Goal**: Reproduce graph outcomes and validate versioned checkpoint/model/tool inputs.

- [ ] T028 [P] Add versioned synthetic fixtures for graph paths, model results, tool results, budget exhaustion, terminal outcomes, and correlation in tests/fixtures/agent/deterministic-runs.js.
- [ ] T029 Implement tests/helpers/agent/replay.js to run the real StateGraph repeatedly with model, tool, clock, checkpoint, and ledger doubles; compare node outcomes and decisions rather than prose.
- [ ] T030 Add tests/contracts/agent/replay-versioning.test.js for graph-version mismatch, unknown state/node, opaque cursor pass-through without decoding, tool metadata preservation, unsupported model shapes, and deterministic replay.

**Checkpoint**: Repeated synthetic runs produce the same graph path, tool decisions, and terminal outcome.

## Phase 6: Security and cross-cutting verification

**Purpose**: Verify browser/server separation, redaction, operational instructions, and complete evidence.

- [ ] T031 [P] Add tests/security/agent/client-boundary.test.js proving provider and cursor secrets, api/, and server/ modules are absent from Vite assets and source maps.
- [ ] T032 [P] Add tests/security/agent/redaction.test.js proving messages, prompts, reasoning, credentials, private tool data, tool inputs/results, and raw provider errors are absent from responses and logs.
- [ ] T033 Update specs/SPEC-002/quickstart.md with the exact commands and actual results from the authorized run. Mark the optional provider smoke and production deployment NOT VERIFIED when not performed.
- [ ] T034 Run focused graph/model/tool/security tests, npm test, npm run lint, npm run build, Node ESM checks, and the server/client bundle boundary checks. Record commands and exit codes. Do not require Docker or write to the product database.
- [ ] T035 Perform an independent read-only conformance audit against the registered SPEC-002 snapshot, this plan, and these 35 tasks; verify gates, no private provider disclosure, DEC-001 closed, no writes, no deployment, and evidence in the SDD run.

## Dependencies, parallelism, and implementation order

- T001 precedes every package-dependent task; T002 precedes all runtime modules.
- T003–T008 define the shared contracts. T006 gates all route and handler paths. T007 is interfaces and test doubles only.
- T009–T011 use distinct test files and can be authored independently after the package pins and interfaces are established.
- T012 precedes T013. T014 constructs the real graph. T015–T017 integrate tools, policy, and responses after the graph contracts are stable. T018 follows the route contract and remains fail-closed. T019 exercises the integrated flow.
- T020–T023 use distinct test files. T024–T027 follow their contracts and integrate in the graph sequentially.
- T028 and T031–T032 use disjoint files and may be prepared independently after interfaces stabilize. T029–T030 require the real graph and fixtures.
- Do not delegate overlapping files. Record task ownership, configured agent profile, test evidence, and completion in Supabase before and after each authorized delegation.
- T033–T035 run after implementation. A failed required check uses the official SDD correction flow and existing 5-attempt/120-minute limits. Do not reset counters or replace the batch/run.

## Completion boundary

All executable tasks must be completed in the exact approved batch. Required checks must have real evidence and pass. A missing optional provider credential records the optional smoke as NOT VERIFIED and does not block deterministic acceptance. A closed access gate, absent persistent storage, disabled mutations, unselected region, and no deployment are expected restrictions for this SPEC, not permission to activate those capabilities.
