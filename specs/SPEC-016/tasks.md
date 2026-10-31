---
description: "Draft tasks for SPEC-016; implementation requires an approved exact SDD batch."
---

# Tasks: Dependency-Aware SDD Execution and Gate Waivers

**Input**: Design documents in `specs/SPEC-016/`  
**Prerequisites**: SPEC-016@1 Draft artifacts  
**Status**: Draft planning artifact; these tasks do not authorize implementation.

## Phase 1 — Contract and isolated test foundation

- [ ] T001 [P] Add synthetic fixtures for completed/incomplete dependencies, paused batches, duplicate SPECs, overlapping scopes, exact-hash waivers, and replay attempts in `tests/fixtures/sdd-flexible-execution/`; profile `sdd_qa_tests`; scope only fixtures.
- [ ] T002 [P] Add a database-contract SQL fixture script in `supabase/tests/sdd_flexible_execution.sql` that supports isolated PostgreSQL and the owner-authorized development Supabase project, verifies a run-specific marker, creates synthetic records only, and documents rollback or exact-ID cleanup; profile `sdd_qa_tests`; scope only test setup.
- [ ] T003 [P] Add contract tests for waiver and scheduling requests in `tests/contracts/sdd/gate-waiver-and-scheduling.test.js`; profile `sdd_qa_tests`; scope only this test file.

## Phase 2 — User Story 1: Independent batch admission (P1)

- [ ] T004 [US1] Add dependency, paused-batch, duplicate-SPEC, and manifest-hash admission tests in `tests/sdd/dependency-admission.test.js`; profile `sdd_qa_tests`.
- [ ] T005 [US1] Add a cross-batch writable-scope guard to `sdd_record_task` in a new additive migration under `supabase/migrations/`; reject overlap with active runs/windows and preserve paused batch state; profile `sdd_supabase_postgres`.
- [ ] T006 [US1] Update runner admission and policy docs in `.agents/skills/sdd-run/SKILL.md`, `AGENTS.md`, and `.specify/memory/constitution.md`; verify separate batches require exact approval, completed dependencies, no active duplicate SPEC, and disjoint scopes; profile `sdd_orchestrator`.

## Phase 3 — User Story 2: Owner-authorized gate waiver (P1)

- [ ] T007 [US2] Add the waiver authorization table, `WAIVED` gate state, and exact hash/run/SPEC/gate constraints in the additive SDD migration under `supabase/migrations/`; profile `sdd_supabase_postgres`.
- [ ] T008 [US2] Add a privileged gate-waiver RPC that verifies the exact batch manifest, SPEC snapshot, run, gate eligibility, owner, reason, evidence, and idempotency key; keep runner credentials unable to authorize; profile `sdd_supabase_postgres`.
- [ ] T009 [US2] Update `sdd_complete_spec` so required gates must be `PASSED` or have a matching authorized `WAIVED` record, and waiver-linked failures are resolved with evidence; profile `sdd_supabase_postgres`.
- [ ] T010 [US2] Add `prepare-waiver` to `scripts/sdd/sddctl.js` to validate inputs and print the privileged SQL confirmation without executing it; profile `sdd_backend_api`.
- [ ] T011 [US2] Test authorized, unauthorized, stale-hash, wrong-run, wrong-gate, duplicate, and ineligible waiver requests in `tests/sdd/gate-waiver.test.js`; profile `sdd_qa_tests`.
- [ ] T012 [US2] Test status/report output distinguishes `WAIVED`, `SKIPPED`, `FAILED`, and `PASSED` in `tests/sdd/waiver-reporting.test.js`; profile `sdd_qa_tests`.
- [ ] T013 [US2] Verify a gate waiver cannot change DEC-001/009/012, product grants/RLS, or production behavior in `tests/sdd/waiver-security-boundary.test.js`; profile `sdd_security_guardrails`.

## Phase 4 — User Story 3: Auditable independent execution (P2)

- [ ] T014 [US3] Test that starting an eligible independent batch leaves an unrelated paused batch and its manifest unchanged in `tests/sdd/dependency-admission.test.js`; profile `sdd_qa_tests`.
- [ ] T015 [US3] Verify SPEC-005 planning prerequisites name completed SPEC-001@2, SPEC-002@2, and SPEC-004@2 in `specs/SPEC-005/plan.md`; profile `sdd_orchestrator`.

## Phase 5 — Verification and independent review

- [ ] T016 Run focused SDD tests and `npm test`; record exact commands and exit codes in Supabase; profile `sdd_qa_tests`.
- [ ] T017 Run `npm run lint` and `npm run build`; record actual results in Supabase; profile `sdd_qa_tests`.
- [ ] T018 Run migration/RPC contract tests against isolated PostgreSQL or, when unavailable, the verified owner-authorized development Supabase project via direct SQL; record the project/schema, marker check, synthetic IDs, and rollback or exact-ID cleanup in Supabase; profile `sdd_supabase_postgres`.
- [ ] T019 Perform read-only conformance review of manifest integrity, scope conflicts, waivers, and unchanged product decisions in `specs/SPEC-016/checklists/final-audit.md`; profile `sdd_spec_auditor`.

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| FR-001 | T003, T004, T006 |
| FR-002 | T004, T005, T006 |
| FR-003 | T014 |
| FR-004 | T004, T005, T011 |
| FR-005 | T003, T007, T008, T011 |
| FR-006 | T007, T009, T012 |
| FR-007 | T009, T011, T012, T013 |
| FR-008 | T008, T009, T011 |
| FR-009 | T008, T012, T019 |
| FR-010 | T013, T019 |
| FR-011 | T002, T018, T019 |
| SC-001 | T004, T006, T014 |
| SC-002 | T004, T005, T011 |
| SC-003 | T007, T008, T011 |
| SC-004 | T009, T012, T019 |
| SC-005 | T013, T019 |
| SC-006 | T002, T018, T019 |

## Dependencies and Execution Order

- T001–T003 precede implementation.
- T004–T006 implement and verify independent batch admission.
- T007–T013 implement the privileged waiver path and truthful reporting.
- T014–T015 verify policy boundaries and prerequisite metadata.
- T016–T019 are final quality and audit gates.

## Completion Condition

All 19 tasks must be completed with persisted evidence. Required gates must be `PASSED` or carry a valid exact `WAIVED` authorization; no waived gate may be described as passed. DEC-001, DEC-009, DEC-012, product permissions, and production settings remain unchanged.
