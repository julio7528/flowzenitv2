---
description: "Dependency-ordered implementation tasks for SPEC-006"
---

# Tasks: Ferramentas de escrita e planejamento

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Prerequisites**: SPEC-004 and SPEC-005 contracts remain compatible; plan entry gates in `plan.md` must be satisfied before any real private read/write capability is exposed.

**Implementation gate**: These tasks are a Draft plan. They do not authorize implementation. DEC-001 remains approved as retaining the existing passkey without new authentication; no separate control satisfying its server-side access gate is approved here. Real writes remain disabled until the exact SPEC version is admitted in an explicitly approved SDD batch, that separate access control is approved/implemented/verified, applicable DEC-009 entries are approved, and the transaction/idempotency mechanism is selected. Do not infer approvals from these tasks.

**Tests**: Required and proportional to this critical-risk feature. All database tests use an isolated non-production target and synthetic rows. Until the access gate is satisfied, prove that a closed gate produces zero private repository calls.

## Phase 1: Setup

**Purpose**: Prepare the implementation boundary and synthetic test inputs without exposing a capability.

- [ ] T001 [P] Add a server-only import boundary test in `tests/unit/domain-write/server-boundary.test.js` that rejects importing mutation modules from the React/Vite client graph.
- [ ] T002 [P] Add synthetic command, confirmation, and ledger fixtures in `tests/fixtures/domain-write/commands.js`, `tests/fixtures/domain-write/confirmation.js`, and `tests/fixtures/domain-write/ledger.js`; include no real IDs or private prompts.

## Phase 2: Foundational

**Purpose**: Define strict command/result contracts and default-deny ports used by every mutation story.

- [ ] T003 Define strict command DTO validators and decimal-string IDs in `server/domain/write/contracts.js`; reject extra fields and any attempt to set `tipo`, `raizid`, parent status, policy, confirmation grant, or idempotency key from model/client input.
- [ ] T004 Define the bounded outcome and error categories in `server/domain/write/outcomes.js`; never return SQL, raw Postgres/PostgREST messages, stack traces, secrets, or inaccessible record contents.
- [ ] T005 Define `MutationRepository`, transaction, and idempotency-ledger ports in `server/domain/write/repository.js`, `server/domain/write/transaction.js`, and `server/domain/write/idempotency.js`; keep storage and transaction adapter selection unresolved until the prerequisite decisions are approved.
- [ ] T006 Add the allowlisted mutation registry with DEC-001 closed-by-default behavior in `server/agent/tools/write-capabilities.js`; expose only the named operations from `contracts/write-tools.md`, exclude delete/direct-parent-status/recurrence/multi-operation tools, and prove that a closed/unverified gate stops before every private repository call.
- [ ] T007 Add contract tests for repository, transaction, and idempotency ports in `tests/contracts/domain-write/repository.test.js`, `tests/contracts/domain-write/transaction.test.js`, and `tests/contracts/domain-write/ledger.test.js`; include same-key/same-hash replay, same-key/different-hash conflict, concurrent reservation, and uncertain outcome behavior.

**Checkpoint**: No operation is executable with DEC-001 closed; no transaction adapter, schema, grant, or ledger storage is selected by this phase.

## Phase 3: User Story 1 - Criar ou editar registros hierárquicos (Priority: P1)

**Goal**: Create and rename demand, task, and subtask records using exact IDs and existing parent/type rules.

**Independent Test**: In an isolated target with synthetic rows, create each hierarchy level, test invalid/missing/wrong-type parents and duplicate names, and read back persistent decimal-string IDs and the exact parent relationship.

### Tests for User Story 1

- [ ] T008 [P] [US1] Add hierarchy operation contract tests in `tests/contracts/domain-write/hierarchy.test.js` for create and rename allowlists, required IDs, strict payloads, and rejection of direct parent/type/status writes.
- [ ] T009 [P] [US1] Add hierarchy validation unit tests in `tests/unit/domain-write/hierarchy.test.js`; enforce `demanda text NOT NULL` with at least one non-whitespace character after `btrim`, and do not invent a maximum length or name uniqueness rule because the observed schema defines neither.

