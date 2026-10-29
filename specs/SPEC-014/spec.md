# Feature Specification: CI/CD, Environments, and Release Preparation

**SPEC ID**: SPEC-014  
**Version**: 1  
**Dependencies**: [SPEC-001, SPEC-013]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Prepare isolated development, test, staging, and production configuration plus CI quality gates for future agent capabilities, without automatic deployment.

## Scope and Exclusions

### In scope
- Define environment separation, secret naming/ownership, runtime-only configuration, and prevention of secret exposure in browser bundles.
- Run lint, build, unit/contract, security, and applicable database/E2E gates in CI.
- Define promotion readiness checks and migration review evidence without executing deployment.
- Validate that tests and builds use isolated synthetic data and approved provider credentials only.
- Document rollback and compatibility evidence expected from future approved implementation releases.

### Explicitly out of scope
- Automatic Vercel production deployment, merge, commit, push, or release.
- Creating or modifying product migrations in this documentation SPEC.
- Selecting a Vercel plan, region, worker/queue runtime, or build timeout; see DEC-010.
- Introducing financial budget enforcement.

## Contracts and Constraints

- **Existing contracts**: Preserve current Vite browser variables as public-only and keep Supabase Secret/provider credentials server-only. Current project has Vercel delivery but no confirmed agent API runtime.
- **Compatibility**: CI gates are additive; user continues to perform all commits, pushes, merges, and deployments manually.
- **Security and data handling**: CI logs and artifacts must not expose secrets, transcripts, or production rows. Production credentials are unavailable to ordinary test jobs.
- **Dependencies**: [SPEC-001, SPEC-013].

## User Scenarios & Testing

### User Story 1 - Validate a change before release (Priority: P1)

A maintainer receives clear CI evidence that an approved SPEC implementation passed required checks.

**Why this priority**: Autonomous implementation requires repeatable objective quality gates.

**Independent Test**: Run the pipeline on synthetic passing and failing changes without deploying.

**Acceptance Scenarios**:
1. **Given** a change with lint, test, or build failure, **When** CI runs, **Then** the required gate fails and the result identifies the command and failure.
2. **Given** all required checks pass, **When** CI finishes, **Then** it reports readiness evidence but does not deploy or merge.
3. **Given** a feature SPEC requires database/RLS validation, **When** the relevant gate is unavailable, **Then** status is NOT VERIFIED and release readiness remains incomplete.

### User Story 2 - Protect environment secrets (Priority: P1)

A maintainer can configure separate credentials for development, test, preview, and production without exposing server-only secrets to the browser.

**Why this priority**: Agent providers and privileged database actions require a protected server boundary.

**Independent Test**: Use synthetic secret sentinels in environment matrices, build bundles, logs, and artifacts.

**Acceptance Scenarios**:
1. **Given** a server-only secret is set in CI, **When** Vite builds the client, **Then** its value is absent from assets, source maps, logs, and downloadable artifacts.
2. **Given** a test job lacks production variables, **When** it runs, **Then** it uses local doubles or isolated test credentials and does not fall back to production.

### User Story 3 - Prepare a manual release (Priority: P2)

A maintainer can review migration compatibility and rollback evidence before manually deploying.

**Why this priority**: The user retains release control and needs a concrete review artifact.

**Independent Test**: Produce a release report from a synthetic change with migration and rollback notes.

**Acceptance Scenarios**:
1. **Given** a release candidate, **When** the report is generated, **Then** it lists SPEC version, checks, migrations, compatibility, rollback limits, and unresolved decisions.
2. **Given** a CI run completes, **When** the pipeline exits, **Then** it has not run deploy, merge, commit, or push commands.

### Edge Cases
- Secret is present in a build output through accidental VITE_ prefix.
- CI uses a stale environment secret or points to the wrong Supabase project.
- A required gate times out or is skipped.
- A migration has an irreversible step without a rollback alternative.
- Preview deployment protection or server runtime limits differ from local assumptions.

