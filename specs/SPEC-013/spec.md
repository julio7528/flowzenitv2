# Feature Specification: Agent Test and Evaluation Platform

**SPEC ID**: SPEC-013  
**Version**: 1  
**Dependencies**: [SPEC-001]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Provide a reusable test and evaluation foundation for agent tools, model behavior, security, RAG, persistence, end-to-end workflows, and resilience.

## Scope and Exclusions

### In scope
- Provide isolated unit, contract, integration, database/RLS, security, E2E, resilience, and agent evaluation patterns.
- Define versioned synthetic test fixtures for Portuguese requests, tool proposals, prompt injection, retrieval relevance, and grounded answers.
- Ensure each feature SPEC owns its relevant tests and gates; this shared platform supplements rather than replaces them.
- Establish deterministic provider doubles, test environment isolation, safe cleanup, and evidence reporting.

### Explicitly out of scope
- Treating a single global test suite as sufficient for every SPEC.
- Using private production conversations as evaluation data without explicit approval.
- Calling external providers in ordinary test runs.
- Disabling required checks or weakening tests to obtain a green result.

## Contracts and Constraints

- **Existing contracts**: Use project commands npm test, npm run lint, npm run build, and existing SDD database test where relevant; agent-specific commands are additive.
- **Compatibility**: Existing application tests continue to run. New test infrastructure must not require production credentials for local deterministic runs.
- **Security and data handling**: Tests use synthetic data by default and isolate lifecycle environments (for example, a dedicated non-production project/database or schema), transaction rollback or explicit allowlisted cleanup, and secret-sentinel scanning. Test-environment isolation is not product tenant isolation and MUST NOT introduce tenant, organization, or multi-user semantics into FlowZenit. The existing client-side passkey is not server-verifiable; tests MUST prove private-data and privileged agent endpoints fail closed until the SPEC-001 access-control gate is met.
- **Dependencies**: [SPEC-001].

## User Scenarios & Testing

### User Story 1 - Validate a SPEC's behavior in isolation (Priority: P1)

A developer can run deterministic tests for one agent capability without calling live model providers.

**Why this priority**: Reliable local gates are required for autonomous future SPEC execution.

**Independent Test**: Run one fixture suite with a single-user request context, model, retriever, tool, and clock providers.

**Acceptance Scenarios**:
1. **Given** a capability test suite, **When** run without provider credentials, **Then** deterministic tests execute and no external network call occurs.
2. **Given** an intentional contract violation, **When** the test runs, **Then** it fails with the violated contract and relevant evidence.

### User Story 2 - Evaluate safety and model quality (Priority: P1)

A reviewer can compare tool safety, grounding, and retrieval quality against a versioned dataset.

**Why this priority**: Agent behavior requires evaluation beyond ordinary unit assertions.

**Independent Test**: Run fixed synthetic safety and retrieval datasets and compare stored metrics.

**Acceptance Scenarios**:
1. **Given** a tool-injection or protected-access fixture while the SPEC-001 gate is unmet, **When** evaluation runs, **Then** unauthorized tool calls, private-data disclosure, side effects, and secret exfiltration are counted as failures.
2. **Given** a RAG relevance dataset, **When** evaluation runs, **Then** Recall@k, MRR, and nDCG@k are reported with dataset version.
3. **Given** an answer without supporting evidence, **When** evaluation runs, **Then** unsupported factual claims fail the grounding criterion.

### User Story 3 - Validate persistence and recovery (Priority: P2)

A developer can test idempotency, concurrency, outbox replay, checkpoint resume, and deletion without touching user data.

**Why this priority**: Persistent agent features can fail in ways unit tests do not expose.

**Independent Test**: Run integration tests against an isolated ephemeral or dedicated test database with synthetic records.

**Acceptance Scenarios**:
1. **Given** concurrent duplicate requests, **When** integration tests execute, **Then** one intended domain mutation is persisted.
2. **Given** an interrupted worker, **When** a test resumes from persisted state, **Then** completed work is not repeated and counters are preserved.

### Edge Cases
- Test environment variables point at a production URL; destructive tests refuse to run.
- A live-provider test is requested without explicit opt-in.
- Fixture or snapshot contains a secret sentinel or real transcript.
- Evaluation dataset changes without version update.
- E2E retries mask a flaky functional failure.

## Requirements

### Functional Requirements

