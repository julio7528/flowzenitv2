# Tasks: Agent Guardrails and Action Authorization

**Input**: Design documents in `specs/SPEC-005/`  
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/guardrail-pipeline.md`, `contracts/confirmation-lifecycle.md`  
**Status**: Draft planning artifact. These tasks do not authorize implementation.

**Organization**: Tasks follow the three user stories. Foundations establish closed-by-default interfaces. Synthetic policy fixtures may test generic allow branches; no real action-to-confirmation mapping is decided here.

## Phase 1: Setup

**Purpose**: Create isolated, synthetic security-test foundations without adding dependencies or production data.

- [ ] T001 [P] Add versioned synthetic direct-injection, indirect-injection, confirmation, and secret-sentinel fixtures for FR-014 and SC-002–SC-004 in `tests/fixtures/security/direct-injection.js`, `tests/fixtures/security/indirect-injection.js`, `tests/fixtures/security/confirmations.js`, and `tests/fixtures/security/secret-sentinels.js`.
- [ ] T002 [P] Establish isolated unit-test doubles and zero-side-effect counters for SC-001–SC-004 in `tests/unit/guardrails/test-helpers.js`; do not connect to Supabase or a live model provider.

## Phase 2: Foundational Guardrail Contracts

**Purpose**: Build the server-only validation and policy boundary required by every story. Protected operations remain closed until their independent prerequisites are satisfied.

- [ ] T003 Define provenance and untrusted-source labels for user, retrieval, memory, model, provider, and web content in `server/agent/guardrails/untrusted-content.js`.
- [ ] T004 Implement bounded DTO shape, field, size, normalization, enum, and date validation in `server/agent/guardrails/input-validation.js`, using only limits selected by SPEC-002; fail closed when required limits are unavailable.
- [ ] T005 Implement deterministic canonical target and payload serialization for exact-action comparisons in `server/agent/guardrails/canonical-action.js` and `tests/unit/guardrails/canonical-action.test.js`.
- [ ] T006 Implement the server policy decision interface in `server/agent/guardrails/policy.js` with an explicit closed-by-default DEC-001 access gate; caller, model, and retrieved-content claims cannot open it.
- [ ] T007 Define stable denial categories, correlation identifiers, and safe error shapes in `server/agent/guardrails/security-events.js`; omit prompts, private record fields, payloads, and policy secrets.
- [ ] T008 Connect per-turn and tool-call budget checks to the SPEC-002 runtime configuration in `server/agent/guardrails/policy.js`; do not select numerical thresholds while DEC-012 is pending.

## Phase 3: User Story 1 - Contain Untrusted Instructions (Priority: P1)

**Goal**: Untrusted content remains data and cannot expand capabilities, reveal secrets, or trigger side effects.

**Independent Test**: Run synthetic direct and indirect injection fixtures with fake tools and secret sentinels; assert no unauthorized side effect and no secret disclosure.

- [ ] T009 [US1] Prepare provenance-preserving prompt segments and ensure untrusted text cannot be converted into policy or capability fields in `server/agent/guardrails/untrusted-content.js`.
- [ ] T010 [P] [US1] Test direct user-content injection and fake system/developer delimiters in `tests/security/guardrails/prompt-injection.test.js` using `tests/fixtures/security/direct-injection.js`.
- [ ] T011 [P] [US1] Test indirect injection in demand, memory, and external-result fixtures in `tests/security/guardrails/indirect-injection.test.js` using `tests/fixtures/security/indirect-injection.js`.
- [ ] T012 [US1] Reject unknown, disabled, or out-of-scope tool proposals before handler invocation in `server/agent/guardrails/policy.js` and verify zero side effects in `tests/security/guardrails/side-effects.test.js`.
- [ ] T013 [US1] Reject arbitrary SQL, executable code, malformed fields, and unsupported enum/date values in structured tool/control arguments before dispatch; preserve free-form user/retrieved text as inert data in `server/agent/guardrails/input-validation.js` and `tests/unit/guardrails/input-validation.test.js`.
- [ ] T014 [US1] Ensure prompt text, retrieved content, model output, and classifier signals cannot establish permission, owner identity, consent, or completed work in `tests/security/guardrails/prompt-injection.test.js`.
- [ ] T015 [US1] Classify benign validation failures, suspicious signals, and confirmed attacks in `server/agent/guardrails/security-events.js`; require evidence beyond an automated classifier to label an event a confirmed attack, with coverage in `tests/unit/guardrails/security-events.test.js`.

## Phase 4: User Story 2 - Authorize and Confirm an Action (Priority: P1)

**Goal**: Every future side effect is checked immediately before execution; confirmation and access control remain separate, exact-action, fail-closed checks.

**Independent Test**: Use a synthetic policy matrix, fake atomic grant store, fake ledger, and side-effect counter. Keep all real private-data and mutation capabilities disabled.

- [ ] T016 [US2] Evaluate capability, target scope, validated arguments, current domain preconditions, access gate, policy version, and confirmation state immediately before each handler call in `server/agent/guardrails/policy.js`.
- [ ] T017 [US2] Deny disabled, malformed, out-of-scope, expired, unknown, or unavailable-policy actions before mutation, and assert zero side effects in `tests/security/guardrails/side-effects.test.js`.
- [ ] T018 [US2] Load only an externally approved, versioned confirmation matrix in `server/agent/guardrails/policy.js`; treat missing DEC-009 entries as deny and use a synthetic matrix exclusively in `tests/fixtures/security/confirmations.js`.
- [ ] T019 [US2] Produce a canonical confirmation request summary without claiming approval or executing the action in `server/agent/guardrails/confirmation.js` and `tests/unit/guardrails/confirmation.test.js`.
- [ ] T020 [US2] Bind a proposed grant to conversation reference, operation/version, canonical target, payload hash, relevant precondition fingerprint, issue/expiry, one-time nonce, and policy version in `server/agent/guardrails/confirmation.js`; obtain any idempotency key only from the server-side confirmation/ledger port, never from a client or model.
- [ ] T021 [US2] Revalidate the access gate, matrix, target, payload, and current preconditions at confirmation time; invalidate changed or expired grants in `server/agent/guardrails/confirmation.js` and `tests/unit/guardrails/confirmation.test.js`.
- [ ] T022 [US2] Define an atomic one-time grant issue/consume port without selecting a persistence backend or TTL in `server/agent/guardrails/confirmation-ports.js` and `tests/contracts/guardrails/confirmation-store.test.js`.
- [ ] T023 [US2] Test replay and concurrent grant consumption so at most one handler invocation succeeds in `tests/security/guardrails/replay.test.js` and `tests/contracts/guardrails/confirmation-store.test.js`.
- [ ] T024 [US2] Require a successful durable idempotency reservation and recorded outcome through the SPEC-002/SPEC-006 ledger contract before a protected handler can run; deny when the port is missing or uncertain in `server/agent/guardrails/confirmation.js` and `tests/contracts/guardrails/execution-ledger.test.js`.
- [ ] T025 [US2] Verify that an action without confirmation is permitted only by a corresponding synthetic matrix entry in tests; leave all real action risk classes and confirmation requirements unresolved under DEC-009 in `tests/unit/guardrails/policy.test.js`.
- [ ] T026 [US2] Enforce configured request and tool-call budgets through the SPEC-002 port without adding thresholds or retry policy while DEC-012 remains pending in `tests/unit/guardrails/policy.test.js`.
- [ ] T027 [US2] Assert the DEC-001 access gate independently blocks private reads and privileged effects regardless of confirmation, policy result, or idempotency state in `tests/security/guardrails/access-gate.test.js`.

## Phase 5: User Story 3 - Validate Inputs and Outputs (Priority: P2)

**Goal**: Tool inputs are strict and bounded; claims, errors, and events are supported, redacted, and traceable.

**Independent Test**: Exercise valid and invalid synthetic DTOs, unsupported claims, event classifications, and secret sentinels across responses and logs.

- [ ] T028 [US3] Validate model tool arguments against the owning capability schema before dispatch and cover malformed and oversized inputs in `tests/unit/guardrails/input-validation.test.js`.
- [ ] T029 [US3] Ground factual response claims in typed tool results or source provenance, mark inference and missing evidence, and prevent fabricated completion claims in `server/agent/guardrails/output-validation.js` and `tests/unit/guardrails/output-validation.test.js`.
- [ ] T030 [US3] Apply field allowlists and redaction to responses, errors, logs, and security events in `server/agent/guardrails/redaction.js` with tests in `tests/unit/guardrails/redaction.test.js`.
- [ ] T031 [US3] Verify that synthetic secret sentinels never appear in responses, errors, logs, or event details in `tests/security/guardrails/redaction.test.js`.
- [ ] T032 [US3] Return stable denial reason categories and correlation IDs without exposing bypass-enabling policy details in `tests/unit/guardrails/security-events.test.js`.
- [ ] T033 [US3] Run the complete versioned adversarial fixture suite for direct/indirect injection, disallowed tools, malformed calls, confirmation replay, and secret-exfiltration attempts in `tests/security/guardrails/`.

## Phase 6: Polish and Cross-Cutting Verification

**Purpose**: Verify the future implementation against the reviewed contracts and preserve explicit security gates.

- [ ] T034 Run `npm run lint`, `npm run build`, and `npm test`; record actual results and record unavailable gates as NOT VERIFIED.
- [ ] T035 Run isolated contract/concurrency tests for any subsequently approved confirmation store or handler integration; use synthetic targets only and make no changes to existing FlowZenit data.
- [ ] T036 Verify every enabled operation has an approved policy entry, every missing DEC-009 entry denies, and DEC-001 still blocks private operations until its access gate is satisfied in `specs/SPEC-005/checklists/requirements.md`.
- [ ] T037 Reconcile implementation evidence with FR-001–FR-015, SC-001–SC-004, `contracts/guardrail-pipeline.md`, `contracts/confirmation-lifecycle.md`, and the no-side-effect/security gates in `specs/SPEC-005/quickstart.md`.

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| FR-001 | T016 |
| FR-002 | T017 |
| FR-003 | T003, T009–T011 |
| FR-004 | T014, T016 |
| FR-005 | T020 |
| FR-006 | T021 |
| FR-007 | T018, T025 |
| FR-008 | T004, T013, T028 |
| FR-009 | T029 |
| FR-010 | T030, T031 |
| FR-011 | T015 |
| FR-012 | T007, T032 |
| FR-013 | T008, T026 |
| FR-014 | T010–T013, T023, T031, T033 |
| FR-015 | T006, T016, T027 |
| SC-001 | T012, T017, T027, T033 |
| SC-002 | T021–T024, T033 |
| SC-003 | T010, T011, T014, T033 |
| SC-004 | T015, T030–T033 |

The following setup and final-gate tasks support the criteria across stories rather than adding separate user-visible behavior: T001–T002 provide synthetic fixtures/test doubles; T034–T035 execute the planned quality and isolated contract gates; T036 checks the DEC-001/DEC-009 enablement boundary; T037 performs final cross-artifact conformance.

## Dependencies and Execution Order

- Setup tasks T001–T002 precede the foundational guardrail interfaces.
- T003–T008 are foundational and block all user-story implementation.
- User Story 1 depends on the foundational content labels, validators, policy boundary, and safe event shape.
- User Story 2 depends on the policy boundary and SPEC-002/SPEC-006 ledger contracts. Real private reads and side effects remain blocked until DEC-001 and the relevant approved DEC-009 entry exist; durable idempotency and confirmation storage choices are also prerequisites to enabling real actions.
- User Story 3 depends on validated tool/source contracts and the safe event/redaction interfaces.
- T034–T037 are final gates. A test using a synthetic allow branch does not enable a real operation or resolve DEC-009.

## Open Decisions That Block Enablement

- **DEC-001**: no server-verifiable owner access mechanism is approved; private-data reads and privileged effects remain disabled.
- **DEC-009**: the per-action confirmation matrix is pending; all missing or unresolved entries deny.
- **DEC-012**: request/tool-call thresholds are pending; no numeric limits are introduced here.
- **DEC-005 / retention**: grant and event persistence/retention choices remain open; no backend, TTL, or retention period is selected.
- **SPEC-002 / SPEC-006 / SPEC-007**: runtime, durable idempotency, and owning mutation contracts must be available before real protected handlers are enabled.