## Requirements

### Functional Requirements

- **FR-001**: CI MUST run project lint, production build, unit tests, and every SPEC-required specialized quality gate.
- **FR-002**: A missing required gate MUST be reported as NOT VERIFIED and MUST prevent a complete readiness result.
- **FR-003**: Environment configuration MUST distinguish public browser values from server-only credentials; only intentionally public values may use Vite-exposed names.
- **FR-004**: Test jobs MUST have no production credentials and MUST refuse to use an unverified database target.
- **FR-005**: Secret scanning MUST inspect logs, bundles, source maps, and artifacts using synthetic sentinels and repository scanning.
- **FR-006**: CI MUST not execute database migrations against production, deploy, merge, commit, or push.
- **FR-007**: A release readiness report MUST identify SPEC/version, gate evidence, data migration plan, compatibility, rollback constraints, and unresolved approvals.
- **FR-008**: Migration changes MUST have forward behavior, compatibility window, data preservation, failure behavior, and rollback or compensating strategy reviewed before manual application.
- **FR-009**: Provider calls in CI MUST be disabled by default; an explicitly approved smoke job uses synthetic input, server-only credentials, and bounded execution.
- **FR-010**: CI logs and artifacts MUST redact secrets and avoid production user data.
- **FR-011**: No required check may be disabled or converted to a warning solely to obtain a green result.
- **FR-012**: Runtime-specific duration, region, worker, and queue assumptions MUST remain pending DEC-010 until the deployment target is confirmed.
- **FR-013**: Release readiness MUST remain incomplete for any endpoint exposing private FlowZenit data or privileged operations until evidence shows the SPEC-001 access-control gate is approved, implemented, and verified.
- **FR-014**: Release readiness MUST verify that repository events cannot implicitly publish to production through Vercel Git integration. Production publication MUST require an explicit manual action or separately authorized operation; unknown deployment settings leave release readiness NOT VERIFIED.

### Key Entities

- **Environment profile**: Named, isolated configuration and permitted credentials for one lifecycle stage.
- **Quality gate result**: Command, exit code, artifact, and evidence for a required check.
- **Release readiness report**: Human-reviewable compatibility and gate summary; not a deployment authorization.
- **Secret exposure finding**: Location and classification of a detected sensitive value without echoing the value.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of configured required gates run or are marked NOT VERIFIED; none is silently skipped.
- **SC-002**: Secret-sentinel scans find zero server-secret values in browser bundles, source maps, logs, and artifacts.
- **SC-003**: CI test jobs make zero connections to a production database or provider endpoint.
- **SC-004**: 100% of pipeline runs perform zero deployment, merge, commit, or push actions.
- **SC-005**: No release report marks private agent capabilities ready while the SPEC-001 access-control gate is unmet.
- **SC-006**: 100% of CI executions perform zero deployment/promotion actions, and readiness remains NOT VERIFIED while Vercel production auto-deploy behavior is unknown.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Existing and CI lint command | Gate result and exit code |
| Build/type check | Yes | Production build plus asset scan | Build and no secret sentinels |
| Unit/integration tests | Yes | Existing test suite and agent tests | Test report with required suites |
| Database/RLS/contract tests | Yes | Isolated non-production target | Target identity and allow/deny report |
| E2E/accessibility/security evaluation | Yes | CI browser/security jobs | Viewports, accessibility, scan evidence |

## Completion Evidence

- [ ] Pipeline passes synthetic success and fails synthetic required-gate failures.
- [ ] Secret scanning and production-target guard have verified outcomes.
- [ ] No automatic publication operation is present in pipeline execution.
- [ ] DEC-010 runtime/environment decisions are recorded before production configuration.

## Assumptions

- CI may provide readiness evidence but does not publish software.
- The user performs manual version control and deployment actions.
- Cost limits are not enforced by this SPEC.
