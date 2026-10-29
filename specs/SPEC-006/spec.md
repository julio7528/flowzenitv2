# Feature Specification: Write Tools for Demands and Planning

**SPEC ID**: SPEC-006  
**Version**: 1  
**Dependencies**: [SPEC-004, SPEC-005]  
**Risk**: critical

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Allow the agent to create and edit authorized demand hierarchy records, reschedule activities, change subtask status, and complete work while preserving current application rules.

## Scope and Exclusions

### In scope
- Typed, single-purpose mutation contracts for creating and editing demand, task, and subtask records.
- Schedule allocation changes for currently supported weekly and daily entities.
- Subtask status changes and task/demand derived status recalculation.
- Confirmation and idempotency integration, before/after results, and clear action feedback.
- Domain validation and precondition checks performed against current relational state at execution time.

### Explicitly out of scope
- Deleting records in the initial write-tool set because the user has not approved agent deletion semantics; revisit with DEC-009.
- Editing recurring templates or creating independent appointments.
- Changing product tables, triggers, status rules, or existing UI behavior.
- Arbitrary multi-operation plans that partially commit without an explicit transaction contract.

## Contracts and Constraints

- **Existing contracts**: public.demandas hierarchy: type 1 demand, 2 task, 3 subtask; raizid points to parent. Weekly planning accepts a demand without tasks or a task. Daily planning schedules subtasks. Subtask status values are Backlog, Analise, Executando, Aguardando, Done; parent statuses are derived. Planning dates and wall-clock values use America/Cuiaba as specified by DEC-003 and SPEC-007; the existing PostgreSQL date/time-without-time-zone values remain civil values and are not converted to UTC.
- **Compatibility**: Mutations use existing database constraints and status derivation. Moving a task between weeks may clear child subtask schedules outside the new week. Creating a task under a weekly-allocated demand clears the demand's weekly date. Both existing trigger effects must be enumerated in the proposal and result; confirmation policy remains subject to DEC-009.
- **Security and data handling**: Each mutation uses the existing database connection from SPEC-001 and SPEC-005 tool-policy decision. Record IDs, display numbers, action authorization, and confirmation identify or approve a proposed change but do not authenticate the owner. Real mutation endpoints remain unavailable until the SPEC-001 access-control gate is satisfied.
- **Dependencies**: [SPEC-004, SPEC-005].

## User Scenarios & Testing

### User Story 1 - Create or edit a hierarchy record (Priority: P1)

The application user asks to create or rename a demand, task, or subtask under a clearly identified parent.

**Why this priority**: Structured hierarchy management is a core agent use case.

**Independent Test**: Use isolated records to create each level, attempt invalid parent/type combinations, and verify returned IDs.

**Acceptance Scenarios**:
1. **Given** an unambiguous parent demand, **When** a task is created, **Then** it has type 2 and the correct persistent parent ID.
2. **Given** an unambiguous parent task, **When** a subtask is created, **Then** it has type 3, the correct parent ID, and its initial status follows the existing domain rule.
3. **Given** an edit request identifies multiple records with the same name, **When** no persistent record is selected, **Then** the agent asks the user to disambiguate and changes nothing.
4. **Given** a demand with a weekly date, **When** a task is created under it, **Then** the preview and result identify that the existing trigger clears the demand date, and execution uses only a confirmation policy approved through DEC-009.

### User Story 2 - Allocate work to planning (Priority: P1)

The application user assigns an eligible demand/task to a week date or a subtask to a daily date/time.

**Why this priority**: Planning is an explicit core integration area.

**Independent Test**: Use isolated schedule fixtures around week boundaries, existing sibling allocations, overlaps, and reschedule consequences.

**Acceptance Scenarios**:
1. **Given** a demand without tasks or a task, **When** weekly allocation is requested, **Then** the record is assigned to the requested date using the existing eligibility rule.
2. **Given** a subtask and its task’s allocated week, **When** a daily date and valid local time interval are requested within that week, **Then** the allocation is persisted and returned.
3. **Given** a task move would leave child subtasks outside the new week, **When** the consequences are calculated, **Then** no write occurs until the exact affected records and clearing consequence are confirmed.

### User Story 3 - Change work status (Priority: P1)

The application user changes a subtask’s status or asks to complete it.

**Why this priority**: Status updates drive task and demand progress.

**Independent Test**: Change subtask statuses and verify the database-derived parent statuses.

**Acceptance Scenarios**:
1. **Given** a subtask and a valid status, **When** the status is changed, **Then** only the subtask status is written and parent status is recalculated by existing rules.
2. **Given** a request to set a task or demand status directly, **When** no such direct mutation is permitted, **Then** the tool explains that parent status is derived and proposes the eligible child-level action without executing it.

