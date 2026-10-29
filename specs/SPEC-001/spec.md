# Feature Specification: Agent Data Integration Foundation

**SPEC ID**: SPEC-001  
**Version**: 2  
**Dependencies**: []  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: Approved DEC-001: FlowZenit V2 remains a personal, single-owner application. Preserve the existing passkey and application access path without implementing new authentication in this stage; the passkey is not server-verifiable, so protected agent capabilities remain disabled until adequate access control is implemented and verified.

## Scope and Exclusions

### In scope
- Define the minimal integration contract between future agent capabilities and the existing Supabase project/client connection.
- Preserve the current React/Vite application, routes, UI, Supabase project, public schema, and existing database behavior.
- Allow domain query tools to use existing application data through typed contracts defined by SPEC-004.
- Keep compatibility with indexing and retrieval capabilities specified by SPEC-008 and SPEC-009 without implementing or duplicating them.
- Keep provider credentials and any privileged database credentials out of frontend code and browser bundles.
- Preserve the existing confirmation requirements for writes defined by DEC-009 and implemented by SPEC-005/SPEC-006.
- Document the current public/anonymous access exposure as unresolved; it is not an approved security basis for new agent endpoints.
- Define the access-control gate that keeps private-data and privileged agent capabilities unavailable until adequate access control is approved, implemented, and verified.

### Explicitly out of scope
- Supabase Auth, signup, a new passkey mechanism, MFA, TOTP, SMS, password recovery, new sessions, owner UUIDs, or choosing a future access-control mechanism.
- New authentication screens or other new UI.
- New database tables, columns, RLS policies, grants, or changes to existing access policies.
- Changes to the existing application access mechanisms or Supabase grants/RLS. The appropriate future access-control mechanism is not selected by DEC-001.
- Implementing the model runtime or API owned by SPEC-002.
- Implementing domain query/write tools owned by SPEC-004 and SPEC-006/SPEC-007.
- Implementing embeddings, indexing, vector search, lexical search, or RRF owned by SPEC-008/SPEC-009.
- Implementing chat UI, memory, tracing, observability, or external search.

## Contracts and Constraints

- **Existing contracts**: Reuse the current Supabase project and existing application connection pattern. The browser client in src/lib/supabase.js uses the public schema and public Supabase configuration. Future agent runtime and typed tools are defined by SPEC-002 and SPEC-004.
- **Compatibility**: Existing routes, screens, frontend access behavior, browser client, database schema, grants, and policies remain unchanged by this SPEC.
- **Data access**: Preserve the existing application path and database configuration, but existing anonymous permissions do not authorize new agent access to private data. No agent endpoint may return private FlowZenit data or perform a privileged operation until adequate access control is separately approved, implemented, and verified. Tool-action policy and write confirmations remain in their owning SPECs and do not prove owner identity.
- **Single-user scope**: The product is for one personal user. No product-level organizations, tenants, or multi-user account model are introduced. No new identity mechanism is required by this decision.
- **Known access risk**: The existing client-side passkey is only a navigation gate and is not authentication verifiable by a server. Existing database migrations permit anonymous access to product tables. Preserve these existing mechanisms in this documentation SPEC, but do not treat them as secure, as owner identity, or as permission to expose private data through agent endpoints.
- **Secrets**: Vite-exposed values remain limited to intentionally public configuration. Provider keys and privileged credentials must remain outside browser code, bundles, source maps, and client logs. A Secret/service_role key is not user authentication or an access-control substitute; a public Supabase key is not a privileged credential.
- **Domain behavior**: Typed operations preserve existing hierarchy, status, scheduling, and recurrence rules. Model-generated arbitrary SQL or arbitrary table/column selection is not part of the integration contract.
- **Writes**: This SPEC does not implement writes. Existing confirmation decisions remain in force for any write capability implemented by SPEC-006/SPEC-007.
- **Dependencies**: [].

## User Scenarios & Testing

### User Story 1 - Use existing application data after the access gate (Priority: P1)

The single application user asks the agent about FlowZenit data. The agent may obtain private records through existing database integration and typed domain query contracts only after adequate server-verifiable access control is separately approved, implemented, and verified. Until then, the agent capability remains unavailable.

**Why this priority**: Agent answers about demands and planning are only useful when they are grounded in the existing product data.

**Independent Test**: Before the access gate is met, use a synthetic private-data fixture and verify that the agent path returns no record and causes no side effect. After the gate is independently met, use a synthetic dataset in an isolated Supabase target to verify typed query results against the relational source. Existing browser permissions alone do not satisfy this test.

