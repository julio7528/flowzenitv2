# Feature Specification: Administrative Observability Dashboard

**SPEC ID**: SPEC-011  
**Version**: 1  
**Dependencies**: [SPEC-010]  
**Risk**: medium

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Provide an administrative dashboard for agent execution history, graph states, integration health, and security/guardrail events.

## Scope and Exclusions

### In scope
- Present searchable, time-bounded execution summaries, lifecycle state, correlation IDs, node/tool timing, errors, retries, and provider availability.
- Show integration health as last-known status/time and clearly separate health checks from proof that a capability works.
- Filter suspicious and confirmed security events as distinct categories.
- Provide detail views with redacted fields and stable links to the audit source for the single application user.
- Show RAG/index/outbox synchronization and test/evaluation summaries only when their owning SPEC provides a safe status contract; distinguish disabled, unavailable, stale, and measured values.
- Support responsive desktop/tablet/mobile viewing and accessible tabular/detail navigation.

### Explicitly out of scope
- Approving SDD batches, releasing SDD pauses, changing production configuration, or performing domain mutations.
- Displaying full prompts, credentials, or transcripts by default.
- Introducing additional operator/admin accounts, roles, organizations, or tenants; DEC-008 limits the intended audience to the single application user.
- Replacing LangSmith’s own operational interface.

## Contracts and Constraints

- **Existing contracts**: Consume the redacted audit and trace summary from SPEC-010; preserve the existing FlowZenit access path from DEC-001/DEC-008.
- **Optional data sources**: SPEC-008/SPEC-009 may provide index and retrieval status; SPEC-013 may provide versioned test/evaluation summaries. These are display integrations, not prerequisites for the base dashboard, and absent metrics are not represented as zero or success.
- **Compatibility**: Additive internal UI; no existing FlowZenit routes or permissions are changed by this SPEC.
- **Security and data handling**: The dashboard is intended only for the single application owner and preserves the existing passkey/access path without adding authentication, sessions, owner UUIDs, roles, organizations, or tenants. The client-side passkey is not server-verifiable; existing anonymous grants do not authorize private dashboard endpoints. Any endpoint returning private trace, audit, or FlowZenit data remains unavailable until the SPEC-001 access-control gate is satisfied. Transcript and prompt fields remain subject to DEC-005 and DEC-006.
- **Dependencies**: [SPEC-010].

## User Scenarios & Testing

### User Story 1 - Locate an execution outcome (Priority: P1)

The application user filters recent executions and opens a summary for one correlation ID.

**Why this priority**: The dashboard must make failures and execution state discoverable.

**Independent Test**: Seed redacted synthetic executions with completed, denied, timed-out, and failed states.

**Acceptance Scenarios**:
1. **Given** a time range and outcome filter, **When** the application user searches, **Then** the result shows matching executions with start time, duration, outcome, correlation ID, and safe summary.
2. **Given** an execution detail, **When** the application user opens it, **Then** node transitions and tool outcomes are ordered and redacted.
3. **Given** no matching data, **When** the query completes, **Then** a compact empty state explains the active filters and how to clear them.

### User Story 2 - Review integration health (Priority: P2)

The application user sees whether provider and database integrations are configured and recently reachable.

**Why this priority**: Health context helps distinguish agent defects from dependency outages.

**Independent Test**: Mock healthy, degraded, stale, and failed integration states.

**Acceptance Scenarios**:
1. **Given** a provider health state, **When** it is displayed, **Then** the page shows status and last checked time without exposing a key or endpoint secret.
2. **Given** a stale health result, **When** the page renders, **Then** it labels the status stale rather than claiming current availability.

### User Story 3 - Distinguish security signals (Priority: P2)

The application user can review suspicious events separately from confirmed incidents.

**Why this priority**: Incorrectly labeling a signal as an attack damages trust and incident response.

**Independent Test**: Seed suspicious and confirmed synthetic records and verify filters and labels.

**Acceptance Scenarios**:
1. **Given** an event classified as suspicious, **When** it is shown, **Then** it is not labeled confirmed.
2. **Given** an event lacks evidence or content is redacted, **When** details are viewed, **Then** the dashboard shows available evidence and its limits.

### Edge Cases
- Dashboard data source is unavailable or partially delayed.
- Existing application navigation state changes while a detail view is open.
- A trace has no persisted audit counterpart or vice versa.
- Very long error message contains a secret sentinel.
- Narrow mobile viewport cannot fit a wide event table.

## Requirements

### Functional Requirements

