# Tasks: Optional Tavily External Search

**Input**: Design documents from `specs/SPEC-015/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Status**: Draft implementation plan only. No Tavily SDK, API key, real provider call, or capability activation is authorized.

**Tests**: Required by SPEC-015. Use SPEC-013 synthetic fixtures and deterministic doubles only. Production outbound requests remain blocked until DEC-006, runtime requirements, and the SPEC-001 gate are satisfied.

**Organization**: Tasks follow user-story priority. Numeric limits and retry settings are not to be invented; production configuration awaits DEC-012.

## Phase 1: Setup

**Purpose**: Establish internal contracts and safe adapter boundaries without selecting dependencies or enabling calls.

- [ ] T001 Create the server-side search tool module boundary in `src/agent/tools/publicSearchTool.js`.
- [ ] T002 Define a versioned internal public-search DTO and outcome enums in `src/agent/schemas/publicSearch.js`.
- [ ] T003 Record Tavily Search API field mapping and excluded endpoints/options in `docs/agent/tavily-provider-contract.md`.

---

## Phase 2: Foundational disclosure and trust gates

**Purpose**: Ensure the provider cannot be called before feature, access, disclosure, and runtime policy checks.

- [ ] T004 [P] Test feature-disabled and unknown configuration produce zero provider calls in `tests/security/publicSearchDisabled.test.js`.
- [ ] T005 [P] Test closed DEC-001 gate, pending DEC-006, and unknown runtime/policy states produce zero provider calls in `tests/security/publicSearchDisclosure.test.js`.
- [ ] T006 [P] Test private-name, schedule, identifier, transcript, and secret sentinels never appear in captured provider payloads while DEC-006 is pending in `tests/security/publicSearchDisclosure.test.js`.
- [ ] T007 Implement default-off feature state and fail-closed server policy resolution in `src/agent/policies/externalDisclosurePolicy.js`.
- [ ] T008 Implement origin/query classification that denies internal, mixed, or ambiguous FlowZenit-derived fields without silently rewriting them in `src/agent/policies/externalDisclosurePolicy.js`.
- [ ] T009 Add a static contract test proving the tool accepts neither arbitrary URL nor provider options, SQL, identity, or access-token fields in `tests/contract/publicSearchTool.test.js`.
- [ ] T010 Create synthetic fixture and evidence metadata for this SPEC in `tests/fixtures/SPEC-015/manifest.json`.

**Checkpoint**: An unresolved gate always stops before network I/O. User confirmation cannot override pending DEC-006.

## Phase 3: User Story 2 - Protect private FlowZenit content (Priority: P1)

**Goal**: Prevent private product data, user identity, schedules, conversation history, and credentials from leaving the application boundary.

**Independent Test**: Exercise the registered tool against deterministic doubles and synthetic sentinels; assert the fake transport receives no forbidden content and evidence contains no raw query.

### Tests for User Story 2

- [ ] T011 [P] [US2] Test user confirmation alone cannot override pending DEC-006 and a safe public reformulation requires a new request in `tests/security/publicSearchDisclosure.test.js`.
- [ ] T012 [P] [US2] Test query fingerprint/event fields exclude raw query, snippets, secrets, and sensitive URL parameters in `tests/security/publicSearchAuditRedaction.test.js`.
- [ ] T013 [P] [US2] Test direct and indirect prompt injection cannot add tools, reveal private records, or trigger domain writes in `tests/security/publicSearchInjection.test.js`.

### Implementation for User Story 2

- [ ] T014 [US2] Enforce SPEC-001 and DEC-006 gates before all provider dispatch, with no FlowZenit-derived fields allowed while DEC-006 is pending in `src/agent/policies/externalDisclosurePolicy.js`.
- [ ] T015 [US2] Mark provider content as untrusted external evidence and isolate it from system policy/tool authorization in `src/agent/graph/nodes/buildExternalEvidence.js`.
- [ ] T016 [US2] Add source rendering sanitization and external labels to the evidence formatter used by chat in `src/agent/response/externalSourceFormatter.js`.
- [ ] T017 [US2] Reuse SPEC-010's server correlation and sanitized audit-event interface without creating a Tavily store in `src/agent/observability/publicSearchEvents.js`.
- [ ] T018 [US2] Ensure provider errors and policy denials never include request payloads, credentials, response bodies, or private rows in `src/agent/providers/tavilySearchAdapter.js`.

**Checkpoint**: Synthetic sentinels are absent from fake outbound payloads/evidence and injected content has no authority.

## Phase 4: User Story 1 - Search for current public information (Priority: P2)

**Goal**: Search only when current public information is required, the capability is enabled, and server policy authorizes a public-only query.

**Independent Test**: Run the registered tool against a deterministic Tavily double and verify only an allowlisted query is dispatched and normalized sources are returned.

### Tests for User Story 1

- [ ] T019 [P] [US1] Test approved synthetic query/result bounds and allowlisted field mapping in the provider adapter without fixing production threshold values in `tests/contract/tavilySearchAdapter.test.js`.
- [ ] T020 [P] [US1] Test exact status/date/time/schedule/hierarchy queries route to SPEC-004 and produce zero Tavily calls in `tests/integration/publicSearchRouting.test.js`.
- [ ] T021 [P] [US1] Test internal semantic queries route only through SPEC-009 policy and never fall back to Tavily when internal access is blocked in `tests/integration/publicSearchRouting.test.js`.
- [ ] T022 [P] [US1] Test normalized sources retain safe title, HTTP(S) URL, optional provider time, bounded snippet provenance, retrieval time, rank, and per-response source reference in `tests/contract/publicSearchResponse.test.js`.

### Implementation for User Story 1

- [ ] T023 [US1] Implement server-side classification, registered-tool lookup, and approved query/result bounds before adapter dispatch; deny when required bound configuration is missing in `src/agent/tools/publicSearchTool.js`.
- [ ] T024 [US1] Implement a narrow Tavily Search HTTP adapter using server-only credentials and no model-controlled URL/options in `src/agent/providers/tavilySearchAdapter.js`.
- [ ] T025 [US1] Validate and normalize provider sources; reject unsafe schemes, malformed fields, and oversized response fields in `src/agent/schemas/publicSearch.js`.
- [ ] T026 [US1] Preserve external source references and labels in graph evidence without treating rank as confidence in `src/agent/tools/publicSearchTool.js`.
- [ ] T027 [US1] Keep SPEC-004 structured facts and SPEC-009 internal retrieval distinct from public search in `src/agent/routing/queryRouter.js`.

**Checkpoint**: Public synthetic queries can use the adapter; internal product questions do not invoke it. Production enablement remains gated.

## Phase 5: User Story 3 - Report limitations and failures accurately (Priority: P2)

**Goal**: Report disabled, denied, empty, insufficient, timed-out, throttled, malformed, partial, or failed search without unsupported current-web claims.

**Independent Test**: Inject each adapter outcome and verify stable response state, safe limitation text, and no definitive answer without source-backed evidence.

### Tests for User Story 3

- [ ] T028 [P] [US3] Test empty and insufficient sources result in an explicit no-evidence response in `tests/evaluation/publicSearchGrounding.test.js`.
- [ ] T029 [P] [US3] Test timeout, rate limit, provider error, and malformed response never create a definitive current-information claim in `tests/contract/publicSearchFailureStates.test.js`.
- [ ] T030 [P] [US3] Test duplicate, stale, or conflicting source metadata is handled without fabricated provenance in `tests/contract/publicSearchResponse.test.js`.
- [ ] T031 [P] [US3] Test disabled Tavily leaves internal tool routing available in `tests/integration/publicSearchRouting.test.js`.

### Implementation for User Story 3

- [ ] T032 [US3] Map transport, throttle, parse, empty, partial, and timeout cases to stable public-search outcome categories in `src/agent/providers/tavilySearchAdapter.js`.
- [ ] T033 [US3] Apply only approved retry/timeout configuration and otherwise fail closed without inventing operational limits in `src/agent/providers/tavilySearchAdapter.js`.
- [ ] T034 [US3] Compose source-cited external claims and limitations from validated `sourceRef` values only in `src/agent/response/externalSearchResponse.js`.
- [ ] T035 [US3] Add integration coverage for provider-outage degradation while preserving core internal tools in `tests/integration/publicSearchFailures.test.js`.

**Checkpoint**: No provider error, missing source, or inadequate evidence is represented as a verified current fact.

## Phase 6: Polish and cross-cutting conformance

**Purpose**: Verify evidence, gates, and optional behavior across the complete SPEC.

- [ ] T036 [P] Add synthetic E2E coverage for external-source labels, disabled state, and error presentation in `tests/e2e/chatExternalSearch.spec.js`.
- [ ] T037 Add a policy/version and fixture digest to safe SPEC-013 evidence for the search cases in `tests/fixtures/SPEC-015/manifest.json`.
- [ ] T038 Review all SPEC-015 FR/SC coverage and DEC-001/005/006/010/012 gates in `specs/SPEC-015/validation-evidence.md`.
- [ ] T039 Run future approved lint, build, unit, contract, security, and E2E gates and record actual results or `NOT VERIFIED` in `specs/SPEC-015/validation-evidence.md`.

## Dependencies & Execution Order

- **Setup (Phase 1)**: Establish proposed server-side files/contracts; no package installation.
- **Foundational (Phase 2)**: Must complete before stories; it proves default-off and fail-closed behavior.
- **US2 (P1)**: Depends on foundational gates; secures disclosure, result trust, and audit boundaries using deterministic doubles.
- **US1 (P2)**: Depends on the protected tool boundary; adds the public success path. DEC-010/012 are needed before selecting production runtime and bounds.
- **US3 (P2)**: Depends on normalized adapter outcomes and source provenance from US1.
- **Polish**: Depends on all desired stories and SPEC-013 evidence setup.

### Parallel Opportunities

- T004-T006 and T009-T010 have distinct test/fixture paths and may be parallelized with disjoint ownership.
- US2 T011-T013 tests may be parallelized by file; policy, content isolation, and audit wiring must be reviewed as one disclosure boundary.
- US1 T019-T022 tests may be parallelized by file; adapter and routing implementation are sequential where they share interfaces.
- US3 T028-T031 tests may be parallelized by file; response composition depends on validated outcome contracts.
- No task may use a live Tavily endpoint or private production data before the required decisions and gate.

## Implementation Strategy

1. Establish fail-closed contracts and synthetic doubles before any transport behavior.
2. Deliver the highest-priority privacy boundary using the disabled/deny path first.
3. Add a safe public-only mocked search path after the disclosure boundary is testable.
4. Add stable failure reporting and grounded source presentation.
5. Keep production capability disabled until DEC-001 access control, DEC-006 data policy, DEC-010 runtime, and DEC-012 bounds are satisfied and verified.

## Notes

- `[P]` means separate writable files and no unfinished dependency.
- Task IDs are sequential; every story task is labeled and names a concrete path.
- No numeric query/result/time/retry threshold is selected by this plan.
- Tavily remains optional and non-core; no test or outage may disable otherwise authorized FlowZenit internal capabilities.

## Requirement Traceability

| Criterion | Tasks |
| --- | --- |
| FR-001 | T004, T007, T014, T023 |
| FR-002 | T020, T021, T027 |
| FR-003 | T019, T023, T033 |
| FR-004 | T005, T006, T014 |
| FR-005 | T011, T014 |
| FR-006 | T022, T025, T026 |
| FR-007 | T013, T015, T022 |
| FR-008 | T016, T026, T034 |
| FR-009 | T028, T029, T032, T034, T035 |
| FR-010 | T012, T017, T021, T026 |
| FR-011 | T031, T035 |
| FR-012 | T004, T006, T013, T022, T029, T036 |
| FR-013 | T005, T006, T014, T021 |
| SC-001 | T004 |
| SC-002 | T005, T006, T014 |
| SC-003 | T020, T021, T027 |
| SC-004 | T016, T022, T025, T026, T034, T036 |
| SC-005 | T029, T032, T034, T035 |
