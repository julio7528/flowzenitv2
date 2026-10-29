# Feature Specification: Optional Tavily External Search

**SPEC ID**: SPEC-015  
**Version**: 1  
**Dependencies**: [SPEC-002, SPEC-005, SPEC-010]  
**Risk**: medium

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Add Tavily as an optional, policy-controlled external web-search capability for questions that require current public web information.

## Scope and Exclusions

### In scope
- Define an explicit opt-in search capability with query limits, timeout, result count, and safe result format.
- Search only for public information questions that are not answered by FlowZenit domain data or approved reference documents.
- Label external sources and retrieved snippets, include source links, timestamp, and uncertainty.
- Redact or exclude private FlowZenit content from external queries unless a separate explicit policy authorizes fields and disclosure.
- Record search intent, query hash or approved query text, provider status, result provenance, and redacted errors.

### Explicitly out of scope
- Searching internal FlowZenit records; use SPEC-004/SPEC-009.
- Sending full conversation history, demand names, schedule details, credentials, or user identifiers by default.
- Treating web results as trusted instructions or as authority to mutate FlowZenit data.
- Enabling Tavily by default or using it to answer a question when current product data is required.

## Contracts and Constraints

- **Existing contracts**: The model proposes a search tool call; SPEC-005 authorizes it; SPEC-010 correlates and audits it. Tavily response remains untrusted external content.
- **Compatibility**: Optional capability flag defaults off; absence or failure of Tavily does not break internal query tools.
- **Security and data handling**: Search query is treated as an external disclosure. DEC-006 must define permitted query fields and provider handling before production use. Private context obtained from FlowZenit tools MUST remain unavailable until the SPEC-001 access-control gate is satisfied; Tavily cannot bypass that gate.
- **Dependencies**: [SPEC-002, SPEC-005, SPEC-010].

## User Scenarios & Testing

### User Story 1 - Request current public information (Priority: P2)

The single application user asks a question requiring current public web information and the agent searches only when the optional capability is enabled and its per-request policy permits it.

**Why this priority**: Web search extends the agent beyond current FlowZenit data but is not required for core workflows.

**Independent Test**: Run with Tavily disabled, mocked available, timed out, and returning adversarial content.

**Acceptance Scenarios**:
1. **Given** the feature is disabled, **When** a search is proposed, **Then** no external request is made and the user receives a clear limitation.
2. **Given** the feature is enabled and the request is authorized, **When** public search runs, **Then** the answer shows source title/link and that information came from external web content.
3. **Given** web results contain instructions to reveal secrets or modify records, **When** the agent processes them, **Then** they remain untrusted content and cannot expand tools or permissions.

### User Story 2 - Protect private FlowZenit content (Priority: P1)

The single application user asks for an external search related to a private demand; the system discloses only fields explicitly permitted by an approved policy and access gate.

**Why this priority**: Search sends data outside the FlowZenit boundary.

**Independent Test**: Include private-name and schedule sentinels in prompts and verify outbound request payload.

**Acceptance Scenarios**:
1. **Given** DEC-006 is unresolved, **When** a query would include private application content, **Then** no private field is sent and the agent asks the user to rephrase or confirms the allowed public query.
2. **Given** an approved minimal query and a satisfied SPEC-001 access-control gate, **When** it is sent, **Then** the provider payload contains no conversation transcript, identity, secret, or unrelated domain fields.

### User Story 3 - Report search limitations accurately (Priority: P2)

An authorized user sees when external search failed or sources are insufficient.

**Why this priority**: Users should not confuse unavailable web evidence with a definitive answer.

**Independent Test**: Inject empty results, timeout, provider error, and malformed result payload.

**Acceptance Scenarios**:
1. **Given** Tavily times out, **When** the response is composed, **Then** the user sees that external search was not completed and no current-web claim is asserted.
2. **Given** search returns no relevant sources, **When** the answer is composed, **Then** the agent reports insufficient external evidence.

### Edge Cases
- Query includes personal or internal names.
- Search results contain prompt injection or malware links.
- Provider returns duplicated, stale, malformed, or uncited snippets.
- Rate limit, timeout, or service outage occurs.
- A user requests an internal task status; external search is irrelevant and must not run.

