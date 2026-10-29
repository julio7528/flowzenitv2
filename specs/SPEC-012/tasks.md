# Tasks: FlowZenit Agent Chat Interface

**Input**: Design documents from `specs/SPEC-012/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`).

**Status**: Draft implementation plan only. No implementation is authorized by this task list.

**Tests**: Required by the SPEC and proportional to its high security risk. Use synthetic fixtures and isolated API tests. Do not use production transcripts, live provider calls, or real Supabase data.

**Organization**: Tasks are grouped by the three user stories. Story tests precede behavior tasks. The actual private read/history/write capabilities remain blocked by DEC-001; history persistence by DEC-005; external provider use by DEC-006; live mutation policy by DEC-009; runtime/streaming by DEC-010.

## Phase 1: Setup

**Purpose**: Prepare the proposed chat feature surface within the current React/Vite project without adding packages.

- [ ] T001 Create the proposed chat feature component directory at `src/components/chat/` and keep existing page modules unchanged.
- [ ] T002 Create the chat page/style module boundary in `src/pages/ChatPage.jsx` and `src/pages/ChatPage.css`.
- [ ] T003 Add synthetic-only response fixtures for read, partial, denied, action, history, and network ambiguity cases in `tests/fixtures/chatResponses.js`.

---

## Phase 2: Foundational contracts and safety

**Purpose**: Establish shared view/state/adapter boundaries and prove the closed-gate behavior before story integration.

- [ ] T004 [P] Add contract tests for allowlisted view-model outcomes, unknown schema versions, and sanitized error mapping in `tests/contract/chatViewModel.test.js`.
- [ ] T005 [P] Add a closed-gate integration test proving zero private history/repository/provider/tool calls and no existence/count metadata in `tests/integration/chatAccessGate.test.js`.
- [ ] T006 Define the transient conversation/message/turn view-model validators in `src/lib/chatState.js` without browser-storage persistence.
- [ ] T007 Implement the chat client adapter for same-origin SPEC-002/003 contracts only after those contracts are approved by their owners in `src/lib/agentApi.js`; do not add endpoint or authorization semantics owned by those SPECs.
- [ ] T008 Implement the UI request/terminal transition reducer in `src/lib/chatState.js` following `specs/SPEC-012/contracts/chat-state-machine.md`.
- [ ] T009 Add generic access-disabled, unavailable, empty, stale, and partial presentation states in `src/components/chat/ChatStatus.jsx`.
- [ ] T010 Add the lazy chat route and navigation entry inside the existing application shell in `src/App.jsx`; route access must not be described as API authorization.
- [ ] T011 Add adapter security tests that reject private response content while the server capability is disabled in `tests/security/chatAccessBoundary.test.js`.

**Checkpoint**: The route can render a generic disabled state and synthetic data only; it has no direct Supabase/provider integration.

---

## Phase 3: User Story 1 - Ask a question about work (Priority: P1)

**Goal**: Submit a read-only question through the server adapter and render a grounded answer with usable source context, explicit uncertainty, and safe request lifecycle.

**Independent Test**: With synthetic responses, verify a matching structured result and source, no result, partial/stale result, timeout, failure, duplicate submit, and ambiguous network response.

### Tests for User Story 1

- [ ] T012 [P] [US1] Test read response rendering, evidence labels, missing references, partial/stale wording, and `America/Cuiaba` formatting in `tests/unit/chatAnswer.test.js`.
- [ ] T013 [P] [US1] Test pending, timeout, failure, cancellation, duplicate-submit, and pending-verification transitions in `tests/unit/chatState.test.js`.
- [ ] T014 [P] [US1] Test that the turn request contains no owner/session/passkey authority and conversation IDs remain grouping references in `tests/contract/agentApi.test.js`.
- [ ] T015 [P] [US1] Add a synthetic E2E journey for matching, empty, and partial read responses in `tests/e2e/chat-read.spec.js` using the approved E2E runner when available.

### Implementation for User Story 1

- [ ] T016 [P] [US1] Render allowlisted assistant/user/tool-summary message types without raw tool or provider payloads in `src/components/chat/MessageList.jsx`.
- [ ] T017 [P] [US1] Render human-readable source labels and freshness/evidence kind in `src/components/chat/SourceReference.jsx`.
- [ ] T018 [US1] Implement message composition, keyboard submission, and in-flight duplicate-submit prevention in `src/components/chat/MessageComposer.jsx`.
- [ ] T019 [US1] Connect the read-only submit path to the client adapter and display the opaque conversation identifier and server turn/correlation IDs only as non-authorizing references in `src/pages/ChatPage.jsx`.
- [ ] T020 [US1] Render no-result, clarification, partial, stale, denied, timeout, and dependency-failure states without converting errors into empty results in `src/pages/ChatPage.jsx`.
- [ ] T021 [US1] Format displayed message/source planning times with an explicit `America/Cuiaba` label in `src/lib/chatFormatting.js`.
- [ ] T022 [US1] Add a synthetic E2E journey for timeout, duplicate-submit prevention, and pending-verification reconciliation in `tests/e2e/chat-recovery.spec.js`; exact transactional facts must come from SPEC-004 fixtures.

