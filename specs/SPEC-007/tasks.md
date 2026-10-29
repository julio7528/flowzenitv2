---
description: "Dependency-ordered implementation tasks for SPEC-007"
---

# Tasks: Interpretação temporal e recorrências

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Prerequisites**: SPEC-001/002/004/005/006 contracts remain compatible. This list is Draft and authorizes no implementation or runtime choice.

**Implementation gate**: DEC-001 remains approved as retaining the current passkey without new authentication. The separate access control that could satisfy its server-side gate remains unselected; no private query or write is enabled until that control is approved, implemented, and verified. Real series mutations also require the exact SPEC in an explicitly approved SDD batch, applicable DEC-009 approval, and an approved transaction/idempotency adapter. DEC-004 blocks occurrence exceptions; DEC-013 blocks implicit weekday/“próxima semana” resolution in queries and writes.

**Tests**: Required for fixed-clock temporal parsing, IANA data, recurrence range boundaries, round trips, idempotency, overlap preservation, and security. Use synthetic rows and isolated non-production DB targets only.

## Phase 1: Setup

**Purpose**: Establish fixed and synthetic inputs without accessing private data.

- [ ] T001 [P] Add fixed-clock Portuguese and IANA cases in `tests/fixtures/temporal/relative.js` and `tests/fixtures/temporal/iana.js`; record the tested timezone-data version with the fixture metadata.
- [ ] T002 [P] Add synthetic recurrence series and overlap fixtures in `tests/fixtures/recurrence/templates.js` and `tests/fixtures/recurrence/overlaps.js`; use no real IDs, titles, or private prompts.

## Phase 2: Foundational

**Purpose**: Define canonical temporal/series DTOs and fail-closed capability boundaries.

- [ ] T003 Define the temporal request/result union in `server/domain/temporal/contracts.js`; require server-provided `referenceInstant`, locale `pt-BR`, and literal timezone `America/Cuiaba`, with explicit `resolved`, `ambiguous`, `invalid`, and `unsupported` states.
- [ ] T004 Define the timezone adapter interface in `server/domain/temporal/timezone.js`; keep runtime/TZDB implementation replaceable until DEC-010 and the compatibility spike are approved.
- [ ] T005 Define strict recurring-series input and projection DTOs in `server/domain/recurrence/contracts.js`; represent bigint IDs as decimal strings and do not define `active`, `occurrenceId`, `exception`, or independent appointment fields.
- [ ] T006 Define bounded recurrence/temporal outcomes in `server/domain/temporal/outcomes.js` and `server/domain/recurrence/outcomes.js`; do not return raw parser, database, or runtime exceptions.
- [ ] T007 Add a default-deny tool registry in `server/agent/tools/temporal.js`; expose only `resolve_temporal/v1` from `contracts/temporal-resolution.md` and named query/series operations from `contracts/recurrence-series.md`, exclude delete/pause/resume/occurrence exceptions, and prove no private repository call occurs while DEC-001 is closed.
- [ ] T008 Add temporal and series contract tests in `tests/contracts/temporal/resolver.test.js` and `tests/contracts/temporal/series.test.js` for strict DTOs, bounded outcomes, server-owned clock/zone, and closed-gate behavior.

**Checkpoint**: Parser contracts are testable without a database; all protected reads and writes remain disabled.

## Phase 3: User Story 1 - Resolver data e hora sem ambiguidade (Priority: P1)

**Goal**: Resolve unambiguous Brazilian Portuguese temporal expressions using a fixed server instant and the approved Cuiaba zone; ask for clarification when semantics are unresolved.

**Independent Test**: Given fixed reference instants and synthetic phrases, verify local civil dates/times, absolute-instant conversion, ambiguity states, and no implicit host/browser timezone.

### Tests for User Story 1

- [ ] T009 [P] [US1] Add resolver unit tests in `tests/unit/temporal/resolve.test.js` for “hoje”, “amanhã”, explicit civil dates, explicit-offset timestamps, missing reference clock, invalid input, and bounded ambiguity reasons.
- [ ] T010 [P] [US1] Add timezone conversion and boundary tests in `tests/unit/temporal/timezone.test.js` for Cuiaba midnight, Monday/Sunday, month/year rollover, applicable historical gaps/folds, and no silent offset selection; add `tests/contracts/temporal/scheduling-interop.test.js` proving resolved values map unchanged into SPEC-006's weekly/daily DTOs; report actual Node/ICU/TZDB versions.

