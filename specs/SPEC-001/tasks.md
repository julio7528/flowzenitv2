# Tasks: Agent Data Integration Foundation

**Input**: Design documents in `specs/SPEC-001/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/agent-api-boundary.md`, `quickstart.md`)  
**Prerequisites**: SPEC-001 remains Draft. Any implementation requires the exact version in an explicitly user-approved SDD batch and `$sdd-run` admission.  
**Tests**: Required by the SPEC. The tasks below plan tests only; no test or implementation was run during this documentation turn.  
**Organization**: Tasks are grouped by setup, shared security foundation, and SPEC user stories. API/runtime implementation remains owned by SPEC-002.

## Phase 1: Setup

**Purpose**: Prepare isolated synthetic fixtures without product data or new dependencies.

- [ ] T001 Create reusable synthetic request/dependency fixtures in `tests/fixtures/agentBoundary.js` for FR-011/FR-013 and SC-007; include no credentials, real records, transcripts, or owner identity claims.

## Phase 2: Foundational security boundary

**Purpose**: Establish testable fail-closed, error, and logging helpers before any agent capability.

- [ ] T002 [P] Add default-closed access-gate unit tests in `tests/unit/server/accessGate.test.js` for FR-013/FR-014 and SC-007; verify passkey/sessionStorage/client fields cannot open the gate and denied requests do not invoke an injected operation.
- [ ] T003 Implement the closed-by-default capability gate in `server/security/accessGate.js` for FR-013/FR-014 and SC-007; it remains unconditionally disabled in SPEC-001, with no environment flag or request field to enable private operations. A future approved access-control implementation must replace/extend it with its own verified tests.
- [ ] T004 [P] Add sanitized error mapping tests in `tests/unit/server/apiErrors.test.js` for FR-011; distinguish invalid input, missing configuration, dependency failure, disabled capability, and empty success without exposing raw errors.
- [ ] T005 Implement the shared server error mapping in `server/http/apiErrors.js` for FR-011; return only stable public codes/messages and a server-generated request ID, leaving exact HTTP mapping subject to SPEC-002.
- [ ] T006 [P] Add allowlist/redaction tests in `tests/unit/server/safeLogContext.test.js` for FR-006/FR-014; reject prompt, transcript, task text, row data, credentials, cookies, headers, and raw exception values.
- [ ] T007 Implement request correlation and safe log context in `server/observability/safeLogContext.js` for FR-006/FR-014; retain only approved operation/outcome/duration/dependency metadata and a server-generated request ID.

**Checkpoint**: The common server boundary remains closed; no route, Supabase private-data client, provider call, or write is enabled by this phase.

## Phase 3: User Story 1 — Use existing application data after the access gate (P1)

**Goal**: Preserve an integration path for later typed queries while proving no private data is exposed before the DEC-001 gate.

**Independent Test**: With a synthetic private-data request and the gate unset/closed, the boundary returns no record and makes zero Supabase/provider calls or writes. This verifies the negative authorization path only; SC-001's positive typed-query equivalence remains NOT VERIFIED until its separate access-control prerequisite is met.

- [ ] T008 Add a security/integration test in `tests/security/agentNoPrivateAccess.test.js` for FR-004/FR-013/FR-014 and SC-007; use synthetic requests and injected Supabase/provider/side-effect spies to prove the passkey state cannot bypass the gate, arbitrary SQL/table/column proposals are rejected, and no downstream call or private operation runs. This is the required authorization/integration check while the access gate is closed; it must not connect to Supabase.

**Checkpoint**: Query behavior is not enabled while access control is unapproved, unimplemented, or unverified. Exact query execution remains owned by SPEC-004/SPEC-002.

## Phase 4: User Story 2 — Keep provider and privileged credentials out of the browser (P1)

**Goal**: Preserve the Vite public/server-only environment boundary and verify built browser assets for secret leakage.

**Independent Test**: A synthetic unprefixed server sentinel is absent from emitted browser assets and source maps; errors and safe log context omit sentinel values.

- [ ] T009 [P] Add scanner tests in `tests/security/clientAssetSecrets.test.js` for FR-006/FR-007 and SC-002; verify a synthetic sentinel is detected in a fixture and not reported when absent.
- [ ] T010 Implement a Node built-in asset scanner in `scripts/security/scan-client-assets.js` for FR-006/FR-007 and SC-002; read a synthetic sentinel from `SPEC001_SCAN_SENTINEL`, scan the supplied build output directory and source maps, and never print matched values.
- [ ] T011 Extend the safe-log tests in `tests/unit/server/safeLogContext.test.js` for FR-006/FR-011/FR-014 to assert a synthetic server-secret sentinel is absent from serialized log context and API errors.

