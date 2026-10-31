# Tasks: Agent Guardrails and POC Action Policy

**Input**: `spec.md`, `plan.md`, and the current server guardrail modules.
**Execution**: Only through the exact approved SDD batch containing SPEC-005@2.

## Setup

- [ ] T001 Inspect the input validation, untrusted-content labeling, action policy, output validation, redaction, and tool executor in `server/agent/guardrails/` and `server/agent/tools/execute.js`.

## US1 — Receive grounded answers

- [ ] T002 [US1] Add injection and invalid-output cases to `tests/security/guardrails/prompt-injection.test.js` and `tests/unit/guardrails/output-validation.test.js`; assert no new capability is invoked.
- [ ] T003 [US1] Update `server/agent/guardrails/untrusted-content.js` and `server/agent/runtime/retrieval-context.js` so retrieved Supabase text is clearly marked as untrusted context.
- [ ] T004 [US1] Verify `server/agent/guardrails/redaction.js` and `server/agent/memory/safe-logging.js` omit message text, retrieved values, credentials, cookies, and provider response bodies.

## US2 — Make one clear creation

- [ ] T005 [US2] Add policy tests in `tests/unit/guardrails/policy.test.js` for the exact read/search/create allowlist, one-create limit, clarification outcomes, and unsupported mutations.
- [ ] T006 [US2] Implement the POC action policy in `server/agent/guardrails/policy.js` to allow one validated create operation for task, subtask, or recurring template without a second confirmation.
- [ ] T007 [US2] Add no-side-effect tests in `tests/security/guardrails/side-effects.test.js` proving missing/ambiguous fields, delete, rename, status, scheduling, recurrence edit, and multi-record proposals invoke zero write handlers.
- [ ] T008 [US2] Update `server/agent/runtime/response.js` to report confirmed writes as success and uncertain/dependency outcomes as non-success without exposing raw Supabase errors.
- [ ] T009 [US2] Run `npm test`, focused guardrail contracts, `npm run lint`, and `npm run build`; record actual outcomes in the SDD gates and `specs/SPEC-005/quickstart.md`.
- [ ] T010 Perform a read-only FR/SC/task audit and record the final conformance report in `specs/SPEC-005/checklists/final-audit.md`.

## Dependencies and execution order

- T001 precedes both stories. T002–T004 establish trusted input/output boundaries. T005–T008 add the narrow action policy and outcome reporting.

## Independent acceptance

- Retrieved/user text cannot change available tools or authorization.
- One clear create can execute once with no separate confirmation store or migration.
- Missing fields and unsupported writes result in clarification/denial before a Supabase write.