**Acceptance Scenarios**:
1. **Given** adequate access control has been separately approved, implemented, and verified, **When** an approved typed query runs through the agent integration, **Then** it returns only records allowed by the typed contract and consistent with the relational source.
2. **Given** the access gate is met and Supabase is unavailable or the required public connection configuration is missing, **When** a query is attempted, **Then** the operation reports a bounded dependency error without exposing credentials.
3. **Given** a prompt proposes raw SQL, a table name, or an arbitrary column, **When** the query is prepared, **Then** the model proposal is rejected and only SPEC-004 typed query contracts can be used.
4. **Given** the access gate is absent, unverified, or disabled, **When** a private-data request reaches an agent boundary, **Then** it returns no private record and produces no database or provider side effect.

### User Story 2 - Keep provider and privileged credentials out of the browser (Priority: P1)

The single application user can use future agent capabilities without provider or privileged database credentials appearing in frontend assets.

**Why this priority**: Provider and privileged keys must not be exposed even though the application does not add a new authentication layer.

**Independent Test**: Build with synthetic secret sentinels and inspect emitted browser assets, source maps, logs, and responses.

**Acceptance Scenarios**:
1. **Given** a provider or privileged database credential is configured for a server-side component, **When** the frontend is built, **Then** no credential value or secret sentinel appears in browser assets or source maps.
2. **Given** configuration for the agent integration is incomplete, **When** readiness or the dependent operation is evaluated, **Then** the failure is reported without logging or returning credential values.

### User Story 3 - Reuse RAG and write capabilities without duplication (Priority: P1)

The future agent runtime uses the existing database integration for exact records and delegates semantic retrieval and writes to their owning SPECs; SPEC-001 defines the boundary but does not implement that runtime or those capabilities.

**Why this priority**: The relational database remains authoritative, and repeated implementations of retrieval or mutation behavior could diverge from existing rules.

**Independent Test**: Review the contracts and run integration doubles proving exact reads delegate to SPEC-004, semantic retrieval to SPEC-008/SPEC-009, and writes to SPEC-006/SPEC-007 with applicable confirmations.

**Acceptance Scenarios**:
1. **Given** an exact status, date, or hierarchy query, **When** the agent retrieves data, **Then** it uses the typed relational query contract.
2. **Given** a request requiring semantic similarity, **When** retrieval is needed, **Then** the agent composes with SPEC-008/SPEC-009 and does not create a parallel index/search implementation.
3. **Given** a write request, **When** it is handed to a write tool, **Then** the confirmation rules in DEC-009 and SPEC-005/SPEC-006 still apply.

### Edge Cases
- Existing database grants may allow requests through the current anonymous connection; this is an unresolved exposure, not authentication, authorization, or permission to expose private data through a new agent endpoint.
- The existing passkey gate succeeds in the browser but provides no server-verifiable identity; an agent request must not infer access from it.
- A private-data or privileged-operation request arrives before adequate access control is verified; no private record is returned and no side effect occurs.
- The agent server runtime cannot reach the configured Supabase endpoint.
- The requested data is unavailable under current grants or does not exist.
- RAG results are stale or unavailable; the relational database remains the source of truth.
- A provider credential is accidentally given a VITE_ prefix or otherwise included in the client build.
- A write proposal lacks the confirmation required by its owning SPEC.
- User input attempts to provide SQL, table, or column names rather than selecting a typed capability.

## Requirements

### Functional Requirements

- **FR-001**: Agent integrations MUST use the existing Supabase project and connection path unless a separately approved SPEC changes that integration.
- **FR-002**: SPEC-001 MUST NOT add authentication flows, login screens, MFA, session management, owner UUID validation, or an authentication-only BFF.
- **FR-003**: SPEC-001 MUST NOT modify existing database schemas, grants, RLS policies, application routes, or the current access mechanism.
- **FR-004**: Exact domain queries MUST use the typed contracts owned by SPEC-004; model output MUST NOT become arbitrary SQL or arbitrary table/column access.
- **FR-005**: Semantic indexing and retrieval MUST compose with SPEC-008/SPEC-009 and MUST NOT be duplicated in SPEC-001.
- **FR-006**: Provider credentials and privileged database credentials MUST NOT be exposed to browser code, Vite bundles, source maps, or client-visible logs.
- **FR-007**: Public Supabase configuration intended for browser use MAY remain client-visible; it MUST NOT be described as a privileged secret.
- **FR-008**: Writes are outside this SPEC. Any later write tool MUST preserve the applicable confirmation requirements from DEC-009 and SPEC-005/SPEC-006.
- **FR-009**: This SPEC MUST NOT change existing table grants, policies, or application access behavior; tests MUST NOT assume that new RLS or grant restrictions were installed by this SPEC.
- **FR-010**: The existing anonymous/public data path and client-side passkey MUST be documented as an unresolved access risk. Their preservation MUST NOT be described as security approval for new agent access or used as proof of owner identity.
- **FR-011**: Integration errors MUST distinguish unavailable configuration/dependency from empty data without exposing credentials or internal stack traces.
- **FR-012**: Existing UI, routes, and product behavior MUST remain unchanged; no new screen is part of this SPEC.
- **FR-013**: An agent endpoint that can return private FlowZenit data or perform a privileged operation MUST remain unavailable until adequate access control is separately approved, implemented, and verified. The access-control mechanism is not selected by this SPEC.
- **FR-014**: A Supabase Secret/service_role credential MUST NOT be used as a substitute for authenticating or authorizing the owner; privileged credentials MUST remain server-only and must not enable an otherwise unprotected private-data endpoint.

