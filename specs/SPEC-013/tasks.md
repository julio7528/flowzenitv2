# Tasks: Agent Test and Evaluation Platform

**Input**: Design documents from `specs/SPEC-013/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Status**: Draft implementation plan only. This file does not approve packages, a batch, a SPEC, a database target, or thresholds.

**Tests**: Required by SPEC-013. All default runs use synthetic data/doubles and no provider credentials. DB tests require a positively verified isolated target. Playwright package/version remains an implementation dependency pending approval.

**Organization**: Tasks follow the three user stories. Test cases precede the behavior they verify. SPEC-013 provides shared harness patterns; feature SPECs continue to own their feature acceptance tests.

## Phase 1: Setup

**Purpose**: Create a test-only structure and declare future dependencies only after approval.

- [ ] T001 Create the versioned synthetic fixture tree under `tests/fixtures/agent/` without adding product or tenant fields.
- [ ] T002 Create the test support and evaluator directories in `tests/support/` and `tests/evaluations/`.
- [ ] T003 Add the approved Playwright Test package/version and test script to `package.json` and `package-lock.json` only after dependency approval; keep this task blocked until approved.

---

## Phase 2: Foundational contracts and guards

**Purpose**: Establish fixture validation, environment identity, provider/network doubles, safe evidence, and secret checks before user-story suites.

- [ ] T004 [P] Test required manifest fields, `syntheticOnly: true`, dataset-version changes, case digests, and rejected unknown schema versions in `tests/contract/datasetManifest.test.js`.
- [ ] T005 [P] Test that missing, production, ambiguous, and mismatched DB target identities abort before connection or writes in `tests/security/testEnvironmentGuard.test.js`.
- [ ] T006 [P] Test evidence output excludes prompts, credentials, transcripts, provider bodies, full URLs, and raw DB rows in `tests/security/evidenceRedaction.test.js`.
- [ ] T007 Implement the versioned synthetic dataset manifest/case validator in `tests/support/fixtureManifest.js` following `contracts/dataset-manifest.md`.
- [ ] T008 Implement the positive non-production target guard in `tests/support/testEnvGuard.js`; fail before client construction or mutation when identity is unknown.
- [ ] T009 Implement deterministic model, tool, clock, embedding, search, checkpoint, audit, trace, and Tavily doubles in `tests/support/providerDoubles.js`.
- [ ] T010 Implement the default outbound-network deny adapter and call-count assertions in `tests/support/networkGuard.js`.
- [ ] T011 Implement the allowlisted evidence schema validator in `tests/support/evidenceRecord.js` following `contracts/evidence-record.md`.
- [ ] T012 Implement secret-sentinel checks for test output and public Vite bundle artifacts in `tests/support/secretSentinel.js`.
- [ ] T013 Implement the sanitized evidence summary writer with dataset/run digests and no raw case text in `scripts/quality/reportEvidence.js`.

**Checkpoint**: Local unit/contract/evaluation suites have deterministic fixtures and cannot reach providers by default; DB suites refuse unknown/production targets before side effects.

---

## Phase 3: User Story 1 - Validate a SPEC's behavior in isolation (Priority: P1)

**Goal**: Run deterministic unit and contract checks without provider credentials or external calls.

**Independent Test**: Run a synthetic contract suite with no provider credentials and prove the network guard observed zero outbound provider calls; intentionally violate a contract and confirm failure evidence identifies the suite/case without exposing payloads.

### Tests for User Story 1

- [ ] T014 [P] [US1] Test deterministic request/model/tool/clock doubles and injected timeout, cancellation, provider outage, and retry-exhaustion outcomes in `tests/unit/providerDoubles.test.js`.
- [ ] T015 [P] [US1] Test the ordinary test mode makes zero outbound provider/search/LangSmith calls and that opt-in cannot be inherited implicitly in `tests/security/noProviderCalls.test.js`.
- [ ] T016 [P] [US1] Test contract violations return a nonzero outcome with case ID, expected/actual category, and no raw private payload in `tests/contract/evidenceFailure.test.js`.
- [ ] T017 [P] [US1] Test existing domain timeline and SDD CLI suites remain discoverable through the existing test command in `tests/contract/testDiscovery.test.js`.

### Implementation for User Story 1

- [ ] T018 [P] [US1] Add deterministic adapter doubles for SPEC-002 runtime ports and SPEC-004 typed read tools in `tests/support/providerDoubles.js`.
- [ ] T019 [US1] Wrap standard test commands with the outbound-network guard and fail the run on any unmocked provider call in `tests/support/networkGuard.js`.
- [ ] T020 [US1] Emit per-suite command, exit code, fixture version/digest, environment class, counts, result, and duration in `scripts/quality/reportEvidence.js`.
- [ ] T021 [US1] Add single-user synthetic demand/task/subtask/routine fixtures with hierarchy and status constraints in `tests/fixtures/agent/domain-v1/manifest.json`.
- [ ] T022 [US1] Verify `npm test` discovery and preserve current `tests/dailyTimeline.test.js` and `tests/sddctl.test.js` behavior in `package.json`.

**Checkpoint**: Default test runs need no external provider credentials and report zero provider calls. Existing behavior tests remain part of the quality gate.

---

## Phase 4: User Story 2 - Evaluate safety and model quality (Priority: P1)

**Goal**: Compare safe tool behavior, retrieval quality, citations, and grounding against versioned synthetic cases without assigning pending acceptance thresholds.

**Independent Test**: Run fixed security, RAG, and grounding datasets; verify metrics and dataset version are reported, unauthorized effects/secret disclosure fail, unsupported factual claims fail, and pending metric thresholds remain informational/not approved.

### Tests for User Story 2

- [ ] T023 [P] [US2] Test direct/indirect injection, untrusted retrieved text, disabled DEC-001 access despite client passkey state, malformed calls, confirmation replay, and secret sentinel exfiltration in `tests/security/agentSafety.test.js`.
- [ ] T024 [P] [US2] Test retrieval metric calculations and per-category reporting against hand-labelled synthetic cases in `tests/evaluations/retrievalMetrics.test.js`.
- [ ] T025 [P] [US2] Test grounding failures for unsupported claims and citation references absent from retrieved sources in `tests/evaluations/grounding.test.js`.
- [ ] T026 [P] [US2] Test the proposed SPEC-012 SC-001 protocol records numerator/denominator by stratum and labels its threshold/method as unapproved in `tests/evaluations/chatUsabilityProtocol.test.js`.
- [ ] T027 [P] [US2] Test a fake LangSmith sink receives only SPEC-010 allowlisted/redacted fields and ordinary evaluations make no external call in `tests/contract/langsmithEvaluation.test.js`.

### Implementation for User Story 2

- [ ] T028 [P] [US2] Add versioned injection and authorization fixtures for the single-user dataset without owner/non-owner or tenant records in `tests/fixtures/agent/security-v1/manifest.json`.
- [ ] T029 [P] [US2] Implement an evaluation runner that pins manifest version/digest and aggregates safe outcomes without storing raw prompts or answers in `tests/evaluations/runEvaluation.js`.
- [ ] T030 [US2] Reuse SPEC-009's `EvaluationCase` and report Recall@k, MRR, nDCG@k, exact-route, citation support, freshness/abstention, and structured-query baseline metrics in `tests/evaluations/ragEvaluation.js`.
- [ ] T031 [US2] Add lexical-only, vector-only, hybrid, and SPEC-004 structured baseline adapters backed by synthetic records in `tests/evaluations/retrievalAdapters.js`.
- [ ] T032 [US2] Add grounding checks that associate each factual claim/source ref to returned synthetic evidence and reject unsupported claims in `tests/evaluations/groundingEvaluation.js`.
- [ ] T033 [US2] Add the proposed 100-case, five-stratum SPEC-012 source-identification protocol and descriptive 95% interval reporting behind an unapproved profile in `tests/evaluations/chatUsability.js`.
- [ ] T034 [US2] Add LangGraph routing/failure evaluation with deterministic model/tool doubles and no provider credential requirement in `tests/evaluations/graphEvaluation.js`.
- [ ] T035 [US2] Add opt-in provider/LangSmith evaluation guards that require DEC-006 approval, synthetic data, server-only credentials, and model/version evidence in `tests/evaluations/providerOptIn.js`.
- [ ] T036 [US2] After T003 is approved, configure Playwright fixtures for 1440/820/390 viewports in `playwright.config.js` and add synthetic navigation/access-gate, keyboard, and accessible-feedback E2E cases in `tests/e2e/agent-platform.spec.js`.

**Checkpoint**: Safety and grounding assertions fail on an unsafe result; retrieval thresholds and minimum RAG gain remain informational until explicitly approved. Live provider evaluation stays disabled absent DEC-006.

---

## Phase 5: User Story 3 - Validate persistence and recovery (Priority: P2)

**Goal**: Prove database isolation, RLS behavior, idempotency, concurrency, outbox/checkpoint recovery, and cleanup without touching product data.

**Independent Test**: A refused/unknown/production target makes zero DB side effects; an isolated synthetic database can exercise security and persistence cases with exact rollback/cleanup and recorded evidence.

### Tests for User Story 3

- [ ] T037 [P] [US3] Test production/unknown database targets are rejected before client creation and DDL/DML in `tests/integration/databaseTargetGuard.test.js`.
- [ ] T038 [P] [US3] Test current anon grants/RLS behavior and future agent access-gate denial only on a local disposable product database in `supabase/tests/product/access_gate_test.sql`.
- [ ] T039 [P] [US3] Test concurrent duplicate requests, idempotency replay, and no repeated committed mutation using synthetic ledger fixtures in `tests/integration/idempotencyConcurrency.test.js`.
- [ ] T040 [P] [US3] Test outbox duplicate ordering, checkpoint corruption, interrupted worker recovery, and deletion lifecycle using an isolated database in `supabase/tests/product/recovery_test.sql`.
- [ ] T041 [P] [US3] Test rollback/exact run-scoped cleanup and reject broad truncate/wildcard cleanup in `tests/security/testCleanupPolicy.test.js`.

### Implementation for User Story 3

- [ ] T042 [US3] Wire product DB tests to `supabase test db` only after a local/disposable target is positively verified in `package.json` and `supabase/tests/product/`.
- [ ] T043 [US3] Add row-level tests for actual grants, policies, constraints, and service boundaries without assuming the current anon grants are secure in `supabase/tests/product/rls_boundary_test.sql`.
- [ ] T044 [US3] Add idempotency and concurrent write integration adapters with a synthetic durable ledger in `tests/integration/idempotencyConcurrency.test.js`.
- [ ] T045 [US3] Add interrupted outbox/checkpoint resume cases and assert completed work is not repeated in `tests/integration/persistenceRecovery.test.js`.
- [ ] T046 [US3] Add safe fixture lifecycle setup/teardown using transaction rollback or exact run IDs in `tests/support/dbFixtureLifecycle.js`.

**Checkpoint**: Database test evidence comes only from the verified isolated target; the repository's existing SDD SQL smoke remains separate and is not counted as product RLS coverage.

---

## Phase 6: Polish and cross-cutting quality evidence

- [ ] T047 [P] [US3] Add first-attempt and retry result capture so a retry pass remains classified as flaky/diagnostic in `tests/support/evidenceRecord.js`.
- [ ] T048 [P] [US2] Add secret-sentinel scanning for browser bundles, evaluation outputs, and Playwright artifacts in `tests/security/secretSentinel.test.js`.
- [ ] T049 Run approved lint, build, unit, contract, security, isolated DB, evaluation, and E2E gates and record actual outcomes in `specs/SPEC-013/validation-evidence.md`.
- [ ] T050 Perform a final conformance review mapping every FR/SC to test/evidence or `NOT VERIFIED` in `specs/SPEC-013/validation-evidence.md`.

## Dependencies and execution order

- Setup and Foundational phases precede all user stories.
- US1 uses only local doubles and synthetic fixtures; it is the proposed MVP because it makes the default test runner deterministic and network-denied.
- US2 consumes versioned datasets and the shared evidence schema; the SPEC-012 protocol is an unapproved proposal and must not change its 90% target.
- US3 runs serialized against a verified isolated DB. It does not depend on real private product access; DEC-001 closed-gate tests assert zero private side effects.
- T036 Playwright configuration depends on T003 package/tool approval. If unavailable, report E2E `NOT VERIFIED`, not passed.
- Live provider tests remain a separate explicit opt-in after DEC-006 and cannot be prerequisites for ordinary tests.

## Parallel opportunities

- T004-T006 are independent test contract files and can be authored in parallel.
- T014-T17 use disjoint test files and can proceed independently after the harness baseline.
- T023-T027 test separate evaluation/security/trace contracts; T030-T035 have disjoint evaluators after the shared manifest contract is stable.
- Database suites T038/T040/T043 must be serialized on one local database or assigned disjoint isolated databases; do not parallelize migrations or cleanup on a shared test DB.
- Do not parallelize a test-target guard change with any live DB test before its guard tests pass.

## Requirement coverage map

| Requirement | Primary tasks |
| --- | --- |
| FR-001, FR-002, FR-003 | T008-T010, T014-T020 |
| FR-004 | T015, T035 |
| FR-005, FR-006 | T005, T008, T037, T041, T046 |
| FR-007 | T014, T018, T039, T044 |
| FR-008 | T023, T028 |
| FR-009 | T024, T030, T031 |
| FR-010 | T025, T032 |
| FR-011 | T014, T034, T039, T045 |
| FR-012 | T036, T048 |
| FR-013, FR-014 | T006, T011-T013, T016, T047-T050 |
| FR-015 | T021, T028 |
| FR-016 | T005, T008, T023, T038, T043 |
| SC-001 | T015, T018-T020 |
| SC-002 | T006, T012, T023, T028, T048 |
| SC-003 | T005, T008, T037, T041 |
| SC-004 | T013, T020, T047, T049-T050 |
| SC-005 | T021, T028, T038 |
| SC-006 | T005, T008, T023, T037-T038, T043 |

## Implementation strategy

1. Deliver local manifest validation, provider doubles, network denial, and evidence checks without database/provider access.
2. Add the synthetic safety/RAG/grounding evaluation increment; report unapproved metrics as informational.
3. Add DB target guard and isolated product tests only after a target is positively verified.
4. Add Playwright after package and artifact policy review; preserve flaky first-run evidence.
5. Keep each feature SPEC's own test requirements and report all unavailable gates as `NOT VERIFIED`.

## Notes

- Task paths are future implementation locations; none were created or modified by this plan.
- No product tenant, owner UUID, or organization fixture is required.
- This task list does not approve any numerical retrieval/grounding threshold, provider call, test project, CI artifact retention, or SDD batch.