### Implementation for User Story 1

- [ ] T010 [US1] Implement create/rename validation and typed domain commands in `server/domain/write/hierarchy.js`; demand has no parent, task requires a type-1 demand parent, subtask requires a type-2 task parent, and edits change only `demanda`.
- [ ] T011 [US1] Bind `create_demand`, `create_task`, `create_subtask`, `rename_demand`, `rename_task`, and `rename_subtask` in `server/agent/tools/write-capabilities.js`; require exact persistent IDs for edits and never select by duplicate name.
- [ ] T012 [US1] Add isolated hierarchy integration tests in `tests/integration/domain-write/hierarchy.test.js`; verify returned IDs and parent IDs, initial subtask/derived status read-back, and that creating a task under a weekly-allocated demand previews the trigger-cleared parent `data_exec` before/after values and causes zero writes unless the exact consequence has an approved matching confirmation.

**Checkpoint**: Hierarchy operations pass positive, invalid-parent, ambiguous-name, side-effect, read-back, and closed-gate tests; they remain unavailable for real use until all implementation gates are satisfied.

## Phase 4: User Story 2 - Alocar trabalho ao planejamento (Priority: P1)

**Goal**: Set/clear weekly demand/task dates and daily subtask date/time intervals without violating current PostgreSQL hierarchy and calendar rules.

**Independent Test**: In an isolated target, exercise week boundaries, same-week and cross-week task moves, the exact affected-child list, full/null/partial daily intervals, and overlapping activities; compare preview, committed state, and database read-back.

### Tests for User Story 2

- [ ] T013 [P] [US2] Add planning contract tests in `tests/contracts/domain-write/planning.test.js` for weekly demand/task allocation and all-or-null daily subtask scheduling.
- [ ] T014 [P] [US2] Add planning rule unit tests in `tests/unit/domain-write/planning.test.js`; preserve `date` and `time without time zone` as America/Cuiaba civil values, require daily start earlier than end and a subtask date within the parent's Monday-based week, and allow overlaps without displacing another activity.

### Implementation for User Story 2

- [ ] T015 [US2] Implement pure weekly/daily validation and exact trigger-effect preview construction in `server/domain/write/planning.js`; include every affected persistent ID and before/after schedule value for task moves and task creation under a scheduled demand.
- [ ] T016 [US2] Implement the approved transaction adapter in `server/domain/write/transaction-adapter.js` only after a separate access control satisfies DEC-001, DEC-010 and the adapter choice are approved; revalidate the target, parent, fingerprint, and complete affected set atomically, and do not model multiple Supabase REST calls as one transaction.
- [ ] T017 [US2] Bind `set_weekly_allocation` and `set_daily_subtask_schedule` in `server/agent/tools/write-capabilities.js`; require approved confirmation bound to the exact preview where DEC-009 requires it, reject stale consequences, and label displayed times `America/Cuiaba`.
- [ ] T018 [US2] Add isolated planning integration/concurrency tests in `tests/integration/domain-write/planning.test.js`; verify trigger-cleared children, same-week preservation, out-of-week rejection, no write without an exact one-time confirmation for a destructive task move, stale confirmation conflict, rollback, valid overlaps, and no duplicate effect under replay.

**Checkpoint**: Weekly and daily schedules match existing constraints and triggers; unsupported or stale writes produce no mutation, and interval overlap remains allowed.

## Phase 5: User Story 3 - Alterar status do trabalho (Priority: P1)

**Goal**: Change subtask status only and return database-derived task and demand statuses.

**Independent Test**: In an isolated target, set each valid subtask status and verify persisted subtask status plus parent statuses derived by existing triggers; direct parent status writes fail without changing state.

### Tests for User Story 3

