---
description: "Dependency-ordered implementation tasks for SPEC-004"
---

# Tasks: Domain Contracts and Read Tools

**Input**: Design documents from `specs/SPEC-004/`

**SPEC Version**: 2 (proposta para revisão)

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/read-tools.md`, and `quickstart.md`.

**Tests**: Required by the SPEC. Tests use synthetic fixtures and an isolated Supabase target only. This document is a future task plan; no task was executed here.

**Organization**: Tasks are grouped by the three user stories in `spec.md`. Paths under `server/` are proposed server-only files and must not enter the React/Vite client import graph.

## Preconditions and unresolved inputs

- Implementation requires the exact SPEC version in a user-authorized SDD batch and its normal supervisor admission.
- The DEC-001 access-control gate must be separately approved, implemented, and verified before any agent runtime/endpoint can read private production data. SPEC-001 currently exposes `isAgentAccessGateOpen()` as always false and `withAgentAccess()` never invokes its callback. The browser passkey and anonymous grants are not that gate; `service_role` is not an alternative. Tests must not add a request, environment, or fixture bypass.
- The proposed page size, text length, date-range bounds, and literal substring search behavior remain subject to user review. They must not be treated as approved executable limits until resolved.
- DEC-002 and DEC-003 remain binding: use existing demand/task/subtask/routine records and `America/Cuiaba` civil dates.

## Phase 1: Setup

**Purpose**: Establish synthetic fixtures and the server-only read module boundary.

- [ ] T001 [P] Create synthetic demand, task, subtask, and routine fixtures in `tests/fixtures/domain-read/records.js` (SC-001, SC-002, SC-004, SC-005).
- [ ] T002 Create the server-only read module skeleton in `server/domain/read/index.js` and verify no client entry imports it (FR-001, FR-016).

## Phase 2: Foundational

**Purpose**: Shared DTO validation, result/error shapes, and repository boundary required by all stories.

- [ ] T003 [P] Define decimal string IDs, existing entity/status enums, LocalDate validation, query DTOs, and result metadata in `server/domain/read/contracts.js` (FR-001, FR-002, FR-003, FR-004, FR-007, FR-009, FR-015).
- [ ] T004 [P] Define safe domain errors and public error mapping in `server/domain/read/errors.js`, excluding SQL, keys, stacks, and private payloads (FR-009, FR-011, FR-016).
- [ ] T005 Implement fixed-column Supabase repository projections and allowlisted filters in `server/domain/read/repository.js`; accept a narrowly injected server-side Supabase client, do not create a client or credential here, and keep `bigint` IDs as exact decimal strings (FR-001, FR-002, FR-003, FR-014, SC-001).
- [ ] T006 Implement deterministic ordering, bounded pagination, and filter-bound continuation handling in `server/domain/read/pagination.js`; apply only bounds reviewed by the user (FR-002, FR-009, SC-003).
- [ ] T007 Add the fail-closed access precondition in `server/domain/read/access.js` by calling the SPEC-001 `withAgentAccess()` boundary before repository calls; its current implementation always denies and never invokes the callback. Do not assume an enabled capability is supplied by SPEC-001/SPEC-002, add a bypass, or create authentication here (FR-016, SC-004).

**Checkpoint**: No agent service/runtime query may reach the repository while the access gate is closed. Repository contract tests may directly use only isolated synthetic data; they do not open the service gate.

## Phase 3: User Story 1 — Inspect hierarchy and status (Priority: P1)

**Goal**: Return exact records, hierarchy, status provenance, and safe search candidates using existing domain data.

**Independent Test**: Synthetic hierarchy fixtures prove exact persistent IDs, parent chains, stored/derived status, invalid-input rejection, not-found behavior, and no silent selection of ambiguous matches.

### Tests for User Story 1

- [ ] T008 [P] [US1] Add hierarchy, display-only numbering, and stored-versus-derived status contract tests in `tests/contracts/domain-read/hierarchy.test.js` (FR-003, FR-004, FR-008, SC-001).
- [ ] T009 [P] [US1] Add exact lookup, decimal bigint ID, and indistinguishable not-found tests in `tests/contracts/domain-read/lookup.test.js` (FR-003, FR-011, SC-001, SC-004).
- [ ] T010 [P] [US1] Add allowlisted filter, literal text, ambiguity/narrowing, and rejected arbitrary-query tests in `tests/contracts/domain-read/search.test.js` (FR-002, FR-010, FR-014, SC-004).

### Implementation for User Story 1

- [ ] T011 [US1] Implement parent/child traversal and DTO mapping in `server/domain/read/hierarchy.js`, preserving persistent IDs, display-only numbers, and status source (FR-003, FR-004, FR-008, SC-001).
- [ ] T012 [US1] Implement exact record lookup in `server/domain/read/lookup.js` using fixed projections and the shared not-found result (FR-003, FR-011, SC-001, SC-004).
- [ ] T013 [US1] Implement structured text/status/date/type search in `server/domain/read/search.js`; use only the text semantics and bounds resolved by the user (FR-001, FR-002, FR-010, FR-014, SC-004).
- [ ] T014 [US1] Integrate hierarchy, lookup, and search operations with shared validation, pagination, safe errors, and the access precondition in `server/domain/read/index.js` (FR-001, FR-009, FR-016).

**Checkpoint**: User Story 1 passes its synthetic contract tests; ambiguous matches remain separate candidates or require narrowing.

## Phase 4: User Story 2 — Inspect planning for a period (Priority: P1)

**Goal**: Return supported daily subtasks and weekly demand/task cards with civil dates, hierarchy, status, and overlaps preserved.

**Independent Test**: Synthetic schedules across week/month/year boundaries show exact daily membership, Monday-starting weeks, eligible weekly card types, explicit backlog, and no overlap suppression.

### Tests for User Story 2

- [ ] T015 [P] [US2] Add exact-date daily schedule, local time, hierarchy, and overlap contract tests in `tests/contracts/domain-read/daily-schedule.test.js` (FR-005, FR-015, SC-002).
- [ ] T016 [P] [US2] Add weekly boundary, Monday start, eligible-card, backlog, and no-subtask-card tests in `tests/contracts/domain-read/weekly-allocation.test.js` (FR-006, FR-015, SC-002).
- [ ] T017 [P] [US2] Add continuation, truncation, ordering, and concurrent-change limitation tests in `tests/contracts/domain-read/planning-pagination.test.js` (FR-009, SC-003).

### Implementation for User Story 2

- [ ] T018 [US2] Implement exact civil-date subtasks query in `server/domain/read/daily-schedule.js`; keep backlog and routine templates separate (FR-005, FR-015, SC-002).
- [ ] T019 [US2] Implement seven-civil-day weekly allocation in `server/domain/read/weekly-allocation.js`; include only demand-without-tasks and task cards, with null-date backlog separated (FR-006, FR-015, SC-002).
- [ ] T020 [US2] Integrate daily and weekly operations with metadata and stable ordering in `server/domain/read/index.js`, preserving simultaneous items and avoiding UTC conversion (FR-009, SC-002).

**Checkpoint**: User Story 2 returns exactly eligible synthetic records and clearly labels complete versus truncated responses.

## Phase 5: User Story 3 — Inspect recurring routines (Priority: P2)

**Goal**: Return applicable persisted routine templates without creating occurrence records or implying an occurrence identity.

**Independent Test**: Synthetic templates cover ISO weekdays, inclusive date boundaries, non-applicable days, optional end time, and empty results.

### Tests for User Story 3

- [ ] T021 [P] [US3] Add weekday, inclusive range, optional time, template identity, and unsupported-commitment/no-record contract tests in `tests/contracts/domain-read/routine-templates.test.js` (FR-007, FR-012, FR-013, SC-005).

### Implementation for User Story 3

- [ ] T022 [US3] Implement read-only routine-template filtering and mapping in `server/domain/read/routine-templates.js`; explain unsupported standalone commitments and do not create occurrence IDs or records (FR-007, FR-012, FR-013, SC-005).
- [ ] T023 [US3] Integrate routine templates with shared civil-date validation, ordering, metadata, and access precondition in `server/domain/read/index.js` (FR-007, FR-009, FR-016).

**Checkpoint**: User Story 3 returns only matching templates and never represents a template as a persisted activity.

## Phase 6: Polish and cross-cutting verification

**Purpose**: Verify access denial, data non-disclosure, integration contracts, and completion evidence across all stories.

- [ ] T024 [P] Add a gate-closed test proving no private repository call occurs in `tests/security/domain-read/access-gate.test.js` (FR-016, SC-004).
- [ ] T025 [P] Add isolated PostgREST/Supabase contract coverage for exact bigint text projection in `tests/contracts/domain-read/bigint-projection.test.js` using synthetic records and a non-production target; this direct repository contract test does not open the service access gate or authorize endpoint reads (FR-003, SC-001).
- [ ] T026 Add error/logging tests proving private values, SQL, credentials, and raw Supabase errors are not exposed in `tests/security/domain-read/error-disclosure.test.js` (FR-009, FR-011, FR-016, SC-004).
- [ ] T027 Update `specs/SPEC-004/quickstart.md` with the implemented commands and observed evidence; record unavailable gates as `NOT VERIFIED` (FR-009, FR-016, SC-003, SC-004).
- [ ] T028 Run the focused tests, `npm test`, `npm run lint`, and `npm run build` defined in `package.json`; record actual results without inferring unrun checks (FR-001–FR-016, SC-001–SC-005).
- [ ] T029 Review implementation against `specs/SPEC-004/spec.md`, `specs/SPEC-004/plan.md`, and `specs/SPEC-004/tasks.md`, confirm no schema/UI/authentication changes, and persist completion evidence only through the authorized SDD run (FR-001–FR-016, SC-001–SC-005).

## Dependencies and execution order

- Setup (Phase 1) precedes Foundational (Phase 2).
- Foundational tasks T003–T007 block all user stories. T007 cannot enable production reads until the independently approved DEC-001 access gate exists.
- User Stories 1 and 2 are both P1; they depend on Phase 2 but are sequentially listed to make the hierarchy/repository contracts available before planning operations. User Story 3 follows them because it is P2 and uses the shared read boundary.
- Polish tasks depend on their relevant story implementation. Only tasks explicitly marked `[P]` have disjoint files and no prerequisite edge.

## Parallel opportunities

- After T001, T003 and T004 can be developed in separate files; T005 and T006 follow their shared DTO/error contracts.
- Within User Story 1, T008–T010 are separate contract-test files and can be authored independently; service tasks follow the shared foundation.
- Within User Story 2, T015–T017 are separate test files and can be authored independently.
- User Story 3 contract tests (T021) have a separate file; routine implementation follows the shared foundation.
- T024 and T025 use separate test files and can proceed independently after the shared interfaces exist.

## Implementation strategy

1. Complete the shared boundary and validators while production private reads remain denied under the current DEC-001 implementation. Do not add a capability or bypass; isolated repository contract tests remain separate from service access.
2. Deliver User Story 1 as the first independently testable increment.
3. Deliver User Story 2 with exact civil-date semantics and bounded results.
4. Deliver User Story 3 as a separate template-only read operation.
5. Complete security, integration, lint/build, and conformance evidence. No production private read is enabled merely by completion of this SPEC.

## Notes

- These are planned future implementation tasks only; none were executed during this documentation work.
- No implementation task authorizes a migration, grant/RLS change, service-role use as user authorization, UI change, semantic retrieval, new entity, or independent authentication mechanism.
- No commit, push, merge, deploy, or `$sdd-run` was performed while preparing this plan.
