---
description: "Dependency-ordered implementation tasks for SPEC-002"
---

# Tasks: LangGraph Runtime and DeepSeek Model Integration

**Input**: Design documents from `specs/SPEC-002/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/agent-turn.md`, `contracts/runtime-ports.md`, and `quickstart.md`.

**Tests**: Required by the SPEC and constitution. Use deterministic provider/tool/checkpoint doubles for regular tests. Do not call a live provider or send private data without the stated approvals. This is a future task plan; none of these tasks were executed here.

**Organization**: Tasks follow the three user stories in `spec.md`. Proposed `server/` and `api/` paths are server-only; the runtime choice and route adapter remain conditional on DEC-010.

## Preconditions and unresolved decisions

- Execute only the exact SPEC version in a user-authorized batch admitted by `$sdd-run`.
- SPEC-001 and SPEC-004 must pass in the approved sequence before runtime implementation.
- DEC-001 is an access-control prerequisite, not an authentication solution. Until adequate control is approved, implemented, and verified, private reads and privileged capabilities stay disabled.
- DEC-006 must approve data sent to DeepSeek; DEC-011 must resolve model/API mode and compatible dependency versions. No real provider calls or private content in tests before those decisions.
- DEC-010 must resolve runtime/region/platform limits before selecting the HTTP route. Vercel Node Functions remain an option only.
- DEC-012 and user review must resolve step/call/payload/time/retry ceilings. No numeric values or financial budget are approved by this task list.
- DEC-005/SPEC-003 must provide approved durable checkpoint/ledger behavior before persistent history, cross-request resume, or mutation replay. DEC-009/SPEC-005 and SPEC-006/007 are additional prerequisites before any write tool is enabled.

## Phase 1: Setup

**Purpose**: Create the future server-only runtime/test skeleton and resolve package compatibility before changing dependencies.

- [ ] T001 Confirm and record compatible pinned versions for `@langchain/langgraph`, `@langchain/core`, `@langchain/deepseek`, `langchain`, and `zod` in `package.json` and `package-lock.json` only after DEC-011 review; verify Node ESM and peer compatibility (FR-011, FR-012).
- [ ] T002 Create server-only module entry and synthetic fixture layout in `server/agent/runtime/index.js` and `tests/fixtures/agent/turns.js`; verify the React/Vite entry graph does not import `server/` (FR-001, FR-002, SC-004).

## Phase 2: Foundational

**Purpose**: Define shared request/state/error/limits/capability/persistence boundaries that block all user stories.

- [ ] T003 [P] Define validated `AgentTurnRequest`, trusted correlation/version context, `GraphState`, proposal and terminal DTOs in `server/agent/runtime/state.js` (FR-001, FR-002, FR-010).
- [ ] T004 [P] Implement required finite runtime limit parsing and fail-closed behavior for absent/invalid settings in `server/agent/runtime/limits.js`; values remain pending review (FR-006, SC-002).
- [ ] T005 [P] Define normalized provider/tool/runtime error categories and exact terminal outcomes in `server/agent/http/errors.js` (FR-010).
- [ ] T006 Define server-created access/disclosure capability interfaces and default-deny registry in `server/agent/runtime/capabilities.js`; caller fields and passkey state cannot grant access (FR-002, FR-004, FR-005, FR-011, SC-001).
- [ ] T007 Define injected checkpoint and durable execution-ledger ports in `server/agent/persistence/ports.js`; leave persistent storage to SPEC-003/DEC-005 and deny mutations if the durable port is absent (FR-002, FR-008, SC-003).
- [ ] T008 [P] Define provider-secret loading and an allowlisted, redacted event schema in `server/agent/observability/safe-events.js`; exclude prompts, arguments, results, reasoning, secrets, and raw exceptions (FR-002, FR-009, FR-011).

**Checkpoint**: All user stories may use doubles, but production model calls and protected tools remain disabled until their approval gates pass.

## Phase 3: User Story 1 — Receive a grounded answer (Priority: P1)

**Goal**: Execute a single model turn or an approved typed tool path, then return evidence and inference separately.

**Independent Test**: A deterministic model double covers answer-only, allowed tool proposal, invalid/unknown proposal, and refusal; the graph reaches one terminal result and disabled capabilities execute zero tools.

### Tests for User Story 1

- [ ] T009 [P] [US1] Add graph transition tests for answer-only, tool-call-only, refusal, empty, and mixed model output in `tests/unit/agent/graph-routing.test.js` (FR-001, FR-003, FR-010, SC-002).
- [ ] T010 [P] [US1] Add provider normalization tests for usage, finish reason, invalid JSON arguments, and omitted/unknown fields in `tests/contracts/agent/model-adapter.test.js` (FR-003, FR-011, FR-012, SC-001).
- [ ] T011 [P] [US1] Add tests proving unknown/malformed/unauthorized proposals invoke zero handlers in `tests/security/agent/tool-proposals.test.js` (FR-004, FR-005, SC-001).

