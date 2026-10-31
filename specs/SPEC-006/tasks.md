# Tasks: Task and Subtask Creation Tools

**Input**: `spec.md`, `plan.md`, the existing Supabase client, and `server/domain/write/`.
**Execution**: Only through the exact approved SDD batch containing SPEC-006@2.

## Setup

- [ ] T001 Inspect the existing `public.demandas` schema, constraints, triggers, and current anonymous permissions using read-only evidence; record table/column names in `specs/SPEC-006/data-model.md` without printing credentials.

## US1 — Create a task

- [ ] T002 [US1] Add hierarchy tests in `tests/contracts/domain-write/hierarchy.test.js` for type 1 parent, exact ID, scheduled-demand rejection, blank name, and zero writes on invalid input.
- [ ] T003 [US1] Implement the fixed Supabase JS task insert and exact-ID read-back in `server/domain/write/supabase-repository.js` using `tipo=2` and the validated demand ID as `raizid`.
- [ ] T004 [US1] Add deterministic PostgREST request/response tests in `tests/contracts/domain-write/supabase-repository.test.js` for task insert, read-back, permission error, and uncertain response with no automatic retry.

## US2 — Create a subtask

- [ ] T005 [US2] Add subtask parent-type and persistence tests in `tests/contracts/domain-write/hierarchy-registry.test.js` for type 2 parent, `tipo=3`, and the parent task ID as `raizid`.
- [ ] T006 [US2] Wire `create_task` and `create_subtask` handlers in `server/agent/tools/write-capabilities.js` to the fixed repository adapter; do not register other mutation operations.
- [ ] T007 [US2] Register only the two POC creation tools in `server/agent/tools/registry.js` and preserve the existing read/search tools.
- [ ] T008 [US2] Add security tests in `tests/security/domain-write/` proving model-supplied SQL, table/column names, `tipo`, wrong parent type, and unsupported mutation names cause zero Supabase writes.

## Final gates

- [ ] T009 Run `npm test`, focused domain-write/security contracts, `npm run lint`, and `npm run build`; record exact command outcomes in the SDD gates and `specs/SPEC-006/quickstart.md`.
- [ ] T010 Inspect built assets and `git diff --check`; record the server boundary and no-database-change results in `specs/SPEC-006/quickstart.md`.
- [ ] T011 Perform a read-only FR/SC/task audit and record the final conformance report in `specs/SPEC-006/checklists/final-audit.md`.

## Dependencies and execution order

- T001 precedes both stories. T002–T004 complete task creation. T005–T008 complete subtask creation and tool registration. Complete this SPEC before SPEC-007.

## Independent acceptance

- Each valid request inserts one expected row and reads it back.
- Invalid parent/type/name and scheduled demand cases produce zero inserts.
- No direct Node `pg`, Docker, local PostgreSQL, service-role key, schema change, or database permission change is introduced.
