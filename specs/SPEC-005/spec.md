# Feature Specification: Agent Guardrails and Action Authorization

**SPEC ID**: SPEC-005  
**Version**: 1  
**Dependencies**: [SPEC-001, SPEC-002, SPEC-004]  
**Risk**: critical

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Protect agent inputs, retrieved content, tool calls, permissions, sensitive data, and outputs with explicit guardrails, authorization, and confirmations.

## Scope and Exclusions

### In scope
- Define a policy decision point for each proposed tool action, checking enabled capability, record/domain scope, argument validity, risk class, and confirmation state without adding owner authentication.
- Treat user text, domain content, model output, memory, and external web results as untrusted data.
- Detect and contain prompt injection without allowing content to override system policy or expand capabilities.
- Define input/output validation, sensitive-data redaction, refusal behavior, abuse controls, and security event classification.
- Define confirmation lifecycle contracts for actions that require approval.

### Explicitly out of scope
- Adding authentication or selecting/implementing an access-control mechanism is outside this SPEC and remains undecided under DEC-001; this exclusion does not authorize protected tools without the SPEC-001 access-control gate.
- Implementing a particular classifier/model or claiming perfect prompt-injection detection.
- Choosing the exact confirmation matrix; see DEC-009.
- Allowing the model, retrieved content, or confirmation text embedded in a retrieved record to approve an operation.

## Contracts and Constraints

- **Existing contracts**: Every tool uses the SPEC-001 data-integration baseline and SPEC-004 typed query context; write decisions integrate SPEC-006 when approved.
- **Compatibility**: Guardrails wrap agent actions and do not alter existing product business rules or RLS.
- **Security and data handling**: Deny tool actions that are disabled, malformed, out of scope, or lack required confirmation; policy checks execute at tool invocation. Retrieved text has no instruction authority. Action policy and confirmation do not authenticate the owner or grant access to private data. All private-data and privileged operations remain unavailable until the SPEC-001 access-control gate is satisfied. The one-time, expiring, action-bound confirmation grant below is a Draft technical proposal; DEC-009's confirmation matrix remains pending and no particular implementation is approved.
- **Dependencies**: [SPEC-001, SPEC-002, SPEC-004].

## User Scenarios & Testing

### User Story 1 - Contain untrusted instructions (Priority: P1)

The application user or a stored record contains text attempting to reveal secrets or invoke a forbidden tool; the agent treats it as data.

**Why this priority**: Prompt injection can redirect a model but must not cross server-enforced policy.

**Independent Test**: Run a versioned prompt-injection corpus in user messages, demand names, memory fixtures, and external page results.

**Acceptance Scenarios**:
1. **Given** a retrieved record says to ignore policy or use a disabled/out-of-scope capability, **When** the model sees that record, **Then** the runtime rejects the disallowed tool proposal and logs a redacted suspicious event.
2. **Given** an unknown or disabled tool is proposed, **When** the graph requests execution, **Then** the policy layer denies it and no side effect occurs.
3. **Given** content requests secrets, **When** the response is generated, **Then** secrets are not returned and a safe refusal is produced.

### User Story 2 - Authorize and confirm an action (Priority: P1)

The single application user is shown the exact impact of a sensitive action and must approve that same action before execution.

**Why this priority**: Confirmation prevents consequential actions from being inferred or silently executed.

**Independent Test**: Issue approvals for synthetic actions, then mutate resource, payload, expiry, and replay the approval.

**Acceptance Scenarios**:
1. **Given** an action requiring confirmation, **When** no valid approval exists, **Then** the operation is not executed and an approval request with a canonical summary is returned.
2. **Given** a valid approval bound to a specific payload, **When** the payload changes or approval is replayed, **Then** execution is denied.
3. **Given** a lower-risk action that does not require confirmation under the approved matrix, **When** it is authorized, **Then** the user is not burdened with an unnecessary confirmation.

### User Story 3 - Validate inputs and outputs (Priority: P2)

The system rejects malformed tool arguments and responses that contain unsupported claims or sensitive fields.

**Why this priority**: Schema and output validation limit unsafe behavior even when model output is malformed.

**Independent Test**: Exercise valid/invalid schemas, oversized inputs, unsupported claims, and sensitive-data sentinels.

**Acceptance Scenarios**:
1. **Given** model arguments fail the versioned tool schema, **When** validation runs, **Then** the tool is not invoked.
2. **Given** no authorized source supports a factual claim, **When** the answer is validated, **Then** it is marked uncertain or asks for clarification instead of asserting the claim as fact.

