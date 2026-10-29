# Feature Specification: FlowZenit Agent Chat Interface

**SPEC ID**: SPEC-012  
**Version**: 1  
**Dependencies**: [SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Add a responsive chat integrated into FlowZenit for natural-language consultation and management of demands, planning, statuses, and recurrence, with history, confirmations, and transparent feedback.

## Scope and Exclusions

### In scope
- Provide a chat route and entry point consistent with the FlowZenit design system.
- Show conversation list/history for the single-user application dataset, message state, loading, error, empty, and reconnect feedback.
- Render grounded answers, source references, action proposals, confirmation summaries, and outcomes.
- Support keyboard-first input, focus management, responsive operation, and accessible status announcements.
- Preserve conversation identity and selected conversation context in navigation and browser history where approved.

### Explicitly out of scope
- Browser-side model/provider calls or secret credentials.
- Showing or continuing conversations for additional users; the application remains single-user and does not add account sharing or multi-user support.
- Implementing new authentication or changing the existing anonymous database path in this SPEC. The current anonymous exposure remains unresolved; chat endpoints MUST NOT expose private data or privileged operations until the SPEC-001 access-control gate is satisfied. DEC-005/DEC-006 still govern real conversation persistence and external provider use.
- Adding unrelated agent capabilities or changing current application navigation beyond the chat entry.

## Contracts and Constraints

- **Existing contracts**: Chat calls the server-side agent runtime from SPEC-002; history follows SPEC-003; query, mutation, guardrail, and temporal behavior follow SPEC-004 through SPEC-007. Data access uses the existing connection from SPEC-001.
- **Compatibility**: Existing FlowZenit navigation and routes remain available; chat is additive and uses the current visual system.
- **Security and data handling**: Preserve the existing passkey and application access path without adding a principal, session, or authentication mechanism. The client-side passkey is not server-verifiable, and the current anonymous exposure is unresolved. Chat UI availability does not enable private-data reads, history APIs, or privileged actions: these remain blocked until the SPEC-001 access-control gate is approved, implemented, and verified. Provider and privileged database credentials remain outside the browser. User-visible content must not claim an action succeeded until a durable tool result confirms it.
- **Dependencies**: [SPEC-002, SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-007].

## User Scenarios & Testing

### User Story 1 - Ask a question about work (Priority: P1)

The single application user asks about demands or planning and receives an answer with enough context to verify the records.

**Why this priority**: Read-only assistance is the safest first interaction and primary chat value.

**Independent Test**: Run E2E with a deterministic server response containing result references, no result, and a partial result.

**Acceptance Scenarios**:
1. **Given** a question with matching records, **When** the response arrives, **Then** the chat displays a concise answer and source context without exposing internal IDs as the only identifying information.
2. **Given** no matching records, **When** the answer arrives, **Then** the interface clearly says that no matching data was found.
3. **Given** a partial or stale result, **When** it is displayed, **Then** the limitation is visible and not phrased as a complete answer.

### User Story 2 - Confirm a proposed change (Priority: P1)

The application user reviews the exact record and schedule impact before approving an action that requires confirmation.

**Why this priority**: The chat must communicate consequences and avoid silently executing sensitive actions.

**Independent Test**: Submit an action proposal, approve it, alter its payload, reject it, and replay it in E2E fixtures.

**Acceptance Scenarios**:
1. **Given** an action requires confirmation, **When** its proposal appears, **Then** the action card shows target, intended values, and known consequences with explicit confirm and cancel controls.
2. **Given** the user cancels, **When** the response completes, **Then** no mutation occurs and the conversation records a non-executed outcome.
3. **Given** the operation completes, **When** the server reports a committed result, **Then** the UI shows success only after receiving that result.

### User Story 3 - Continue a prior conversation (Priority: P2)

The application user reopens a conversation and continues with the correct history.

**Why this priority**: Persistent conversations support continuity.

**Independent Test**: Exercise conversation list, history pagination, unknown/malformed thread ID, and deletion state.

**Acceptance Scenarios**:
1. **Given** a valid conversation ID in the single-user dataset and the access-control gate is satisfied, **When** opened, **Then** its messages load in stable order and new messages append to that thread.
2. **Given** an unknown or malformed conversation ID, or a private-history request while the access-control gate is unmet, **When** opened, **Then** no message content or conversation-existence metadata is shown.
3. **Given** history is loading or unavailable, **When** the user interacts, **Then** controls communicate current state and avoid duplicate submissions.

### Edge Cases
- Network disconnects after a mutation is committed but before the client receives the response; requery by idempotency key before retrying.
- User navigates away while a tool is pending or confirmation is open.
- A long answer includes source references and structured status information.
- Screen reader is active while a response or tool outcome arrives.
- Mobile keyboard obscures the composer or confirmation card.

## Requirements

### Functional Requirements

- **FR-001**: Chat turns and model/provider operations MUST pass through the server-side agent runtime using a same-origin application API. The browser MUST NOT call model providers or privileged database endpoints directly.
- **FR-002**: The interface MUST display the current conversation identifier as an opaque grouping/reference value and MUST NOT treat that identifier as identity, authorization, or confirmation for a write action.
- **FR-003**: Messages MUST distinguish user, assistant, tool outcome, action proposal, error, and source reference using semantics beyond color alone.
- **FR-004**: Pending, streaming (if supported), loading, success, failure, timeout, retry, and cancelled states MUST be explicit.
- **FR-005**: Duplicate submit controls MUST be disabled or idempotently handled while a request is in flight.
- **FR-006**: The UI MUST render source references and indicate when an answer is based on domain data, inference, or incomplete retrieval.
- **FR-007**: A confirmation card MUST show canonical target, proposed values, date/time context, destructive/consequential effects, and expiry where applicable. Whenever chat presents a FlowZenit planning date or time, including in answers and confirmation cards, it MUST use and explicitly label the IANA timezone America/Cuiaba.
- **FR-008**: When an approved DEC-009 policy requires confirmation, the server-side action flow MUST follow the confirmation lifecycle approved for SPEC-005; a client click or the currently proposed one-time grant MUST NOT independently authorize a mutation. While DEC-009 is unresolved, live mutation actions MUST be denied.
- **FR-009**: Success feedback MUST only appear after a confirmed server result; uncertain network outcome MUST be represented as pending verification.
- **FR-010**: History and thread operations MUST follow SPEC-003 single-user lifecycle, pagination, retention, and deletion policies.
- **FR-011**: The chat MUST support keyboard-only send, cancel, history navigation, confirmation, and focus return; status updates MUST be announced without moving focus unexpectedly.
- **FR-012**: At 1440, 820, and 390 pixels, input, history, actions, and confirmation remain reachable without horizontal document overflow or clipped controls.
- **FR-013**: Chat UI availability MUST NOT be interpreted as authorization to access private data. Preserve existing application access without new authentication; real private reads, history access, or privileged actions MUST fail closed until the SPEC-001 access-control gate is satisfied. Persisting real conversations or sending real FlowZenit content to external providers remains subject to DEC-005/DEC-006.

### Key Entities

- **Chat message view**: User-visible item with role, content, timestamp, and source/status metadata.
- **Action proposal view**: Confirmation-bound representation of one canonical operation.
- **Conversation view**: Single-user history context with pagination and lifecycle state.
- **Response state**: Loading, completed, needs clarification, denied, failed, or pending verification.

## Success Criteria

### Measurable Outcomes

- **SC-001**: At least 90% of synthetic users complete a read-only query and identify its source reference without assistance.
- **SC-002**: 100% of cancelled, altered, expired, or rejected confirmation flows cause zero mutation.
- **SC-003**: 100% of network ambiguity tests avoid displaying unverified mutation success.
- **SC-004**: At 390 pixels, all primary chat actions are reachable with no clipped control and no document-level horizontal overflow.
- **SC-005**: Keyboard-only evaluation completes send, cancel, history selection, and action confirmation without pointer input.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | No provider secrets in bundle |
| Unit/integration tests | Yes | Chat state/component tests | Pending, failure, retry, confirmation |
| Database/contract tests | Yes | Isolated synthetic API and thread lifecycle tests | Unknown/malformed IDs disclose no content or existence; private history and privileged operations fail closed until the SPEC-001 gate; no multi-user or tenant behavior is introduced |
| E2E/accessibility/security evaluation | Yes | Playwright 1440/820/390, keyboard, axe/manual | Source clarity, focus, no overflow |

## Completion Evidence

- [ ] E2E covers read, mutation-confirmation, history, and network ambiguity journeys.
- [ ] Accessibility review includes keyboard, announcements, focus, contrast, and reflow.
- [ ] No new authentication method is introduced; the passkey is not treated as server identity, and private reads/history/actions remain blocked until the SPEC-001 gate.
- [ ] Confirmation cards that display times label the timezone America/Cuiaba.
- [ ] Screenshots record all required viewports and meaningful UI states.

## Assumptions

- The chat is an additive FlowZenit route and uses existing shared navigation and visual identity.
- Read-only query is the first user journey; mutations remain subject to confirmation policy.
- A disconnected response is not evidence that a mutation failed or succeeded.