### Edge Cases
- Parent was deleted or reparented after the model proposed a mutation.
- A task is converted implicitly to a weekly item but its demand already has another hierarchy branch; reject according to existing constraint.
- Creating the first task under a demand that has a weekly date clears that demand date through the existing trigger; the affected parent and before/after values are included in the mutation preview.
- Time end is not after time start, or date is outside the parent task week.
- The exact requested change is already present; return an idempotent no-op result.
- Database constraint or trigger rejects a change; report no success and preserve the original state.

## Requirements

### Functional Requirements

- **FR-001**: Write tools MUST be separate named operations for create, edit, weekly allocation, daily subtask allocation, and subtask status update.
- **FR-002**: Each operation MUST require exact target/parent IDs where applicable, schema-valid input, idempotency key, and current SPEC-005 policy decision. DEC-001 adds no new authentication or owner identity; this does not authorize real mutations before the SPEC-001 access-control gate is satisfied.
- **FR-003**: Creation MUST enforce type-parent compatibility: demand has no parent, task has demand parent, and subtask has task parent.
- **FR-004**: Editing MUST not change type or parent unless an explicit domain operation is later approved; names must satisfy the existing field constraints.
- **FR-005**: Weekly scheduling MUST allow only a demand with no tasks or a task, according to current application rules; it MUST reject direct weekly allocation of a subtask.
- **FR-006**: Daily scheduling MUST allow subtasks only and MUST require their date to remain within the allocated week of the parent task.
- **FR-007**: Daily intervals MUST require a valid local start earlier than end; overlaps remain allowed and results must not silently displace existing activities.
- **FR-008**: A move of a task that would clear child subtask allocations outside the destination week MUST present the exact affected items and require a valid confirmation bound to that consequence.
- **FR-009**: Status writes MUST target subtasks only. Parent statuses MUST be read back as derived values after the mutation.
- **FR-010**: Repeating an identical request with the same idempotency key MUST return the existing outcome without duplicating a record or side effect.
- **FR-011**: A stale target, changed parent, failed database constraint, denied authorization, or failed confirmation MUST result in no mutation and a stable error category.
- **FR-012**: Every successful mutation MUST return the persistent ID, operation, resulting values, affected derived statuses, and correlation ID.
- **FR-013**: Deletion tools MUST remain unavailable in this SPEC; enabling deletion requires a separately approved confirmation and hierarchy/deletion policy.
- **FR-014**: Schedule reads and writes MUST preserve the approved America/Cuiaba civil-date and local wall-clock interpretation; existing PostgreSQL date/time-without-time-zone values MUST NOT be shifted through UTC conversion. Any confirmation card displaying a time MUST label it with the IANA zone America/Cuiaba.
- **FR-015**: Multi-record atomic workflows MUST not be offered unless all changes have an explicit all-or-nothing contract.
- **FR-016**: Real mutation endpoints MUST fail closed until adequate access control is separately approved, implemented, and verified; neither the existing passkey, existing anonymous grants, nor action confirmation is sufficient.
- **FR-017**: Before a task create or weekly task move whose existing database triggers affect another record, the mutation preview MUST identify every affected record and its exact before/after schedule values; execution MUST reject stale consequences, and its confirmation rule remains governed by DEC-009.

### Key Entities

- **Mutation command**: Validated operation, target, payload, conversation/request context when applicable, and idempotency key.
- **Mutation outcome**: Committed result, no-op, denied, validation failure, or conflict with before/after state references.
- **Confirmation summary**: User-readable, canonical account of records and scheduling consequences to approve.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of invalid hierarchy, unsupported schedule type, and out-of-week fixtures leave source records unchanged.
- **SC-002**: Every successful synthetic mutation returns the persisted ID and database-confirmed resulting state.
- **SC-003**: Replaying the same request creates at most one record or schedule change.
- **SC-004**: 100% of parent status results after a subtask update match the existing derivation rule.
- **SC-005**: No task creation or task reschedule that causes an existing trigger to clear another record's schedule occurs without a matching one-time confirmation bound to the exact affected records and before/after values.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Mutation adapters stay server-only |
| Unit/integration tests | Yes | Synthetic mutation suite | Valid/invalid parent, time, status, replay |
| Database/RLS/contract tests | Yes | Isolated Supabase transaction tests | Synthetic constraints, trigger-derived status, rollback, and zero real mutation while the access-control gate is unmet |
| E2E/accessibility/security evaluation | Yes | Confirmation flow tests | Consequence summary, denial, no false success |

## Completion Evidence

- [ ] Every operation has positive, negative, replay, and stale-state test evidence.
- [ ] Database state after each accepted mutation is read back and compared.
- [ ] Task schedule side effects require exact confirmation and are covered by tests.
- [ ] Deletion remains unavailable in the shipped tool manifest.
- [ ] Real write endpoints remain unavailable until the SPEC-001 access-control gate is satisfied.

## Assumptions

- Existing database constraints/triggers remain the authoritative source for hierarchy and derived status.
- An agent mutation is one atomic domain operation unless an approved workflow contract says otherwise.
- Destructive deletion is excluded until specifically authorized.