### Implementation for User Story 1

- [ ] T011 [US1] Implement pure phrase/result handling in `server/domain/temporal/resolve.js`; compute today from `referenceInstant` in `America/Cuiaba`, compute tomorrow as the next civil date, and return clarification for bare weekdays/“próxima semana” until DEC-013 is approved for both query and write.
- [ ] T012 [US1] Implement the selected-and-approved IANA adapter in `server/domain/temporal/timezone.js`; convert explicit instants through zone rules, preserve wall-clock values, and reject nonexistent/repeated local times without choosing an offset. Do not add a library before its approval.
- [ ] T013 [US1] Bind the resolver contract to the SPEC-002 runtime through `server/agent/tools/temporal.js`; pass the trusted request instant and fixed zone and return only bounded temporal outcomes, never model-selected timezone or host-local `Date` results.

**Checkpoint**: Unambiguous phrases resolve under fixed Cuiaba rules; unresolved semantics, gaps, folds, and missing context return clarification without a write.

## Phase 4: User Story 2 - Gerenciar uma série de rotina existente (Priority: P2)

**Goal**: Create, edit, and query series using the current table, and render applicable routines as read-only projections without persisted occurrences.

**Independent Test**: In an isolated target, validate series values, query just inside/outside inclusive date and weekday boundaries, preserve null end times, and verify no occurrence or demand/subtask count is created.

### Tests for User Story 2

- [ ] T014 [P] [US2] Add recurrence validation contract tests in `tests/contracts/temporal/series-validation.test.js`; enforce `demanda text NOT NULL` and non-whitespace after `btrim`, `dias_semana` cardinality 1–7 with unique ISO values 1–7, `data_inicial <= data_final`, and `hora_fim is null or hora_fim > hora` without adding a schema constraint.
- [ ] T015 [P] [US2] Add projection and overlap unit tests in `tests/unit/recurrence/series.test.js`; applicability requires selected ISO weekday membership plus inclusive date range, and overlapping intervals remain informational with no item displacement.

### Implementation for User Story 2

- [ ] T016 [US2] Implement pure series validation and canonical weekday handling in `server/domain/recurrence/validate.js`; preserve `hora_fim=null`, reject duplicate weekdays at input, and reject cross-midnight ranges under the current `hora_fim > hora` constraint.
- [ ] T017 [US2] Implement series commands and read-only date projection in `server/domain/recurrence/series.js`; each projection is identified by template ID plus selected civil date and never receives a persistent occurrence/demand/subtask ID.
- [ ] T018 [US2] Define typed query and mutation ports in `server/domain/recurrence/repository.js`; keep SQL/table/column selection out of model input and require the approved transaction/idempotency adapters before any real mutation.
- [ ] T019 [US2] Bind create/edit/query operations in `server/agent/tools/temporal.js`; omit delete, pause/resume/active toggle, one-occurrence exceptions, holiday overrides, and arbitrary multi-operation actions.
- [ ] T020 [US2] Implement the approved typed repository adapter in `server/domain/recurrence/repository-adapter.js` only after DEC-001, DEC-009, DEC-010, and the transaction/idempotency selection are satisfied; use existing columns only and no migration.
- [ ] T021 [US2] Add isolated recurrence integration tests in `tests/integration/recurrence/query-mutation.test.js`; verify weekday and inclusive range boundaries, persisted read-back, null `hora_fim` round trip, no occurrence insertion/count change, stale-state conflict, replay/idempotency, and non-displacing overlaps.

**Checkpoint**: Series is the only persisted object; a date-specific display is read-only and matches the existing template fields.

## Phase 5: User Story 3 - Revisar e confirmar interpretação temporal (Priority: P2)

**Goal**: Produce a canonical summary for the downstream confirmation flow that displays the date, local timezone, times, series/target, and exact affected range; stale temporal proposals are invalidated.

**Independent Test**: Compare the DTO shown to a synthetic user proposal with the canonical temporal values; change one value after confirmation and verify the downstream SPEC-005 confirmation contract rejects it before any effect.

### Tests for User Story 3