**Checkpoint**: The existing public Supabase configuration remains client-visible only where intentionally used; no privileged or provider credential is added to `VITE_*`, browser storage, assets, source maps, or client logs.

## Phase 5: User Story 3 — Reuse RAG and write capabilities without duplication (P1)

**Goal**: Keep exact query, semantic retrieval, and write ownership in their assigned SPECs.

**Independent Test**: Apply the review procedure below to the current SPEC-002/004/005/006/007/008/009 documents and their existing contracts against `specs/SPEC-001/contracts/agent-api-boundary.md`; record the evidence and gaps in `specs/SPEC-001/checklists/requirements.md` without creating a parallel implementation.

- [ ] T012 Review `specs/SPEC-002/spec.md`, `specs/SPEC-002/plan.md`, `specs/SPEC-002/contracts/agent-turn.md`, and `specs/SPEC-002/contracts/runtime-ports.md`; `specs/SPEC-004/spec.md`, `specs/SPEC-004/plan.md`, and `specs/SPEC-004/contracts/read-tools.md`; and `specs/SPEC-005/spec.md`, `specs/SPEC-005/plan.md`, `specs/SPEC-005/contracts/guardrail-pipeline.md`, and `specs/SPEC-005/contracts/confirmation-lifecycle.md` against `specs/SPEC-001/contracts/agent-api-boundary.md` for FR-001/FR-004/FR-005/FR-008 and SC-001/SC-004/SC-005. Apply the checklist questions below, record source paths, requirement IDs/headings, PASS/FAIL/NOT VERIFIED, and follow-ups in `specs/SPEC-001/checklists/requirements.md`. Do not implement these SPECs or duplicate their capabilities.

**Checkpoint**: T012 is a documentation-level compatibility review, not an implementation dependency that reverses the roadmap. Specifically verify: (1) SPEC-002 owns server HTTP/runtime/provider orchestration and checks the DEC-001 gate before protected calls; (2) SPEC-004 owns typed exact queries, rejects arbitrary SQL/table/column selection, and keeps private reads gated; (3) SPEC-005 keeps access control separate from action policy/confirmation and cannot authorize a protected action while DEC-001 is unmet. Missing DTO/runtime detail is recorded as NOT VERIFIED; version-reference drift is documented and assigned to its owner. Private capabilities remain disabled until their separate gates are met.

## Phase 6: Polish and completion evidence

- [ ] T013 Run the required quality gates QG-01–QG-05 for SC-002/SC-007 and the admitted implementation: `npm test`, `npm run lint`, and `npm run build`; set a unique synthetic `SPEC001_SCAN_SENTINEL`, run `node scripts/security/scan-client-assets.js dist`, and record each exact command, actual exit code, and concise result in the SDD run. Do not report SC-001 as passed or claim a product database test was run.
- [ ] T014 Review `specs/SPEC-001/checklists/requirements.md` against FR-002/FR-003/FR-009/FR-010/FR-012 and SC-003/SC-006; record applicable gate outcomes, QG-07 as NOT APPLICABLE with its scope rationale, SC-001 as NOT VERIFIED while the gate is closed, SC-004/SC-005 runtime behavior as NOT VERIFIED until their owning capabilities are tested, unresolved dependencies, and completion evidence in the exact authorized SDD run without exposing credentials or private data.

## Dependencies and execution order

### Phase dependencies

- Setup T001 precedes the foundational tests.
- Foundational T002–T007 precedes user-story work; tests precede their corresponding modules (T002→T003, T004→T005, T006→T007).
- User Story 1 security test T008 requires the gate helper from T003.
- User Story 2 scanner tests precede scanner implementation (T009→T010); T011 follows the safe logging/error helpers.
- User Story 3 conformance T012 depends on the owning SPEC contracts and is recorded as NOT VERIFIED if those contracts are unavailable.
- Polish T013–T014 depends on all applicable implementation tasks and checks.

## Per-task completion and evidence

For every task below, preserve the listed path/operation and dependencies. Task completion requires the stated artifact or review result plus the evidence; a task is not complete merely because its file exists. Runtime results are produced only in a future authorized SDD run.

