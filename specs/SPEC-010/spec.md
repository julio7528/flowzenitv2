# Feature Specification: LangSmith Tracing and Persistent Audit

**SPEC ID**: SPEC-010  
**Version**: 1  
**Dependencies**: [SPEC-001, SPEC-002, SPEC-005]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Provide LangSmith tracing, correlated execution telemetry, and durable audit evidence for agent and tool activity while protecting private data.

## Scope and Exclusions

### In scope
- Define trace/run correlation across API, graph nodes, model calls, retrievers, tools, guardrails, and terminal outcomes.
- Define a persistent audit event model distinct from LangSmith traces and business conversation history.
- Capture timing, retries, token usage where available, tool names/versions, authorization decisions, redacted errors, and guardrail classification.
- Define trace sampling, sensitive-field redaction, retention, access, and provider data handling gates.

### Explicitly out of scope
- Dashboard presentation and owner workflows (SPEC-011).
- Treating LangSmith traces as the only audit record or as an authorization mechanism.
- Persisting full prompt, response, transcript, or tool content by default.
- Selecting third-party data retention and regional settings; see DEC-006. Audit and conversation retention remain subject to DEC-005.

## Contracts and Constraints

- **Existing contracts**: Data connection context originates from SPEC-001; graph nodes and terminal categories from SPEC-002; action-policy and security events from SPEC-005.
- **Compatibility**: Observability is additive and must not change response or domain behavior when the tracing provider is unavailable.
- **Security and data handling**: Logs and traces default to data-minimized metadata. Full text requires a separately approved field policy. LangSmith is an external processor and remains disabled for production content until DEC-006 is resolved.
- **Dependencies**: [SPEC-001, SPEC-002, SPEC-005].

## User Scenarios & Testing

### User Story 1 - Trace one execution end to end (Priority: P1)

The single application user can follow one synthetic agent request across graph nodes and tool calls using a stable correlation identifier.

**Why this priority**: Correlation is needed to diagnose failures and verify safety controls.

**Independent Test**: Execute one deterministic graph fixture through mocked model, retrieval, and tool providers and inspect trace plus audit events.

**Acceptance Scenarios**:
1. **Given** an accepted request, **When** graph nodes and tools run, **Then** each event carries the same correlation ID, run ID, and relevant conversation reference.
2. **Given** a tool is denied by guardrails, **When** the trace is inspected, **Then** it records the denied tool name/version and reason category without storing secret values.
3. **Given** LangSmith is unavailable, **When** an otherwise authorized agent request runs, **Then** only external tracing is marked degraded or unavailable and the request's domain outcome and authorization checks are unchanged. This scenario does not define behavior when the independent durable audit store is unavailable; that policy remains a production-write blocker until reviewed.

### User Story 2 - Preserve an audit record independent of traces (Priority: P1)

The application user can review important guardrail and mutation events even if an external trace is missing.

**Why this priority**: External tracing may be sampled, unavailable, or retained differently.

**Independent Test**: Disable LangSmith and execute synthetic allow, deny, mutation, and provider-error flows.

**Acceptance Scenarios**:
1. **Given** a mutation that is enabled after all access and policy gates, **When** the operation completes, **Then** a durable audit event records initiator scope, operation, permitted target reference, approved change evidence, result, and correlation ID. Initiator scope describes event origin and does not assert a verified owner identity. Target/change fields are limited by an approved field policy; if required audit evidence cannot be recorded safely and durably, the mutation remains disabled.
2. **Given** a suspicious prompt-injection signal, **When** the event is recorded, **Then** it is classified as suspicious unless corroborating evidence confirms an attack.
3. **Given** a trace payload contains a credential sentinel, **When** export is attempted, **Then** redaction removes it before it leaves the server.

### User Story 3 - Inspect usage and latency without content exposure (Priority: P2)

The application user can review request duration, retry counts, token usage where available, and tool latency without reading conversation content.

**Why this priority**: Operational metrics support reliability and future capacity decisions.

**Independent Test**: Generate synthetic spans and verify metric completeness and content redaction.

**Acceptance Scenarios**:
1. **Given** a provider returns token usage, **When** the trace closes, **Then** available usage is recorded with provider/model identifiers and no budget enforcement is inferred.
2. **Given** the provider omits token usage, **When** the trace closes, **Then** the field is marked unavailable rather than estimated as an exact value.