### Implementation for User Story 1

- [ ] T012 [US1] Implement the provider-neutral LangChain adapter interface and normalized result mapping in `server/agent/model/adapter.js` (FR-003, FR-009, FR-011).
- [ ] T013 [US1] Implement the candidate `ChatDeepSeek` adapter in `server/agent/model/deepseek.js` using server-only configuration and no hard-coded model ID; activate only after DEC-006/011 and compatibility evidence (FR-003, FR-011).
- [ ] T014 [US1] Implement explicit LangGraph state and bounded routing nodes in `server/agent/runtime/build-graph.js` and `server/agent/runtime/turn.js` (FR-001, FR-002, FR-006, FR-010, SC-002).
- [ ] T015 [US1] Implement named/versioned LangChain `tool()` declarations and independent local argument validation in `server/agent/tools/registry.js` and `server/agent/tools/validate.js`; do not accept SQL, code, tables, columns, or arbitrary filters (FR-004, FR-005, SC-001).
- [ ] T016 [US1] Implement policy check and executor wrapper in `server/agent/tools/execute.js`; recheck server access capability and budgets immediately before a handler, and keep private/write registry entries denied by default (FR-002, FR-004, FR-005, SC-001).
- [ ] T017 [US1] Implement evidence/inference/missing-evidence/uncompleted-action response composition in `server/agent/runtime/response.js` (FR-009).
- [ ] T018 [US1] Add the conditional HTTP adapter in `api/agent/turn.js` only if DEC-010 selects the root Vercel Node Function approach; otherwise use the path/handler selected by the approved runtime decision (FR-002, FR-010).
- [ ] T019 [US1] Add service-level request-to-terminal tests using a test-only synthetic capability for the successful fake read, and separate closed access/disclosure cases that prove zero protected calls, in `tests/contracts/agent/turn-flow.test.js` (FR-001, FR-002, FR-004, FR-009, FR-012, SC-001, SC-002).

**Checkpoint**: The synthetic graph answers or safely terminates. A production provider or private data capability is not enabled solely by this story.

## Phase 4: User Story 2 — Bound execution and recover failures (Priority: P1)

**Goal**: Enforce finite model/tool work, classify failures, cancel in-flight work, and prevent duplicate replay effects.

**Independent Test**: Inject transient/permanent provider and tool failures, timeouts, cancellation, budget exhaustion, checkpoint failure, and a replayed completed synthetic mutation; assert one terminal result within configured limits and no duplicate effect.

### Tests for User Story 2

- [ ] T020 [P] [US2] Add retry-classification tests proving only transient errors retry and authorization/validation/domain errors do not in `tests/unit/agent/retry-policy.test.js` (FR-006, FR-007, SC-002).
- [ ] T021 [P] [US2] Add timeout, `AbortSignal`, and exhausted-budget tests in `tests/contracts/agent/cancellation-and-bounds.test.js` (FR-006, FR-010, SC-002).
- [ ] T022 [P] [US2] Add fake-ledger replay tests proving durable reservation precedes a synthetic mutation and a completed result is not executed twice in `tests/contracts/agent/replay.test.js` (FR-008, SC-003).
- [ ] T023 [P] [US2] Add checkpoint/ledger-unavailable and uncertain-mutation tests in `tests/security/agent/durability-gate.test.js` (FR-008, SC-003).

### Implementation for User Story 2

- [ ] T024 [US2] Implement finite retry classification and per-node policy in `server/agent/runtime/retry.js`; retry only transient provider failures or verified idempotent reads (FR-006, FR-007, SC-002).
- [ ] T025 [US2] Propagate request cancellation and deadlines through graph, model adapter, and tool adapter in `server/agent/runtime/cancellation.js` (FR-006, FR-010, SC-002).
- [ ] T026 [US2] Integrate ledger reserve/start/outcome checks in `server/agent/tools/execute.js`; return a safe denial whenever durable acknowledgment is missing or ambiguous (FR-008, SC-003).
- [ ] T027 [US2] Implement stable safe terminal responses and allowlisted correlation events in `server/agent/http/errors.js` and `server/agent/observability/safe-events.js` (FR-009, FR-010, SC-002).

**Checkpoint**: Each injected failure has a bounded terminal category; no mutation is executable without the durable ledger contract.

## Phase 5: User Story 3 — Inspect a deterministic execution (Priority: P2)

