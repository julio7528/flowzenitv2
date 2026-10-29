# Specification Quality Checklist: Domain Contracts and Read Tools

**Purpose**: Reviewer checklist for query coverage, domain fidelity, and authorization requirements.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] Queries are bounded to observable domain needs.
- [x] Current hierarchy, status, and planning rules are reflected.
- [x] Relative query dates use canonical America/Cuiaba civil dates and do not shift stored values through UTC.
- [x] Routine templates are distinguished from persisted activities.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [x] DEC-002 is resolved: only current demand hierarchy and recurring routine entities are in scope.
- [x] Empty, ambiguous, partial, truncated, and unknown-ID outcomes are defined.
- [x] Success criteria are measurable.
- [x] Dependencies and data contracts are identified.

## Feature Readiness

- [x] Tests cover hierarchy, date ranges, overlap, and recurring rules.
- [x] Transactional reads remain structured and grounded in the relational source.
- [x] Private agent reads fail closed until the SPEC-001 access-control gate is satisfied.
- [x] Unsupported commitments are explained without creating artificial records.
- [x] Daily exact-date scheduling is distinct from backlog and weekly card projections; existing UI projection differences are documented.
- [x] Bigint IDs and stored versus derived status values have explicit read DTO rules.
- [x] The service gate is explicitly tied to SPEC-001's currently unconditional denial; no server Supabase client or enabled capability is attributed to SPEC-001.
- [x] Required internal service/security tests are distinguished from conditional browser E2E/accessibility checks.
- [x] Owner-authorized test-only logical isolation on the existing FlowZenit V2 development Supabase is scoped to SPEC-004@2; it does not enable agent reads or runtime writes.
- [x] Approved local query parameters are explicit: page size 50/100, text max 200 code points, inclusive date span 366 days, literal case-insensitive/accent-sensitive `ILIKE` with `%`, `_`, and backslash escaped.
- [ ] T025 preflight and contract tests pass on the exact authorized development project; created IDs/relationships are captured and exact child-first cleanup is verified.

## Notes

- No appointment/commitment entity was found in the current schema; unsupported requests must be explained without creating artificial records.
- The current UI does not provide a shared text-search behavior. The new SPEC-local `ILIKE` semantics are owner-approved; normalization equivalence is not promised and actual collation behavior must be verified in T025.
- Owner authorization dated 2026-10-29 permits temporary synthetic records only in the current development project `flowzenithv2` (`twikxeloeftczwbpjvzr`). No fixture or product-table test was run during this preparation; connection/schema/permissions/collision checks remain execution preconditions, not a reason to require Docker or another project.
- The database/contract gate remains mandatory and cannot be recorded PASS until T025 runs and exact-ID cleanup is verified. If safe fixture scope/cleanup cannot be proven, stop that operation and record it as unverified/blocked; never use broad cleanup or touch preexisting records.
- SPEC-001 is recorded as COMPLETED in the supervisor. Its current gate remains closed; completion does not satisfy DEC-001 for private runtime reads.