### Edge Cases
- Trace write succeeds but audit write fails, or vice versa; the two outcomes remain distinguishable.
- Trace IDs collide or a client supplies a forged correlation ID.
- Redaction fails; sensitive telemetry export is blocked.
- Trace sampling omits a request; required persistent audit still records designated security events.
- External provider outage or quota exhaustion.

## Requirements

### Functional Requirements

- **FR-001**: Each request MUST have server-generated request, correlation, graph run, and tool invocation identifiers with documented relationships.
- **FR-002**: Trace spans MUST identify node/tool names and versions, start/end time, outcome, retry count, and latency; token usage is included only when returned by the provider.
- **FR-003**: A durable audit record MUST be maintained separately from LangSmith and from user-visible conversation history.
- **FR-004**: Audit MUST include security decisions, confirmation outcomes, mutation outcomes, and terminal execution status with initiator scope and correlation. Initiator scope MUST describe only the event origin (for example, owner request intent, agent, system, or unknown), not a verified owner identity. Target references and before/after hashes or values MUST use an explicitly permitted field set; unavailable or disallowed values MUST not be copied into audit.
- **FR-005**: Raw credentials, authorization tokens, full prompts, full transcripts, and unapproved domain text MUST be redacted or excluded by default.
- **FR-006**: Redaction MUST run before persistence and before export; a redaction error MUST block external export and raise a safe operational event.
- **FR-007**: Suspected injection or abuse MUST be labeled as suspicious until a defined evidence rule supports confirmed classification.
- **FR-008**: Trace provider failure MUST NOT bypass or weaken tool-policy checks, confirmation, or audit of critical guardrail/mutation events.
- **FR-009**: External LangSmith tracing of production content MUST remain disabled until DEC-006 defines approved fields, provider retention, region, and opt-out.
- **FR-010**: External trace sampling, external provider retention, internal audit retention, and destination-specific field policies MUST be independently versioned/configurable and recorded. No defaults or numeric values are approved; retention and provider-field values await DEC-005/DEC-006. Administrative viewing is intended for the single application user under DEC-008, with no additional operator identities or authentication mechanism. Private trace and audit endpoints remain blocked until the SPEC-001 access-control gate is satisfied.
- **FR-011**: Trace and audit records MUST support time-bounded queries by correlation ID. Existing access behavior is preserved, but the passkey and anonymous grants MUST NOT be treated as server authorization for private telemetry.
- **FR-012**: Event delivery and audit writes MUST be idempotent; duplicate callbacks MUST not create misleading duplicate completed actions.
- **FR-013**: Private trace/audit endpoints MUST fail closed until adequate access control is separately approved, implemented, and verified; telemetry access does not bypass DEC-005/DEC-006.

### Key Entities

- **Trace run**: External or internal structured execution spans.
- **Audit event**: Durable, minimized security or domain-action evidence.
- **Correlation context**: Server-generated IDs tying request, graph, tool, and audit records together.
- **Redaction result**: Versioned rule outcome applied before persistence/export.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of synthetic graph nodes, tool calls, and audit events for a request share the expected correlation ID.
- **SC-002**: Secret-sentinel scans find zero sentinels in stored or exported traces and audit events.
- **SC-003**: Critical security and mutation audit events remain available in tests when LangSmith is disabled.
- **SC-004**: Provider usage is reported as exact only when returned by the provider; all unavailable values are explicitly marked unavailable.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Telemetry stays server-side |
| Unit/integration tests | Yes | Trace/audit adapter doubles | Correlation, redaction, idempotency |
| Database/contract tests | Yes | Isolated synthetic audit append/query tests using a local database fixture | Bounded lookup, append behavior, and closed-gate zero-access behavior; no cross-user identity requirement and no live Supabase access |
| E2E/accessibility/security evaluation | Yes | Failure and secret-sentinel tests | Provider outage does not weaken controls |

## Completion Evidence

- [ ] Redaction, trace failure, and audit independence gates have evidence.
- [ ] DEC-006 and applicable retention/access decisions are resolved before production export.
- [ ] Trace and audit fields are documented and reviewed for data minimization.
- [ ] No credential or unrestricted transcript is present in evidence.

## Assumptions

- LangSmith is observability, not a system of record or security control.
- Token usage may be absent or provider-specific.
- Audit and tracing have different retention, access, and completeness requirements.