**Checkpoint**: Read-only UI works against synthetic responses. Real private queries remain disabled until DEC-001 and the SPEC-004 server gate are implemented and verified; real provider content remains blocked by DEC-006.

---

## Phase 4: User Story 2 - Confirm a proposed change (Priority: P1)

**Goal**: Present an exact, server-supplied action proposal and make the outcome/restrictions clear without creating a client-side authorization policy.

**Independent Test**: Synthetic policy fixtures cover confirmation-required, unresolved/denied policy, cancellation, payload/precondition changes, expiry, replay, duplicate confirmation, and uncertain completion; unresolved DEC-009 yields zero live mutations.

### Tests for User Story 2

- [ ] T023 [P] [US2] Test proposal display allowlists, changed/stale/expired denial states, and schedule-zone labels in `tests/unit/actionProposal.test.js`.
- [ ] T024 [P] [US2] Test that cancel, reject, duplicate, changed payload, expired proposal, and unresolved policy invoke no mutation in `tests/integration/actionProposal.test.js` with synthetic fixtures.
- [ ] T025 [P] [US2] Test network ambiguity and ExecutionLedger status lookup before retry in `tests/integration/actionReplay.test.js` using a fake server adapter.
- [ ] T026 [P] [US2] Add a synthetic action-proposal E2E journey that asserts no success before an acknowledged terminal result in `tests/e2e/chat-actions.spec.js`.

### Implementation for User Story 2

- [ ] T027 [P] [US2] Render the allowlisted canonical target, proposed values, consequences, expiry, and safe status from `specs/SPEC-012/contracts/action-proposal-view.md` in `src/components/chat/ActionProposalCard.jsx`.
- [ ] T028 [US2] Show confirm controls only when the server marks the proposal actionable under an approved DEC-009 policy; keep live mutation disabled while DEC-009 is pending in `src/components/chat/ActionProposalCard.jsx`.
- [ ] T029 [US2] Implement cancel/reject and confirmation result states without treating the click itself as success or authorization in `src/components/chat/ActionProposalCard.jsx`.
- [ ] T030 [US2] Reconcile uncertain action outcomes through the server turn/ledger lookup contract before allowing a retry in `src/lib/agentApi.js`.
- [ ] T031 [US2] Add focus management and keyboard interaction for the action proposal/confirmation view using existing dialog patterns in `src/components/chat/ActionProposalCard.jsx`.
- [ ] T032 [US2] Verify that the synthetic action journey produces zero mutation for cancelled, changed, stale, expired, rejected, and replayed proposals in `tests/e2e/chat-actions.spec.js`.

**Checkpoint**: Proposal presentation may be validated with fixtures. Live mutations remain blocked until DEC-001, DEC-009, SPEC-005/006/007 policy, and SPEC-002 durable idempotency/ledger requirements are satisfied.

---

## Phase 5: User Story 3 - Continue a prior conversation (Priority: P2)

**Goal**: Present the SPEC-003 conversation list/history and maintain stable continuity only when the access and lifecycle gates permit it.

**Independent Test**: Synthetic tests cover paginated ordering, conversation selection, malformed/unknown IDs, closed access, retention/deletion states, and interrupted history requests.

### Tests for User Story 3

- [ ] T033 [P] [US3] Test conversation pagination, stable message ordering, and history outcome mapping in `tests/contract/conversationHistory.test.js`.
- [ ] T034 [P] [US3] Test that access-disabled, malformed, and unknown conversation requests render no private content/existence metadata in `tests/integration/chatHistoryGate.test.js`.
- [ ] T035 [P] [US3] Add a synthetic E2E journey for selecting a thread, loading another page, and handling unavailable history in `tests/e2e/chat-history.spec.js`.

### Implementation for User Story 3

- [ ] T036 [P] [US3] Render conversation summaries and selected-thread state from the SPEC-003 history adapter in `src/components/chat/ConversationList.jsx`.
- [ ] T037 [US3] Implement bounded history-page loading and cursor handling through the SPEC-003 adapter in `src/lib/agentApi.js`.
- [ ] T038 [US3] Clear previous thread content before a conversation switch and on access-disabled outcomes in `src/pages/ChatPage.jsx`.
- [ ] T039 [US3] Render loading, empty, unavailable, deleting/deleted, and access-disabled history states without persisting transcript data in `src/pages/ChatPage.jsx`.
- [ ] T040 [US3] Add synthetic history tests for malformed/unknown IDs, deletion state, and closed-gate non-disclosure in `tests/e2e/chat-history.spec.js`.