| Task | Depends on | Output/path | Done when | Evidence |
| --- | --- | --- | --- | --- |
| T001 | None | `tests/fixtures/agentBoundary.js` | Reusable request and dependency doubles contain synthetic values only and make no owner/authentication claim | File review and tests that import the fixture |
| T002 | T001 | `tests/unit/server/accessGate.test.js` | Tests cover absent/closed gate, ignored browser passkey/session fields, and no invocation of the injected protected operation | `npm test` result for the assertions |
| T003 | T002 | `server/security/accessGate.js` | Gate returns disabled for every current input; no environment/request flag enables private capability | T002 and T008 pass against the module |
| T004 | T001 | `tests/unit/server/apiErrors.test.js` | Tests distinguish invalid request, missing configuration, dependency failure, disabled capability, and empty success; raw errors/secrets are absent | `npm test` result for the assertions |
| T005 | T004 | `server/http/apiErrors.js` | Stable safe error categories and generated request ID are returned; raw error data is excluded; HTTP mapping remains with SPEC-002 | T004 and secret-sentinel assertions pass |
| T006 | T001 | `tests/unit/server/safeLogContext.test.js` | Tests reject/omit all listed sensitive fields and retain only allowed metadata | `npm test` result for the assertions |
| T007 | T006 | `server/observability/safeLogContext.js` | Correlation and allowlisted log context are deterministic and contain no prompt, row, credential, or raw exception data | T006 and T011 pass |
| T008 | T001, T003 | `tests/security/agentNoPrivateAccess.test.js` | Synthetic protected requests return no record and cause zero Supabase/provider calls and zero side effects; raw SQL/table/column proposals are rejected | Security assertions pass under `npm test`; spies show zero calls |
| T009 | T001 | `tests/security/clientAssetSecrets.test.js` | Synthetic sentinel is detected in a fixture and clean output has no sentinel match | `npm test` result for both positive and negative scanner cases |
| T010 | T009 | `scripts/security/scan-client-assets.js` | Node built-in scanner recursively checks supplied assets/maps, reads only the synthetic env sentinel, and never prints matched values | T009 passes; manual scanner invocation in T013 has exit code `0` for clean build |
| T011 | T005, T007 | `tests/unit/server/safeLogContext.test.js` | Serialized safe logs and API errors omit a synthetic secret sentinel | `npm test` result for sentinel assertions |
| T012 | Existing SPEC-001/002/004/005/006/007/008/009 documents | Review operation; update `checklists/requirements.md` | Required boundaries are checked with source references and status; gaps/version drift are recorded without editing owning SPECs | Completed checklist matrix with documentary evidence; no code/runtime claim |
| T013 | T001–T012 | `npm test`; `npm run lint`; `npm run build`; `node scripts/security/scan-client-assets.js dist` | Each applicable command completes with exit `0`; clean output contains no sentinel; exact outcomes are captured | Command, actual exit code, and concise result in the authorized SDD run |
| T014 | T012, T013 | Review operation; checklist and SDD run evidence | Acceptance and all quality-gate applicability/statuses are reconciled; SC-001 and runtime behavior for SC-004/SC-005 remain NOT VERIFIED where their prerequisites/owners are absent; database integration remains NOT APPLICABLE unless scope changed | Completed checklist plus persisted SDD task/gate evidence with no secrets/private data |

### Parallel opportunities

- T002, T004, and T006 use disjoint test files and may be implemented in parallel after T001.
- T009 uses a separate test path and may be prepared independently of the gate unit test once the shared fixture exists.
- T012 is documentary and may be reviewed independently of code tasks; its result is rechecked in T014.
- Do not parallelize tasks that edit the same file. SPECs within an SDD batch still execute sequentially under the manifest.

## Scope and safety gates

- These tasks do not add Supabase Auth, sessions, MFA, signup, owner UUID, users, tenants, organizations, schema, grants, RLS, or a new passkey.
- Do not use Supabase Secret/service_role as owner authentication or authorization.
- Private agent reads, writes, provider calls with private content, private RAG/history, and dashboard/private traces remain disabled until the DEC-001 access-control prerequisite is separately approved, implemented, and verified; DEC-005/006/009/010 remain applicable.
- The root `/api` Vercel Node.js option is a recommendation for SPEC-002/DEC-010 review, not a runtime approval. No endpoint is created by this planning task.
- The existing browser application path and `America/Cuiaba` behavior remain unchanged. Domain data continues to use only demands, tasks, subtasks, and routines.
- No task authorizes implementation before an exact user-approved batch manifest and `$sdd-run` admission.
