# Tasks: Agent Data Integration Foundation

**Input**: `spec.md`, `plan.md`, and the existing access gate.
**Execution**: Only through the exact approved SDD batch containing SPEC-001@3.

## Setup

- [ ] T001 Inspect the current gate and its call sites in `server/security/accessGate.js`, `server/agent/runtime/capabilities.js`, and `api/agent/turn.js`; record the existing public Supabase configuration without printing environment values.

## US1 — Use the existing Supabase data path

- [ ] T002 [US1] Add or update access-gate tests in `tests/unit/conversation/access-gate.test.js` for the fixed POC decision, including attempts to override it with request fields, passkey state, and model output.
- [ ] T003 [US1] Open the server-owned POC access decision in `server/security/accessGate.js` while preserving safe denial for invalid operation callbacks and granting no Supabase privilege.
- [ ] T004 [US1] Update the owner decision record in `specs/agent-requirements-and-decisions.md` to document public unauthenticated access through current `anon` permissions and the no-Docker/no-direct-pg boundary.

## US2 — Run the POC agent

- [ ] T005 [US2] Update `tests/security/guardrails/access-gate.test.js` to prove the gate decision cannot be changed by browser or model-controlled values and does not grant access beyond registered tools.
- [ ] T006 [US2] Run `npm test`, `npm run lint`, and `npm run build`; record exact outcomes in the active SDD gates and `specs/SPEC-001/checklists/requirements.md`.
- [ ] T007 [US2] Inspect the browser build and `git diff --check`; record the client-boundary result in `specs/SPEC-001/checklists/requirements.md`.
- [ ] T008 Perform a read-only FR/SC/task audit and record the final conformance report in `specs/SPEC-001/checklists/final-audit.md`.

## Dependencies and execution order

- T001 precedes T002–T005. Complete this SPEC before SPEC-002 consumes the POC access decision.

## Independent acceptance

- The owner-selected access policy is represented by a fixed server-side decision.
- The gate itself adds no database permission; all operations remain subject to existing Supabase `anon` grants/RLS.
- No Docker, local PostgreSQL, direct Node `pg`, service-role key, database migration, or deployment is introduced.
