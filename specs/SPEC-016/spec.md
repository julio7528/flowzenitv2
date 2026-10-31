# Feature Specification: Dependency-Aware SDD Execution and Gate Waivers

**SPEC ID**: `SPEC-016`  
**Version**: `1`  
**Dependencies**: `[]`  
**Risk**: `high`

**Feature Branch**: `not-created (existing branch preserved)`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User-approved direction to allow independent SPEC batches and explicit, auditable alternatives for unavailable quality gates while preserving exact manifest approval and product security decisions.

## Scope and Exclusions

### In scope

- Permit a new, separate batch to run when its declared prerequisite SPECs are complete, even if an unrelated batch is paused.
- Keep paused batches paused; starting an independent batch never resumes, edits, or replaces another manifest.
- Preserve exact SPEC versions, ordered manifest contents, content hashes, and explicit owner approval for each batch.
- Add an explicit `WAIVED` outcome for a required quality gate when the exact SPEC/gate permits an exception and the owner accepts the recorded residual risk or alternate evidence.
- Keep `WAIVED`, `SKIPPED`, `FAILED`, and `PASSED` distinct in stored state and completion reports.
- Record gate-waiver authorization against the exact batch, manifest hash, SPEC version, run, and gate key.
- Update SDD policy and runner instructions to use dependency completion, duplicate-SPEC checks, and disjoint writable scopes to decide whether separate batches may proceed.
- Support direct SQL through the connected Supabase project for MVP database-contract tests when an isolated local PostgreSQL target is unavailable, using verified project/schema identity, synthetic fixtures, and rollback or exact-ID cleanup.

### Explicitly out of scope

- Changing DEC-001, DEC-009, DEC-012, or any other product decision.
- Enabling private reads, writes, confirmation flows, providers, or production operations.
- Treating a skipped or failed check as passed, clearing correction history, or resetting correction limits.
- Implicitly resuming a paused batch or modifying an approved manifest.
- Weakening product RLS, product grants, authentication, or the exact approval requirement for batch manifests. SDD-schema grants may change only as needed to keep privileged governance RPCs unavailable to runner credentials.
- Running a test against production data or changing deployment settings.
- Using real user or business records as test fixtures, or treating an administrator SQL session as proof that runner-role privileges are correct.

## Contracts and Constraints

- **Existing contracts**: Preserve the immutable SDD manifest, versioned SPEC snapshot, explicit owner authorization, lease, correction limits, and per-batch manifest order.
- **Compatibility**: Existing batches and gates retain their current meaning. Existing `PASSED` records are unchanged; legacy `SKIPPED` records do not become accepted automatically.
- **Security and data handling**: A waiver is a recorded owner risk decision, never evidence that a test passed. Store no credentials, prompts, transcripts, or private data in waiver details.
- **MVP database test target**: Prefer an isolated local PostgreSQL target. If unavailable, an owner-authorized test may use the connected development Supabase project directly through SQL after verifying the exact project, schema, permissions, and absence of a run-specific fixture marker. Use synthetic records only, record generated IDs and parent links, roll back when possible, otherwise clean up only captured IDs in dependency order, and preserve all preexisting records. Never use product agent endpoints for these direct contract tests.
- **Dependencies**: No product SPEC prerequisite. The feature operates on the existing SDD governance schema and CLI.

## User Scenarios & Testing

### User Story 1 - Run an independent SPEC batch (Priority: P1)

The owner wants to continue work on a SPEC whose prerequisites are complete while an unrelated batch is paused on a separate gate.

**Why this priority**: A gate in one independent workstream should not block useful, separately authorized work.

**Independent Test**: Given a paused batch for SPEC-A and completed prerequisites for SPEC-B, create and approve a distinct SPEC-B batch. SPEC-B may start, while SPEC-A remains paused and its manifest stays unchanged.

**Acceptance Scenarios**:

1. **Given** all declared dependencies of SPEC-B are completed and no active batch contains SPEC-B, **When** the owner approves a separate immutable SPEC-B manifest, **Then** the runner admits it even if an unrelated batch is paused.
2. **Given** a required dependency is incomplete or the same SPEC is active in another batch, **When** a batch is validated or approved, **Then** the supervisor rejects it with the dependency or conflict identified.
3. **Given** a paused batch, **When** an independent batch starts, **Then** the paused batch remains paused and cannot be resumed without its own explicit authorization.

---

### User Story 2 - Accept an explicitly authorized gate alternative (Priority: P1)

The owner needs to finish an MVP when a required check is unavailable or an approved alternative provides the relevant evidence, while keeping the remaining uncertainty visible.

**Why this priority**: Environment limitations can block otherwise reviewable work, but the system must not misstate an unrun check as passed.

**Independent Test**: An eligible required gate can move to `WAIVED` only after an owner authorization bound to the exact batch hash, SPEC version, run, gate key, reason, and evidence. A missing or mismatched authorization is rejected.

**Acceptance Scenarios**:

1. **Given** a gate declared waiver-eligible and a documented unavailable check or accepted alternative, **When** the owner authorizes that exact waiver through the privileged channel, **Then** the gate is recorded as `WAIVED` with its evidence and residual risk.
2. **Given** a known failing test, an ineligible gate, or a mismatched manifest hash, **When** a waiver is requested, **Then** the supervisor rejects it.
3. **Given** a completed SPEC with an authorized waiver, **When** status and completion evidence are read, **Then** the gate remains visibly `WAIVED` and is never reported as `PASSED`.

---

### User Story 3 - Audit the execution decision (Priority: P2)

The owner or reviewer wants to reconstruct why independent work proceeded and which gates were accepted with residual risk.

**Why this priority**: Flexible execution remains trustworthy only when its decisions are auditable.