**Checkpoint**: History UI may use synthetic fixtures. Real history persistence and retrieval remain disabled until DEC-001 and DEC-005 are satisfied by their owning SPECs.

---

## Phase 6: Polish and cross-cutting concerns

**Purpose**: Complete responsive, accessible, security, and requirement-conformance evidence.

- [ ] T041 [P] Add responsive chat styles for 1440, 820, and 390 pixel layouts without document-level horizontal overflow in `src/pages/ChatPage.css`.
- [ ] T042 [P] Add keyboard, focus return, screen-reader status announcement, and reduced-motion accessibility tests in `tests/e2e/chat-accessibility.spec.js`.
- [ ] T043 [P] Add a browser bundle/adapter inspection test that prevents provider credentials, direct provider calls, and direct Supabase chat calls in `tests/security/chatBoundary.test.js`.
- [ ] T044 Add conditional progress/streaming UI only behind the approved SPEC-002 capability contract and DEC-010 runtime decision in `src/components/chat/ChatStatus.jsx`.
- [ ] T045 Update the implementation validation scenarios and prerequisite gates in `specs/SPEC-012/quickstart.md` after implementation dependencies are settled.
- [ ] T046 Run the approved lint, build, unit, integration, accessibility, and E2E gates and record real outcomes in `specs/SPEC-012/validation-evidence.md`.
- [ ] T047 Measure the SC-001 source-reference completion outcome using the evaluator population and protocol agreed before implementation, then record denominator, result, and limitations in `specs/SPEC-012/validation-evidence.md`.
- [ ] T048 Perform a final SPEC-012 conformance review against all FR/SC and record unmet gates as blocked/not verified in `specs/SPEC-012/validation-evidence.md`.

## Dependencies and execution order

- Setup (Phase 1) precedes the shared adapter/state boundaries in Phase 2.
- Phase 2 is a prerequisite for all stories. The DEC-001 closed-gate contract test must pass before any private capability work is enabled.
- US1 read UI can be developed with synthetic results before private API activation. It depends on SPEC-002/004 contracts for any live integration.
- US2 proposal UI can be developed with synthetic fixtures; live mutation is blocked by DEC-001, DEC-009, SPEC-005/006/007, and SPEC-002 ledger readiness.
- US3 history UI can be developed with synthetic fixtures; live history is blocked by DEC-001 and DEC-005 and depends on SPEC-003 lifecycle contracts.
- Polish follows the desired story scope. Streaming remains conditional on DEC-010 and SPEC-002.

## Parallel opportunities

- T004 and T005 can proceed in parallel because they write separate test files.
- Within US1, T012/T013/T014/T015 use distinct test files and can proceed independently; message/source components T016/T017 have disjoint files after the view model is fixed.
- Within US2, proposal component presentation and isolated synthetic tests can proceed in separate files after the action view contract is fixed.
- Within US3, conversation list rendering and contract tests can proceed in separate files after the history adapter contract is fixed.
- Do not parallelize route/API boundary changes against authorization or live mutation work. All user stories remain blocked from private live data until the access gate is verified.

## Implementation strategy

1. Establish a shell and synthetic adapter contract, with the access-disabled state as the first security proof.
2. Deliver US1 using only synthetic responses, then connect to any authorized server contract when available.
3. Deliver US2 as proposal presentation and synthetic confirmation lifecycle; do not enable live mutation until its gates are approved and verified.
4. Deliver US3 presentation and pagination against synthetic history; enable real persistence/retrieval only after DEC-005 and DEC-001.
5. Add responsive/accessibility/E2E and security evidence. Add streaming only if the runtime decision and API event contract support it.

## Requirement coverage map

| Requirement | Primary tasks |
| --- | --- |
| FR-001, FR-013 | T005, T007, T009, T011, T043 |
| FR-002, FR-003 | T006, T016, T019 |
| FR-004, FR-005, FR-009 | T008, T013, T018, T020, T025, T030 |
| FR-006 | T012, T017, T019, T020 |
| FR-007 | T021, T023, T027-T032 |
| FR-008 | T023-T032 |
| FR-010 | T033-T040 |
| FR-011 | T031, T042 |
| FR-012 | T041 |
| SC-001 | T012, T015, T017, T022, T047 |
| SC-002 | T023-T024, T032 |
| SC-003 | T013, T025-T026, T030 |
| SC-004 | T041 |
| SC-005 | T031, T042 |

## Notes

- This task list contains implementation proposals only; no task is approved for execution by an SDD batch.
- No route/API names in this SPEC override the server contracts owned by SPEC-001/002/003/005.
- The E2E runner and any needed test harness are implementation dependencies; do not install them as part of this planning work.