- [ ] T019 [P] [US3] Add status operation contract tests in `tests/contracts/domain-write/status.test.js` for the five allowed subtask values and rejection of task/demand targets.
- [ ] T020 [P] [US3] Add status derivation unit tests in `tests/unit/domain-write/status.test.js` for `Backlog`, `Analise`, `Executando`, `Aguardando`, and `Done`, including no direct parent write.

### Implementation for User Story 3

- [ ] T021 [US3] Implement subtask-only status validation and command handling in `server/domain/write/status.js`; treat parent statuses as database-derived and never write them from the agent.
- [ ] T022 [US3] Bind `set_subtask_status` in `server/agent/tools/write-capabilities.js` and apply the approved SPEC-005 policy/confirmation decision without treating confirmation as owner authentication.
- [ ] T023 [US3] Add isolated status integration tests in `tests/integration/domain-write/status.test.js`; read back subtask, task, and demand after trigger execution and verify a rejected direct parent write leaves all records unchanged.

**Checkpoint**: Only the subtask status is written; task and demand status values are read back from the database derivation.

## Phase 6: Polish and cross-cutting quality gates

**Purpose**: Verify safety, regression coverage, and conformance for each enabled operation.

- [ ] T024 Add security tests in `tests/integration/domain-write/access-gate.test.js` proving a closed DEC-001 gate, missing policy/confirmation, missing durable ledger, or denied operation causes zero mutation and no false success; assert `delete` is absent from the registry, no SQL/model-controlled table access exists, and no secret, name, payload, prompt, raw result, or SQL enters client bundles or logs.
- [ ] T025 Run the scripts declared in `package.json` (`npm test`, `npm run lint`, and `npm run build`); record each real command, exit code, and result in the authorized implementation evidence, marking unavailable gates `NOT VERIFIED` rather than pass.
- [ ] T026 Perform the final SPEC conformance review against `specs/SPEC-006/spec.md`, `specs/SPEC-006/plan.md`, and `specs/SPEC-006/contracts/`; record completion evidence only through the explicitly authorized SDD execution after the exact batch is admitted.

## Dependencies and execution order

### Phase dependencies

- Setup tasks T001-T002 precede foundational contracts and tests.
- Foundational tasks T003-T007 block all stories. In particular, an adapter cannot be activated and no private call can be made while DEC-001 is unsatisfied.
- User stories follow P1 order: US1 hierarchy → US2 planning → US3 status. The stories share the allowlist, repository, transaction, and idempotency ports; do not parallelize implementation against the same files.
- T016 and the real-database integration tasks are blocked until the access/runtime/transaction decisions and exact SDD batch conditions in `plan.md` are satisfied.
- Polish tasks T024-T026 follow all enabled stories. A test result is evidence only when actually run against the named isolated target.

### Parallel opportunities

- T001 and T002 can run in parallel because they modify disjoint test files.
- Within each story, contract tests and unit tests may be authored in parallel where paths are disjoint; implementation begins after the test contracts and shared DTOs are stable.
- Integration tests that share the isolated database fixture are sequential unless their target/schema isolation is proven.
- Do not delegate tasks that share a writable file; any future parallel assignments must follow project SDD governance and be recorded by the authorized runner.

## Implementation strategy

### MVP proposal

The smallest technically testable slice is US1 with synthetic fixtures and a closed access gate. This validates type/parent contracts without exposing private data or enabling real writes. It is not authorization to enable any operation.

### Incremental delivery

1. Complete Setup and Foundational; prove default-deny behavior.
2. Complete US1 and its hierarchy-trigger side-effect tests.
3. Complete US2 only after an approved transaction boundary and applicable DEC-009 entries exist.
4. Complete US3 with database-derived status read-back.
5. Run all quality gates and record actual evidence through the authorized SDD workflow.

## Notes

- This task list does not approve DEC-001, DEC-009, DEC-010, DEC-012, retention, grants, storage, or transaction-adapter choices.
- No delete, recurring-template edit, independent appointment, direct parent status update, arbitrary SQL, or partial multi-operation workflow is included.
- No tests or implementation tasks were executed as part of this Draft planning work.