**Independent Test**: Read-only status and event queries identify the exact manifest, prerequisite result, gate outcome, approver, reason, and evidence reference without exposing secrets or private content.

**Acceptance Scenarios**:

1. **Given** separate SPEC batches, **When** a reviewer inspects status, **Then** each batch's dependencies, manifest, state, and lease are independently visible.
2. **Given** a gate waiver, **When** a reviewer inspects status and audit events, **Then** the exact gate, owner, reason, and evidence are visible without credentials or private content.

### Edge Cases

- An unrelated paused batch still owns an active lease: the independent batch is not admitted until file-scope safety is established.
- A completed prerequisite is referenced with an unsupported or unregistered SPEC snapshot: batch validation fails closed.
- A waiver request is replayed with a different hash, run, or gate key: it is rejected as a mismatch.
- A test is known to fail: it cannot be converted to `WAIVED` through the environmental-unavailability path.
- A completion contains one or more waivers: reports identify each waived gate and do not state that every required check passed.

## Requirements

### Functional Requirements

- **FR-001**: The supervisor MUST preserve the exact ordered manifest, immutable SPEC versions, content hashes, and explicit owner approval for every batch.
- **FR-002**: A separate batch MAY start while an unrelated batch is paused only when every declared prerequisite is completed, the same SPEC is not active elsewhere, the target batch has its own approval, and writable scopes are disjoint.
- **FR-003**: Starting an independent batch MUST NOT resume, alter, or complete a paused batch.
- **FR-004**: A batch with incomplete prerequisites, an active duplicate SPEC, or overlapping active writable scopes MUST fail closed.
- **FR-005**: A required gate MAY be recorded as `WAIVED` only when the exact gate is waiver-eligible and the owner explicitly authorizes the exact batch, manifest hash, SPEC version, run, gate key, reason, and evidence.
- **FR-006**: A gate waiver MUST be a distinct persisted outcome; `WAIVED` MUST NOT be counted, rendered, or summarized as `PASSED`.
- **FR-007**: `SKIPPED` and `FAILED` required gates MUST continue to prevent completion unless an eligible, separately authorized waiver is recorded; known failing checks and confirmed security defects MUST NOT be waived as environmental unavailability.
- **FR-008**: A SPEC completion MAY proceed only when all executable tasks are complete, failures are resolved, and each required gate is `PASSED` or has a valid `WAIVED` authorization.
- **FR-009**: Status and audit reports MUST show waived gates, approver, reason, and evidence reference, without storing credentials, tokens, prompts, transcripts, or private data.
- **FR-010**: This feature MUST NOT change DEC-001, DEC-009, DEC-012, product access behavior, product database grants/RLS, or deployment behavior. SDD-schema privilege changes are allowed only to enforce the specified runner/owner boundary.
- **FR-011**: Database-contract gates MAY use direct SQL against the owner-authorized development Supabase project when an isolated PostgreSQL target is unavailable, only after project/schema/permission/fixture-marker checks; tests MUST use synthetic data and rollback or exact-ID cleanup and MUST NOT use product agent endpoints.

### Key Entities

- **Execution batch**: An owner-approved ordered list of immutable SPEC versions with a manifest hash and independent lifecycle.
- **Quality gate**: A required or optional check with an explicit outcome such as `PASSED`, `FAILED`, `SKIPPED`, or `WAIVED`.
- **Gate waiver**: An owner authorization for one exact gate in one run, with reason, evidence reference, and accepted residual risk.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of eligible independent batches with completed prerequisites can be admitted while unrelated paused batches remain paused.
- **SC-002**: 100% of batches with incomplete prerequisites, duplicate active SPECs, or overlapping active writable scopes are rejected.
- **SC-003**: 100% of `WAIVED` gate outcomes have an exact owner authorization and evidence record.
- **SC-004**: 100% of reports distinguish `WAIVED` from `PASSED` and preserve the residual risk.
- **SC-005**: 0 changes to product access gates, confirmation decisions, runtime limits, product RLS, or product grants result from this feature.
- **SC-006**: 100% of direct Supabase contract-test runs record the verified project/schema, fixture marker result, synthetic record IDs, and rollback or exact-ID cleanup evidence.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | `npm run lint` | No new diagnostics |
| Build/type check | Yes | `npm run build` | CLI and existing application build successfully |
| Unit/integration tests | Yes | `npm test` plus focused SDD policy tests | Dependency admission, conflicts, waiver authorization, and truthful reporting |
| Database/contracts | Yes | Prefer isolated PostgreSQL. If unavailable, execute the additive SDD migration/RPC contract script through direct SQL in the owner-authorized development Supabase project after the checks in “MVP database test target” | Exact hash binding, audit persistence, fail-closed behavior, verified project/schema, synthetic fixture IDs, and rollback/cleanup |
| Security review | Yes | Read-only review of privileges, evidence allowlist, and DEC boundaries | No runner credential can approve/waive/resume; no product permission changes |

## Completion Evidence

- [ ] Each acceptance criterion is marked PASS, FAIL, or NOT VERIFIED with evidence.
- [ ] Required gates have exact command/method, outcome, and evidence.
- [ ] `WAIVED` outcomes are reported separately from `PASSED`.
- [ ] No unresolved failure remains; correction history and limits are preserved.
- [ ] Changes stay within SDD governance scope; product access decisions remain unchanged.

## Assumptions

- A paused batch has no active lease before another batch may use shared workspace resources.
- Batch approval remains a privileged owner decision bound to the exact manifest hash.
- A waiver accepts documented residual risk; it does not claim the underlying test passed.
- Product access, confirmation policy, and runtime budgets remain separately governed decisions.