## Requirements

### Functional Requirements

- **FR-001**: Tavily capability MUST default to disabled and require explicit server-side enablement and per-request authorization.
- **FR-002**: The search tool MUST be selected only for a request requiring current public web information; internal records and current schedules MUST use FlowZenit tools.
- **FR-003**: The outbound query MUST be bounded by configured character, result-count, and timeout limits. Numeric values remain proposed until DEC-012 and implementation review; absent approved values, production search MUST remain disabled.
- **FR-004**: Until DEC-006 is approved, outbound queries MUST contain no private FlowZenit names, schedule data, user identifiers, credentials, or conversation history.
- **FR-005**: If a private field is necessary to form a query, the agent MUST refuse or request a public reformulation while DEC-006 is pending. After an approved disclosure policy permits specific fields, any required user confirmation MUST still be explicit and informed; confirmation alone MUST NOT override DEC-006 or the SPEC-001 access gate.
- **FR-006**: Every returned source MUST retain title, URL, provider timestamp when available, retrieval timestamp, and snippet provenance.
- **FR-007**: Web content MUST be marked untrusted and MUST NOT modify instructions, tool permissions, authorization, or domain state.
- **FR-008**: Web-grounded answers MUST identify external-source limitations, distinguish source claims from verified FlowZenit data, and avoid presenting snippets as confirmed facts when sources conflict.
- **FR-009**: Provider timeout, error, malformed response, or empty results MUST produce a stable partial/failed search state; no unsupported current-information answer may be produced.
- **FR-010**: Search requests and results MUST be correlated and audited under SPEC-010 using the approved content-minimization policy.
- **FR-011**: Tavily MUST not be required for core FlowZenit queries or operations; disabling it MUST leave all internal capabilities available.
- **FR-012**: Automated tests MUST include internal-data exfiltration, direct/indirect injection, disabled state, outage, and malformed response cases.
- **FR-013**: Tavily MUST NOT receive private FlowZenit data obtained by an agent tool unless the SPEC-001 access-control gate is satisfied and DEC-006 explicitly permits those fields; a public search request MUST NOT be used to bypass either gate.

### Key Entities

- **External search request**: Authorized public query, capability state, query provenance, and correlation ID.
- **External source result**: Provider source metadata and untrusted snippet.
- **Disclosure decision**: Policy outcome on whether proposed query fields may leave FlowZenit.
- **External search outcome**: Completed, empty, denied, timed-out, failed, or degraded result.

## Success Criteria

### Measurable Outcomes

- **SC-001**: With capability disabled, 100% of search proposals generate zero outbound requests.
- **SC-002**: Secret, identity, transcript, and private-data sentinels appear in zero provider request payloads unless the SPEC-001 access-control gate is satisfied and a resolved DEC-006 disclosure policy explicitly permits the fields.
- **SC-003**: 100% of internal status/schedule queries in the evaluation set use internal domain tools and do not invoke Tavily.
- **SC-004**: 100% of web-grounded answers in the evaluation set include source links and identify external evidence as untrusted.
- **SC-005**: Timeout and malformed-response tests never yield a definitive unsupported current-information claim.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Tavily credential remains server-only |
| Unit/integration tests | Yes | Search adapter double | Disabled, success, empty, timeout, malformed |
| Database/RLS/contract tests | Yes | Authorization and audit contracts | Search authorization and correlation |
| E2E/accessibility/security evaluation | Yes | Injection and outbound-payload inspection | No private data disclosure; source labeling |

## Completion Evidence

- [ ] DEC-006 permits the exact outbound data fields and provider processing.
- [ ] Capability remains disabled unless explicitly configured.
- [ ] Search results are labeled and security tests find no unauthorized disclosure.
- [ ] Failure and degraded states are visible to the user.

## Assumptions

- Tavily is optional and not part of the core agent release gate.
- Public web content is untrusted regardless of source reputation.
- The agent can ask the user to rephrase a query without private data.