**Goal**: Replay versioned synthetic fixtures and compare graph path, tool decisions, terminal category, and correlation metadata.

**Independent Test**: Repeated test runs with the same fixture and doubles produce the same node outcomes and decisions; natural-language response wording is not compared.

### Tests and implementation for User Story 3

- [ ] T028 [P] [US3] Add versioned graph-path, tool-decision, terminal, and correlation fixtures in `tests/fixtures/agent/deterministic-runs.js` (FR-001, FR-002, FR-012, SC-004).
- [ ] T029 [US3] Implement the deterministic replay harness in `tests/helpers/agent/replay.js` with model/tool/checkpoint doubles and stable assertions (FR-001, FR-012, SC-003, SC-004).
- [ ] T030 [US3] Add regression tests for graph-version mismatch, unknown node/checkpoint state, and unsupported provider/tool response shape in `tests/contracts/agent/replay-versioning.test.js` (FR-001, FR-003, FR-010, FR-012, SC-004).

**Checkpoint**: Repeated synthetic fixture runs match expected node transitions and tool decisions without comparing generated prose.

## Phase 6: Polish and cross-cutting verification

**Purpose**: Confirm client/server separation, safe output, integration fit, and completion evidence across all stories.

- [ ] T031 [P] Add bundle and environment boundary tests proving provider secrets and `server/` modules are absent from Vite client assets in `tests/security/agent/client-boundary.test.js` (FR-002, FR-011, SC-001).
- [ ] T032 [P] Add response/log redaction tests proving prompts, reasoning, credentials, private tool data, and raw provider errors are not exposed in `tests/security/agent/redaction.test.js` (FR-003, FR-009, SC-001).
- [ ] T033 Update `specs/SPEC-002/quickstart.md` with actual implementation commands and evidence; mark unavailable provider/runtime/access checks `NOT VERIFIED` (FR-012, SC-001–SC-004).
- [ ] T034 Run focused agent checks, `npm test`, `npm run lint`, and `npm run build` from `package.json`; record real output and verify the chosen runtime's build locally (FR-001–FR-012, SC-001–SC-004).
- [ ] T035 Review implementation against `specs/SPEC-002/spec.md`, `specs/SPEC-002/plan.md`, and `specs/SPEC-002/tasks.md`; confirm no new authentication, private provider disclosure, arbitrary tools, unbounded loop, or unapproved runtime selection, then persist evidence only through the authorized SDD run (FR-001–FR-012, SC-001–SC-004).

## Dependencies and execution order

- Setup (Phase 1) precedes the shared runtime foundation (Phase 2). T001 is blocked until the package/model compatibility and DEC-011 review; it must not install a guessed version.
- T003–T008 define shared contracts and gates; all story work depends on this phase. T006 is deny-by-default. T007 has no production persistence implementation in this SPEC.
- User Stories 1 and 2 are both P1 and share the graph foundation. Story 1 must establish adapter/graph/tool contracts before Story 2 adds bounded recovery. User Story 3 is P2 and follows the stable node/result shape.
- Tool and HTTP tasks are conditional on their approvals: T013 on DEC-006/011, T018 on DEC-010, T026 on durable SPEC-003/DEC-005 plus later write SPECs and DEC-009. A blocked task leaves that capability disabled.
- Only tasks marked `[P]` touch independent files and have no prerequisite edge. Graph integration and shared files remain sequential.

## Parallel opportunities

- After interfaces stabilize, T009–T011 use separate test files and can be authored independently.
- T020–T023 use separate failure/replay test files and can be authored independently against shared fakes.
- T031–T032 are separate security test files and can proceed independently after the runtime interface exists.
- Graph construction, provider integration, authorization, and replay persistence are not parallel because they share contracts or security gates.

## Implementation strategy

1. Establish versions and shared DTO/limit/gate/port contracts only after their decisions are resolved.
2. Build and test the graph with deterministic doubles; keep production provider/tool registries disabled.
3. Add the DeepSeek adapter only after data-sharing/model decisions and package compatibility are approved.
4. Add bounded failure/cancellation behavior and test-only replay first; production persistence remains owned by SPEC-003.
5. Integrate an HTTP route only after DEC-010 selects the runtime; private reads/writes remain gated.
6. Run security, contract, lint/build, and conformance gates; record unavailable checks as `NOT VERIFIED`.

## Notes

- All tasks are future implementation work and have not been executed in this document-only turn.
- This plan does not approve DeepSeek model IDs, package versions, timeout/retry/streaming values, Vercel runtime/region, provider disclosure, checkpoint retention, or an access-control mechanism.
- No `$sdd-run`, provider call, Supabase/DB change, dependency installation, code change, commit, push, merge, or deploy occurred while preparing this task list.
