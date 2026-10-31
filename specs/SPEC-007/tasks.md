# Tasks: Routine Recurrence Queries and Creation

**Input**: `spec.md`, `plan.md`, existing recurrence read contracts, and `public.recorrente`.
**Execution**: Only through the exact approved SDD batch containing SPEC-007@2.

## Setup

- [ ] T001 Review `server/domain/read/routine-templates.js`, existing recurrence UI behavior, and the `public.recorrente` field constraints; record the verified table contract in `specs/SPEC-007/data-model.md`.

## US1 — Ask about routines

- [ ] T002 [US1] Add tests in `tests/contracts/recurrence/query.test.js` for explicit-date inclusion, inclusive start/end boundaries, weekday filtering, and an empty result without occurrence inserts.
- [ ] T003 [US1] Expose the existing typed template query/projection from `server/domain/read/routine-templates.js` through the agent registry in `server/agent/tools/recurrence-capabilities.js`.

## US2 — Create a routine template

- [ ] T004 [US2] Add strict input tests in `tests/unit/recurrence/create-contract.test.js` for a non-empty name, unique ISO weekdays 1–7, explicit ordered date range, valid `hora`, and nullable or later `hora_fim`.
- [ ] T005 [US2] Implement the fixed-table Supabase JS insert and exact-ID read-back in `server/domain/recurrence/supabase-repository.js`; preserve civil values and `hora_fim=null`.
- [ ] T006 [US2] Add deterministic PostgREST contract tests in `tests/contracts/recurrence/create.test.js` for the exact insert/read-back request, permission failure, invalid input, and uncertain response without retry.
- [ ] T007 [US2] Register only recurrence query and create tools in `server/agent/tools/registry.js`; leave edit, delete, pause/resume, and occurrence tools unavailable.
- [ ] T008 [US2] Add security/no-side-effect assertions in `tests/security/recurrence/` for ambiguous weekdays, “next week”, missing date/time, and any attempted occurrence or task creation.

## Final gates

- [ ] T009 Run `npm test`, focused recurrence contracts, `npm run lint`, and `npm run build`; record exact outcomes in the SDD gates and `specs/SPEC-007/quickstart.md`.
- [ ] T010 Inspect `git diff --check` and browser build output; record the server boundary and no-database-change results in `specs/SPEC-007/quickstart.md`.
- [ ] T011 Perform a read-only FR/SC/task audit and record the final conformance report in `specs/SPEC-007/checklists/final-audit.md`.

## Dependencies and execution order

- T001 precedes both stories. T002–T003 complete read/query behavior. T004–T008 add one-template creation and its safeguards.

## Independent acceptance

- Explicit-date queries show current recurring templates without writing occurrences.
- A valid explicit creation inserts one existing template and reports success only after read-back.
- Ambiguous or incomplete requests ask a question and perform zero writes.
