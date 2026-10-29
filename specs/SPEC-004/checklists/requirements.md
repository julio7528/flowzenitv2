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
- [ ] Required database contract gate passes against an isolated, non-production Supabase/PostgREST target containing synthetic records.
- [ ] Proposed page/text/date bounds and text-search behavior require user review before implementation.

## Notes

- No appointment/commitment entity was found in the current schema; unsupported requests must be explained without creating artificial records.
- The current UI does not provide a shared text-search behavior; case-insensitive literal substring is proposed, not approved.
- Readiness review 2026-10-29: database contract gate is BLOCKED in this environment. Supabase CLI is installed, but Docker is unavailable and no isolated test target is configured. No database test was run; this mandatory gate is not `NOT APPLICABLE`. Do not use `.env.local` or a product database as a substitute.
- SPEC-001 is recorded as COMPLETED in the supervisor. Its current gate remains closed; completion does not satisfy DEC-001 for private runtime reads.
