# Tasks: CI/CD, Environments, and Release Preparation

**Input**: Design documents from `specs/SPEC-014/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Status**: Draft implementation plan only. It does not authorize CI configuration, secret changes, migrations, publication, or deployment.

**Tests**: Required by SPEC-014. CI tests use synthetic data and no production credentials. Database/migration checks require SPEC-013's positive non-production target guard.

**Organization**: Tasks follow the three user stories. CI-host-specific work waits for explicit provider selection. No task may add deployment, merge, commit, push, promotion, or production migration to an automated pipeline.

## Phase 1: Setup

**Purpose**: Define provider-neutral gate/report paths before adding any host-specific workflow.

- [ ] T001 Create the CI quality-gate and release-readiness helper structure in `scripts/ci/`.
- [ ] T002 Add a versioned CI gate contract with lint/build/test/security/DB/E2E required-gate categories in `ci/quality-gate-contract.json`.
- [ ] T003 Document the proposed environment profile names and unresolved host/platform choices in `docs/release/environment-profiles.md`.

---

## Phase 2: Foundational boundaries

**Purpose**: Prove CI cannot publish, silently skip gates, or expose secrets before implementing profile/report behavior.

- [ ] T004 [P] Test that CI readiness distinguishes `passed`, `failed`, `skipped`, `not_verified`, and `blocked` in `tests/contract/qualityGateReport.test.js`.
- [ ] T005 [P] Test that validation workflow plans contain no deploy, promote, migration-apply, merge, commit, or push action in `tests/security/ciPublicationBoundary.test.js`.
- [ ] T006 [P] Test synthetic server-secret sentinels are reported without echoing matched values in `tests/security/secretBoundary.test.js`.
- [ ] T007 Implement the allowlisted CI gate-result model and required-gate aggregation in `scripts/ci/qualityGateReport.js`.
- [ ] T008 Implement secret sentinel scanning for source/assets/source maps/log artifacts without printing secret values in `scripts/ci/secretSentinel.js`.
- [ ] T009 Implement release-readiness aggregation that returns `not_verified` or `blocked` for missing evidence, pending required decisions, and an unmet DEC-001 access gate in `scripts/ci/releaseReadiness.js`.
- [ ] T010 Add validation that the test environment guard from SPEC-013 is invoked before DB tests in `scripts/ci/runDatabaseGates.js`.
- [ ] T011 Add a static workflow-policy check that rejects publication credentials and protected CLI commands from the validation job definition in `scripts/ci/workflowPolicy.js`.

**Checkpoint**: A green aggregate means only “ready for human review”; no publication operation is possible in the CI plan.

---

## Phase 3: User Story 1 - Validate a change before release (Priority: P1)

**Goal**: Run required checks, report actual outcomes, and fail readiness when any required gate is missing or unsuccessful.

**Independent Test**: Use synthetic passing/failing gate results; the report identifies each command and exit code, marks unavailable gates `NOT VERIFIED`, and contains no publish action.

### Tests for User Story 1

- [ ] T012 [P] [US1] Test required lint/test/build failure and absent database/E2E evidence prevent readiness in `tests/integration/qualityGateAggregation.test.js`.
- [ ] T013 [P] [US1] Test candidate gate report maps every required SPEC criterion to evidence or `NOT VERIFIED` in `tests/contract/specGateMapping.test.js`.
- [ ] T014 [P] [US1] Test quality pipeline definitions cannot invoke deployment, migration, merge, commit, or push commands in `tests/security/ciPublicationBoundary.test.js`.
- [ ] T015 [P] [US1] Test retry-pass after first failure remains `flaky` and does not become an unqualified pass in `tests/contract/qualityGateReport.test.js`.

### Implementation for User Story 1

- [ ] T016 [US1] Map existing `npm run lint`, `npm run build`, and `npm test` commands to required gate IDs without changing their behavior in `ci/quality-gate-contract.json`.
- [ ] T017 [US1] Add a deterministic CI gate runner that records command labels and actual exit codes in `scripts/ci/runQualityGates.js`.
- [ ] T018 [US1] Add evidence/report assembly using SPEC-013's safe `EvidenceRecord` fields and exact SPEC/version references in `scripts/ci/qualityGateReport.js`.
- [ ] T019 [US1] Add GitHub Actions quality-only workflow as a candidate implementation only after CI host approval, with read/check permissions and no publish credentials in `.github/workflows/quality.yml`.
- [ ] T020 [US1] Add an integration test running synthetic passing/failing gate fixtures through the report runner in `tests/integration/qualityGateAggregation.test.js`.
- [ ] T021 [US1] Add a static check that all required gates from the exact candidate SPEC set are represented in the report in `tests/contract/specGateMapping.test.js`.

**Checkpoint**: CI can report readiness evidence without publishing or changing database state. GitHub Actions setup remains blocked until the host is approved.

---

## Phase 4: User Story 2 - Protect environment secrets (Priority: P1)

**Goal**: Separate public browser configuration, CI-test values, preview credentials, and production secrets; prove no server secret reaches the browser or ordinary CI.

**Independent Test**: Use synthetic sentinels in variable matrices, bundles, source maps, logs, and artifacts; ensure a normal job has no production fallback.

### Tests for User Story 2

- [ ] T022 [P] [US2] Test `VITE_*` classification as browser-public and server secret classes as non-public in `tests/contract/environmentProfile.test.js`.
- [ ] T023 [P] [US2] Test production secret absence from CI-test environment using synthetic variable matrices in `tests/security/ciSecretScope.test.js`.
- [ ] T024 [P] [US2] Test secret sentinels are absent from Vite assets, source maps, logs, and downloadable artifacts in `tests/security/secretBoundary.test.js`.
- [ ] T025 [P] [US2] Test Preview/staging profile cannot inherit production provider/database credentials by default in `tests/contract/environmentProfile.test.js`.

### Implementation for User Story 2

- [ ] T026 [US2] Implement the approved profile mapping for browser-public variable names and server-secret classes in `scripts/ci/environmentProfile.js`.
- [ ] T027 [US2] Implement profile validation without storing or logging actual variable values in `scripts/ci/environmentProfile.js`.
- [ ] T028 [US2] Integrate secret sentinel scans over source, built assets, source maps, logs, and evidence artifacts in `scripts/ci/secretSentinel.js`.
- [ ] T029 [US2] Add a browser build boundary test that checks no server/provider key class or sentinel is present in generated public files in `tests/security/browserSecretExposure.test.js`.
- [ ] T030 [US2] Add CI permissions/profile checks that ordinary jobs have no production or provider secret access in `tests/security/ciSecretScope.test.js`.
- [ ] T031 [US2] Document environment-scoped secret owners, rotation evidence, and approved public names without secret values in `docs/release/secret-handling.md`.

**Checkpoint**: No real secret value appears in repository, browser bundle, CI report, cache key, log, or artifact. Actual project secret configuration remains a separate approved operation.

---

## Phase 5: User Story 3 - Prepare a manual release (Priority: P2)

**Goal**: Produce migration compatibility, smoke, rollback, and open-decision evidence for a human release review without deploying.

**Independent Test**: Generate a packet from synthetic candidate data with additive and irreversible migration examples; ensure unresolved/unsafe states block or remain `NOT VERIFIED` and no deploy/migration is applied.

### Tests for User Story 3

- [ ] T032 [P] [US3] Test migration report requires source/target schema, compatibility, preservation, failure, and rollback/compensation fields in `tests/contract/migrationReadiness.test.js`.
- [ ] T033 [P] [US3] Test release report blocks private agent capability readiness while DEC-001 is unmet in `tests/security/releaseReadiness.test.js`.
- [ ] T034 [P] [US3] Test missing DEC-010 runtime values, required smoke/migration evidence, and unknown Vercel auto-deploy behavior remain unresolved rather than defaulted in `tests/contract/releaseReadiness.test.js`.
- [ ] T035 [P] [US3] Test an irreversible migration without forward compensation is blocked in `tests/contract/migrationReadiness.test.js`.
- [ ] T036 [P] [US3] Test smoke validation does not query private data or infer access from the client passkey in `tests/security/releaseSmoke.test.js`.

### Implementation for User Story 3

- [ ] T037 [US3] Implement the per-migration review record and compatibility/rollback fields in `scripts/ci/migrationReadiness.js`.
- [ ] T038 [US3] Implement the release packet with exact SPEC/version, gates, secret scan, decisions, smoke, and access-gate state in `scripts/ci/releaseReadiness.js`.
- [ ] T039 [US3] Add a synthetic release-report integration test for additive and irreversible migration cases in `tests/integration/releaseReadiness.test.js`.
- [ ] T040 [US3] Add migration verification tasks against the SPEC-013 local/isolated DB guard without adding a production apply command in `scripts/ci/runDatabaseGates.js`.
- [ ] T041 [US3] Document expand/contract, forward fix, compensation, and manual schema application review in `docs/release/migration-playbook.md`.
- [ ] T042 [US3] Document manual smoke steps, verify Vercel Git auto-deploy/promotion settings before release, and separate Vercel rollback from schema recovery in `docs/release/rollback-and-smoke.md`.
- [ ] T043 [US3] Add a security test confirming the quality workflow has no Vercel deploy token or Supabase production credential binding in `tests/security/ciPublicationBoundary.test.js`.

**Checkpoint**: A `ready_for_manual_review` packet is not a release authorization; the user performs any future commit, push, merge, deploy, promotion, or production migration.

---

## Phase 6: Polish and cross-cutting quality evidence

- [ ] T044 [P] Add a static check that CI job permissions and commands contain no automatic publication operations in `tests/security/ciPublicationBoundary.test.js`.
- [ ] T045 [P] Add documentation checks for Vercel Local/Preview/Production mapping and conditional custom staging availability without selecting a plan in `tests/contract/environmentProfile.test.js`.
- [ ] T046 Run approved lint, build, unit, contract, security, isolated DB, E2E, and release-report gates and record real outcomes in `specs/SPEC-014/validation-evidence.md`.
- [ ] T047 Perform a final SPEC-014 conformance review and record each FR/SC as evidenced, blocked, or `NOT VERIFIED` in `specs/SPEC-014/validation-evidence.md`.

## Dependencies and execution order

- Setup and Foundational phases precede the three stories.
- US1 can be implemented with provider-neutral scripts and synthetic gate results before a CI host is selected. T019 remains blocked until host approval.
- US2 depends on the shared environment profile and SPEC-013 sentinel evidence contract. It does not create/configure real Vercel or provider secrets.
- US3 depends on US1/US2 report shapes and SPEC-013's verified test-target guard. DB tests remain local/dedicated non-production.
- DEC-010 is required before runtime/region/plan/duration/worker mappings can become production configuration. DEC-001 is required before marking private agent capabilities ready.
- CI validation has no deploy or production migration stage. Any future manual release remains outside this task sequence.

## Parallel opportunities

- T004-T006 can be developed in parallel because they use separate security/contract files.
- US1 report tests T012-T015 use separate files or case surfaces.
- US2 environment classification and secret scan tests can proceed independently after the profile contract is stable.
- US3 migration and release-report schema tests can proceed independently; DB validation tasks must serialize against one isolated database.
- Do not parallelize workflow/secret edits with live CI or production deployment operations.

## Requirement coverage map

| Requirement | Primary tasks |
| --- | --- |
| FR-001, FR-002, FR-011 | T004, T012, T015-T021, T044 |
| FR-003, FR-005, FR-010 | T006, T008, T022-T031 |
| FR-004 | T005, T010, T023, T030, T040 |
| FR-006 | T005, T014, T019, T043-T044 |
| FR-007 | T009, T013, T018, T032-T039 |
| FR-008 | T032, T035, T037, T039-T042 |
| FR-009 | T015, T023, T028, T030 |
| FR-012 | T034, T045 |
| FR-013 | T009, T033, T038 |
| FR-014 | T005, T011, T034, T042-T044 |
| SC-001 | T004, T012-T018, T020-T021 |
| SC-002 | T006, T008, T024, T028-T029 |
| SC-003 | T005, T010, T023, T030, T040 |
| SC-004 | T005, T014, T019, T043-T044 |
| SC-005 | T009, T033, T038 |
| SC-006 | T005, T011, T034, T042-T044 |

## Implementation strategy

1. Implement provider-neutral result schemas, secret boundary, and “no publication operation” tests.
2. Implement deterministic quality gate aggregation from existing lint/build/test commands.
3. Add environment profiles and secret-sentinel checks; do not add real secrets.
4. Add migration/readiness evidence and smoke/rollback documentation.
5. Add provider-specific workflow only after CI-host approval; add any Vercel runtime configuration only after DEC-010 and a separate explicit implementation authorization.

## Notes

- Exact GitHub Action versions, runner image, Node pin, Vercel plan/region, staging mapping and secret names are not selected here.
- No deployment settings, Vercel configuration, GitHub secrets, database schema, migration, or environment value was changed by this Draft plan.
- No commit, push, merge, deploy, promotion or production database apply task may be added without explicit user authorization.