- **FR-001**: Dashboard routes and data APIs MUST preserve the existing application access behavior; they MUST NOT add authentication, session, or owner UUID checks under SPEC-001. DEC-008 keeps the intended audience to the single application user; a separate operator role or additional account MUST NOT be introduced.
- **FR-002**: Summary views MUST support filtering by time range, terminal outcome, tool, provider, and security classification where fields exist.
- **FR-003**: Every execution detail MUST show correlation ID, lifecycle, graph node order, tool outcome, latency, retry count, and source freshness when available.
- **FR-004**: Integration status MUST show health category, last checked timestamp, and stale/degraded state without exposing credentials or secret configuration.
- **FR-005**: Suspicious events MUST be visually and semantically distinct from confirmed attacks.
- **FR-006**: Missing trace/audit counterparts MUST be represented explicitly rather than silently omitted.
- **FR-007**: Raw prompts, transcript text, credentials, and unrestricted user content MUST be hidden by default and only shown if a separately approved field policy allows them.
- **FR-008**: Dashboard queries MUST be bounded by time range, page size, and result count. Existing access behavior and the client-side passkey MUST NOT be treated as server authorization for private dashboard data.
- **FR-009**: The dashboard MUST be read-only in the initial version; it MUST NOT approve/release SDD batches, mutate FlowZenit data, or change integration settings.
- **FR-010**: All filters, tables, detail panels, and error/empty states MUST be keyboard accessible and usable at 1440, 820, and 390 pixel viewports.
- **FR-011**: Partial failure MUST identify which source is unavailable and the last successful update time.
- **FR-012**: All displayed duration, token usage, and counts MUST identify unavailable values rather than substituting zero.
- **FR-013**: Private dashboard data endpoints MUST fail closed until adequate access control is separately approved, implemented, and verified; no additional user, role, organization, or tenant may be introduced.
- **FR-014**: RAG/index/outbox synchronization status MUST be displayed only from an explicit source contract when available. Disabled, stale, delayed, unknown, unavailable, not approved, and awaiting quality evidence states MUST remain distinct. The dashboard MUST NOT infer production vector-RAG enablement or quality from an index existing. Until SPEC-009 supplies measurable quality evidence and the required product decision is recorded, the dashboard MUST NOT label vector retrieval as production-enabled. The dashboard does not approve RAG enablement.
- **FR-015**: Test/evaluation summaries, when supplied by SPEC-013 or another approved source, MUST identify dataset/version, measurement time, metric and availability state. Missing or unrun evaluations MUST be shown as unavailable/not run, never as zero or a pass.

### Key Entities

- **Execution summary**: Redacted view of one agent run and terminal outcome.
- **Integration health record**: Component status with last checked time and freshness.
- **Security event**: Event with evidence classification and permitted detail.
- **User view scope**: Redacted, bounded operational data for the single application user; detailed content fields remain subject to DEC-005 and DEC-006.

## Success Criteria

### Measurable Outcomes

- **SC-001**: The application user can locate a synthetic run by correlation ID in under 30 seconds using the dashboard.
- **SC-002**: 100% of synthetic dashboard query fixtures return only bounded, redacted fields permitted by DEC-005/DEC-006, and no private dashboard data is returned while the SPEC-001 access-control gate is unmet.
- **SC-003**: Secret-sentinel scans find zero credential sentinels in rendered dashboard responses.
- **SC-004**: Suspicious event fixtures are never labeled confirmed without the approved evidence state.
- **SC-005**: At 390 pixels wide, every essential filter and event detail remains reachable without document-level horizontal overflow.
- **SC-006**: 100% of synthetic disabled, stale, missing, unavailable, not-approved, and unrun RAG/evaluation fixtures are labeled with their actual state; none is displayed as production-enabled, a healthy zero, or a successful evaluation without source evidence.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Dashboard route included without secrets |
| Unit/integration tests | Yes | View-model and filter tests | State labels, missing data, bounded results |
| Database/contract tests | Yes | Isolated synthetic access-gate and redaction tests | Private dashboard endpoint fails closed until the SPEC-001 gate; detail output remains bounded and redacted |
| E2E/accessibility/security evaluation | Yes | Playwright at 1440/820/390 and keyboard audit, if the approved test runner is available | No critical accessibility or overflow issues; optional-source states are represented accurately |

## Completion Evidence

- [ ] The dashboard preserves the existing owner access path without new authentication; the passkey is not represented as server-verifiable identity and private endpoints remain blocked until the SPEC-001 gate.
- [ ] DEC-005/DEC-006 data visibility and retention constraints are resolved before any prompt or transcript content is exposed.
- [ ] Authorization, redaction, responsive, and classification tests have evidence.
- [ ] No operational mutation or SDD approval control is exposed.
- [ ] Screenshots and accessibility findings are recorded.

## Assumptions

- The dashboard is an operational view for the single FlowZenit application user; no additional operator audience, authentication method, role, organization, or tenant is in scope.
- It begins read-only and consumes minimized persisted telemetry.
- Health status is time-bound evidence, not a guarantee of future availability.
