# Feature Specification: Task and Subtask Creation Tools

**SPEC ID**: SPEC-006
**Version**: 2
**Dependencies**: [SPEC-001, SPEC-002, SPEC-004, SPEC-005]
**Risk**: high
**Status**: Draft

## POC scope

Expose only typed creation of a task under a demand and a subtask under a task. Use the existing Supabase JavaScript/PostgREST client and current `anon` permissions. Do not add a database adapter, table, migration, grant, RLS policy, or RPC.

The parent is selected by an exact persistent ID after typed lookup; names alone never select a record. `public.demandas` uses `tipo=1` for a demand, `tipo=2` for a task, `tipo=3` for a subtask, and `raizid` for the parent ID. The inserted row is read back before the agent reports success.

Creating a task under a demand with an existing weekly date is not supported in the POC because the current database trigger may clear that date. Ask the user to choose an unscheduled demand. Do not schedule, rename, change status, or delete records.

## User scenarios

### US1 — Create a task

As a user, I ask the agent to create a named task under a specific demand.

**Acceptance**: the demand exists, is type 1, and has no weekly date; exactly one type 2 row is inserted with the demand ID as `raizid`; the returned row is verified before success is shown.

### US2 — Create a subtask

As a user, I ask the agent to create a named subtask under a specific task.

**Acceptance**: the parent exists and is type 2; exactly one type 3 row is inserted with the task ID as `raizid`; the returned row is verified before success is shown.

## Functional requirements

- **FR-001**: Register only `create_task` and `create_subtask` as writes in this SPEC.
- **FR-002**: Accept a non-empty trimmed name and an exact decimal parent ID; reject missing, malformed, ambiguous, or wrong-type parents before insert.
- **FR-003**: Use the existing Supabase JS/PostgREST connection and current `anon` permissions only.
- **FR-004**: Insert the expected `tipo` and `raizid`; rely on existing constraints/triggers for integrity and make no schema or permission changes.
- **FR-005**: Reject task creation when the parent demand has `data_exec` set, avoiding the existing trigger's schedule-clearing side effect.
- **FR-006**: Read back the inserted record and only then return a success outcome with its ID and parent relationship.
- **FR-007**: Do not automatically retry a write after a timeout or uncertain response. Report that the outcome could not be confirmed and ask the user to check before retrying.
- **FR-008**: Never accept SQL, table/column names, `tipo`, `raizid`, or authorization flags from the model as authority; construct those fields in server code.

## Exclusions

Demand creation, rename, weekly allocation, daily schedule, status changes, delete, multi-record creation, recurrence rows, transaction ledgers, database migrations, direct `pg`, Docker, and local PostgreSQL are outside this SPEC.

## Success criteria

- **SC-001**: Valid task/subtask creation generates exactly one correctly parented row through the current Supabase JS client.
- **SC-002**: Invalid or wrong-type parent, blank name, unsupported operation, and scheduled demand produce zero insert calls.
- **SC-003**: The agent reports success only after the new row is read back from Supabase.
- **SC-004**: Tests cover PostgREST request shape, safe errors, and no automatic duplicate retry.
- **SC-005**: `npm test`, lint, and production build pass with actual command evidence.