- [ ] T022 [P] [US3] Add temporal-summary contract tests in `tests/contracts/temporal/confirmation-summary.test.js` for date, `America/Cuiaba` label, start/end time, target ID, and series-wide effective range.
- [ ] T023 [P] [US3] Add stale-proposal tests in `tests/contracts/temporal/confirmation-binding.test.js` showing changed date, time, timezone, weekday, range, target, or ambiguity result cannot reuse a prior confirmation reference.

### Implementation for User Story 3

- [ ] T024 [US3] Implement the canonical display summary in `server/domain/temporal/confirmation-summary.js`; expose normalized values and affected series scope only, without issuing grants or duplicating SPEC-005 confirmation storage/policy.
- [ ] T025 [US3] Integrate the summary with SPEC-005's confirmation input contract in `server/agent/tools/temporal.js`; require a fresh downstream confirmation for protected mutations and keep confirmation distinct from DEC-001 owner access.

**Checkpoint**: A displayed time always carries `America/Cuiaba`; any changed or ambiguous proposal requires clarification/new downstream approval and no stale write occurs.

## Phase 6: Polish and cross-cutting quality gates

**Purpose**: Verify requirement coverage, privacy, and all safety gates.

- [ ] T026 Add security tests in `tests/integration/recurrence/access-gate.test.js` proving DEC-001 closed means zero private calls, DEC-009 absent denies mutation, DEC-004 occurrence exception is denied, DEC-013 ambiguity is clarified for query/write, and no phrase, private row, raw error, SQL, or secret enters logs/client bundles.
- [ ] T027 Run scripts declared in `package.json` (`npm test`, `npm run lint`, `npm run build`); record each real command, exit code, and result in authorized implementation evidence, marking unavailable checks `NOT VERIFIED` rather than pass.
- [ ] T028 Perform final conformance review against `specs/SPEC-007/spec.md`, `specs/SPEC-007/plan.md`, and `specs/SPEC-007/contracts/`; record completion evidence only through explicitly authorized SDD execution after the exact batch is admitted.

## Dependencies and execution order

### Phase dependencies

- Setup T001-T002 precedes foundational DTOs and tests.
- Foundational T003-T008 blocks stories; no private query/write can pass while DEC-001 is unsatisfied.
- US1 establishes resolver/timezone semantics. US2 consumes the resolved civil date and protected query/write ports. US3 consumes the canonical candidate from US1 and series scope from US2.
- T012 requires an approved runtime/timezone implementation choice under DEC-010. T020/T021 require DEC-001, applicable DEC-009, an approved transaction/idempotency adapter, and an exact authorized SDD batch before DB effects.
- DEC-004-specific exception tasks are intentionally absent. DEC-013 phrase mappings remain clarification tasks until the decision is approved.
- Polish follows all enabled implementation slices. A check without an actual command/result is not PASS.

### Parallel opportunities

- T001 and T002 can run in parallel because fixture paths are disjoint.
- T009 and T010 can run in parallel once T001/T003/T004 contracts are stable; their test paths are disjoint.
- T014 and T015 can run in parallel once T005 is stable; their test paths are disjoint.
- T022 and T023 can run in parallel because they cover disjoint contract files.
- Keep shared `server/agent/tools/temporal.js` changes sequential. Database tests sharing an isolated target remain sequential unless separate targets are demonstrated.
- Do not delegate work to overlapping writable files; future parallel assignments follow the authorized SDD runner.

## Implementation strategy

### MVP proposal

US1 resolver over fixed-clock synthetic inputs is the first testable slice. It does not access Supabase, call an external provider, or enable an agent capability. It is not authorization to implement or deploy.

### Incremental delivery

1. Complete Setup and Foundation, keeping tool registry default-deny.
2. Complete US1 and IANA/versioned tests.
3. Complete US2 series query/projection, then protected series mutations only after their decisions/gates are satisfied.
4. Complete US3 summary-to-confirmation contract without implementing confirmation policy/storage here.
5. Run and record real quality-gate outputs through an authorized SDD run.

## Notes

- This plan does not approve DEC-004, DEC-009, DEC-010, or DEC-013; no mechanism is invented for them.
- DEC-003 is approved and stays `America/Cuiaba`; DEC-002 remains the existing demands/tasks/subtasks/series model.
- No schema changes, local Supabase operations, provider activation, endpoint, UI, deletion, persisted occurrence, or authentication are introduced by this Draft plan.
- No task or test was executed as part of planning.