- **FR-001**: Every agent SPEC MUST define local unit/contract tests and additional gates proportional to risk before implementation begins.
- **FR-002**: The shared platform MUST support deterministic doubles for request context, model, tools, clock, embedding, search, tracing, and external network providers without requiring an identity provider.
- **FR-003**: Normal test commands MUST make zero live model, embedding, search, or LangSmith calls.
- **FR-004**: Live provider tests MUST require explicit opt-in, synthetic data, server-only credentials, bounded calls, and recorded provider/model version.
- **FR-005**: Database tests MUST use an isolated non-production database/schema or dedicated test project and MUST refuse to run when target identity is not positively verified as non-production. This environment boundary is for test safety only and does not define product tenant or organization support.
- **FR-006**: Cleanup MUST use transaction rollback or exact fixture IDs and MUST never use broad truncation or wildcard deletion against shared data.
- **FR-007**: Contract tests MUST cover tool schema, authorization allow/deny, idempotency, domain constraints, and response/error categories.
- **FR-008**: Security datasets MUST include direct and indirect prompt injection, unauthorized resource/capability access within the single-user dataset, private-data disclosure, secret exfiltration, malformed calls, confirmation replay, and untrusted retrieval. These cases do not model cross-tenant or foreign-owner isolation.
- **FR-009**: RAG evaluations MUST version query, expected relevant records, language, entity type, and dataset source; metrics include Recall@k, MRR, and nDCG@k.
- **FR-010**: Grounding evaluations MUST fail unsupported factual claims and verify that reported record IDs map to retrieved sources.
- **FR-011**: Resilience tests MUST cover timeout, cancellation, provider outage, retry exhaustion, concurrent duplicate requests, checkpoint corruption, and recovery.
- **FR-012**: E2E tests for UI changes MUST include the existing application navigation/access behavior where relevant, keyboard interaction, accessible feedback, and 1440/820/390 pixel viewports. They MUST NOT introduce a new authentication mechanism and MUST verify that private-data and privileged agent endpoints fail closed while the SPEC-001 access-control gate is unmet.
- **FR-013**: Test evidence MUST include command, exit code, dataset/fixture version, and result; unavailable checks are NOT VERIFIED.
- **FR-014**: Test failures MUST not be hidden by disabling checks or silently skipping required suites.
- **FR-015**: Test fixtures MUST model the single-user application data context and MUST NOT require owner/non-owner identities, owner UUIDs, organizations, or tenants. Tool-policy allow/deny and unknown/malformed resource-ID tests remain in scope.
- **FR-016**: Security tests MUST verify that the client-side passkey and existing anonymous grants are not treated as server authorization and that, before the access-control gate is satisfied, private agent endpoints return no private content and cause zero side effects.

### Key Entities

- **Test fixture**: Synthetic versioned input and expected observable result.
- **Evaluation case**: Query plus safety, relevance, grounding, or response criterion.
- **Test environment identity**: Verified target marker preventing accidental production access.
- **Evidence record**: Command, version, result, and failure summary for one quality gate.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of standard local tests run without external provider credentials and make zero outbound provider calls.
- **SC-002**: All required security fixtures fail the build when unauthorized side effects or secret disclosure occur.
- **SC-003**: A database test pointed at an unverified or production target terminates before creating or deleting any row.
- **SC-004**: Every agent SPEC implementation report can link each acceptance criterion to a test/evidence record or mark it NOT VERIFIED.
- **SC-005**: Test-environment isolation is demonstrably separate from product identity scope; no test schema, fixture contract, or helper requires tenant or organization fields in FlowZenit records.
- **SC-006**: 100% of synthetic private-data and privileged-operation requests fail closed with no disclosure or side effect while the SPEC-001 access-control gate is unmet.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | Test code linted |
| Build/type check | Yes | Project production build | Test tooling excluded from browser bundle |
| Unit/integration tests | Yes | Project test commands plus agent suites | Deterministic and persistence coverage |
| Database/RLS/contract tests | Yes | Isolated target guard and RLS suite | Production refusal and allow/deny results |
| E2E/accessibility/security evaluation | Yes | Playwright and evaluation harness | Viewport, keyboard, safety, grounding evidence |

## Completion Evidence

- [ ] Deterministic tests run without provider credentials or network calls.
- [ ] Production-target guard and cleanup boundaries are verified.
- [ ] Every evaluation set has versioned fixtures and expected metrics.
- [ ] Existing application tests remain part of the quality gate.

## Assumptions

- Tests are added alongside each capability SPEC, not deferred to this platform SPEC alone.
- Synthetic fixtures are the default source of test data.
- The current repository has no declared Playwright command; selecting/adding E2E tooling belongs to a future implementation plan.
- Numeric quality/coverage targets in these Draft success criteria are proposals until explicitly approved. Zero provider calls in ordinary suites and zero private disclosure/side effects while the DEC-001 gate is unmet are security invariants, not tunable quality thresholds.