### Key Entities

- **Agent data connection**: The configured connection from future agent runtime/tool code to the existing Supabase project.
- **Typed data capability**: A read or write contract owned by SPEC-004 or SPEC-006/SPEC-007; it is not arbitrary SQL.
- **RAG integration**: Composition with the index and retrieval contracts owned by SPEC-008/SPEC-009.
- **Integration outcome**: Success, empty result, unavailable dependency, invalid typed request, or rejected unsupported capability.
- **Known access risk**: The existing public/anonymous data path and client-side navigation gate, retained unchanged in this SPEC but not accepted as a security basis for agent access.

## Success Criteria

### Measurable Outcomes

- **SC-001**: After the DEC-001 access gate is separately met, approved typed query fixtures in an isolated target return the same persisted values as the configured Supabase source and existing app behavior.
- **SC-002**: Secret-sentinel scans find zero provider or privileged database credentials in browser assets and source maps.
- **SC-003**: No authentication screen, session store, owner UUID check, new RLS policy, grant change, or schema change is introduced by SPEC-001.
- **SC-004**: Exact reads, semantic retrieval, and writes are delegated to their respective SPEC contracts without duplicate implementations.
- **SC-005**: All write scenarios continue to require the confirmation behavior defined by DEC-009 and SPEC-005/SPEC-006.
- **SC-006**: Documentation distinguishes the existing anonymous/public exposure from a security control; no evidence claims the exposure was remediated or accepted for new agent access.
- **SC-007**: With no adequate access control verified, 100% of synthetic private-data and privileged-operation requests through an agent endpoint return no private record and cause zero side effects.

### Success status while the access gate is closed

SC-001 remains the post-gate typed-query criterion written above. It is not passed by completing the closed-gate foundation: while adequate access control is not separately approved, implemented, and verified, record SC-001 as **NOT VERIFIED**. Do not change its meaning, infer that its condition has been met, or report secure server-side owner authentication.

The verifiable success of the current foundation is limited to applicable criteria such as SC-002, SC-003, SC-006, and the fail-closed behavior in SC-007. This does not enable private reads, provider disclosure of private content, writes, or privileged endpoints. If the SDD completion rule requires every success criterion to be PASS, SC-001 remains a completion blocker until its separate prerequisite is met; do not bypass that rule.

The documentary review of ownership in T012 does not pass the runtime behavior in SC-004 or SC-005. Until the owning runtime, query, retrieval, and write capabilities exist and their contract checks run, record those runtime outcomes as **NOT VERIFIED**. Do not treat a consistent document boundary as proof that runtime delegation or write confirmation occurred.

## Validation and Evidence

The authoritative quality-gate matrix, including task ownership, evidence, pass conditions, and applicability, is in [plan.md](plan.md#quality-gate-matrix). Gate applicability is not a test result: an unexecuted test is never PASS. Direct product-database integration is NOT APPLICABLE to the current scope because it adds no database access path or database behavior; the mandatory synthetic authorization test must instead prove the closed gate stops before any Supabase/provider call. SC-001, and the runtime behavior in SC-004/SC-005, remain NOT VERIFIED until their stated prerequisites and owning capabilities are actually tested.

## Completion Evidence

- [ ] Acceptance criteria have PASS, FAIL, or NOT VERIFIED evidence.
- [ ] Each required gate records the exact command or method and result.
- [ ] Only the existing Supabase connection and approved contracts are used.
- [ ] No new authentication, UI, schema, grants, or RLS requirements were introduced.
- [ ] The existing passkey is not represented as server-verifiable authentication.
- [ ] Private-data and privileged agent endpoints remain blocked until adequate access control is approved, implemented, and verified.
- [ ] SC-001 is not reported as PASS unless its separately gated typed-query verification is actually completed.
- [ ] Documentary contract consistency is not reported as runtime delegation or confirmation evidence for SC-004/SC-005.
- [ ] The existing public/anonymous access risk is documented without treating it as permission to expose new agent endpoints.
- [ ] Existing write-confirmation rules remain in force.

## Assumptions

- FlowZenit V2 remains a personal single-user application using its existing routes, UI, Supabase project, client configuration, and data access behavior.
- The existing application access path is preserved, but its public/anonymous exposure is unresolved and does not authorize new agent access to private data.
- No future authentication or access-control mechanism is selected or approved by this SPEC.
- Provider keys remain server-side where provider calls require them.
- DEC-009 and the owning write-tool SPECs continue to govern confirmations.
- RAG, agent runtime, domain tools, memory, observability, and chat UI remain owned by their respective SPECs.