### Edge Cases
- A one-time approval races with duplicate tool invocation; only one transaction may consume it.
- A retrieved record includes fake system/developer delimiters or serialized tool syntax.
- Input includes Unicode confusables, very long content, or embedded markup.
- A security classifier flags suspicious behavior but evidence does not establish a confirmed attack.
- Tool authorization succeeds but a domain constraint fails; return the domain error without claiming success.

## Requirements

### Functional Requirements

- **FR-001**: The policy layer MUST be called immediately before every tool side effect and MUST evaluate capability, target scope, schema, domain preconditions, and confirmation requirement.
- **FR-002**: Disallowed, malformed, out-of-scope, disabled, or expired-confirmation operations MUST fail closed before database mutation.
- **FR-003**: User content, retrieved records, memory, model output, and web results MUST be labeled as untrusted content and MUST NOT alter privileged instructions or tool availability.
- **FR-004**: No guardrail decision may be based solely on model-generated claims about permission, user consent, or completed work.
- **FR-005**: The proposed confirmation contract binds a conversation, operation name/version, canonical target, canonical payload hash, issue time, expiry, and one-time nonce; these implementation details remain subject to planning and do not resolve DEC-009.
- **FR-006**: Any payload, target, operation, or relevant precondition change after confirmation MUST invalidate the approval.
- **FR-007**: The confirmation matrix MUST remain pending DEC-009; no high-impact operation may be enabled until its matrix entry is approved.
- **FR-008**: Input handling MUST enforce per-tool schema, size, normalization, and allowlisted enum/date formats; it MUST reject arbitrary SQL and executable code in structured tool/control arguments. Free-form user and retrieved text remains untrusted data and MUST never be executed or interpreted as a query.
- **FR-009**: Output handling MUST validate claims against tool results or retrieved sources, mark inference, state missing evidence, and avoid fabricating action completion.
- **FR-010**: Sensitive data MUST be redacted before logs, traces, and error responses according to a tested field policy.
- **FR-011**: Events MUST distinguish benign validation failure, suspicious signal, and confirmed attack; automated detection alone MUST NOT upgrade an event to confirmed attack.
- **FR-012**: Guardrail denials MUST produce a stable reason category and correlation ID without disclosing policy internals that enable bypass.
- **FR-013**: Repeated request controls and tool-call budgets MUST follow the limits selected for the agent runtime; numerical thresholds await DEC-012.
- **FR-014**: Every guardrail test suite MUST include direct prompt injection, indirect record injection, disallowed tool proposals, malformed tool calls, replayed confirmation, and secret exfiltration attempts.
- **FR-015**: Policy approval or a valid action confirmation MUST NOT be treated as proof of owner identity or as a substitute for the SPEC-001 access-control gate; private-data tools and privileged side effects MUST fail closed until that gate is satisfied.

### Key Entities

- **Policy decision**: Allow, deny, or require-confirmation result for one exact action.
- **Confirmation grant**: One-time, expiring authorization for a canonical proposed action.
- **Guardrail event**: Redacted evidence and classification for a control decision.
- **Untrusted content segment**: Input, retrieval, or tool output marked as data rather than instructions.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of unauthorized and malformed action fixtures cause zero side effects.
- **SC-002**: 100% of changed-payload, expired, and replayed confirmations are denied.
- **SC-003**: All prompt-injection fixtures fail to expand the permitted tool set or expose synthetic secrets.
- **SC-004**: Security event fixtures preserve correlation and classification while containing zero secret sentinels.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Policy layer present on server boundary |
| Unit/integration tests | Yes | Policy and confirmation tests | Matrix decisions and one-time approval |
| Database/RLS/contract tests | Yes | Isolated allow/deny and concurrency tests | Unauthorized operations are rejected |
| E2E/accessibility/security evaluation | Yes | Adversarial evaluation corpus | Injection, exfiltration, replay, redaction |

## Completion Evidence

- [ ] Each enabled operation has a reviewed authorization and confirmation matrix entry.
- [ ] Adversarial test evidence includes zero unauthorized side effects.
- [ ] No new critical or high severity finding remains unresolved.
- [ ] Changes remain within guardrail and authorization scope.

## Assumptions

- Server-side authorization is authoritative; model confidence and user text are not authorization.
- Prompt-injection controls are defense in depth and do not replace permissions.
- High-impact actions remain disabled when the confirmation matrix is unresolved.
