# Specification Quality Checklist: Optional Tavily External Search

**Purpose**: Reviewer checklist for optional external search, outbound disclosure, and source provenance.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] Scope separates external public search from internal domain retrieval.
- [x] Disabled-by-default behavior is explicit.
- [x] External sources remain untrusted and are labeled.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [x] Disclosure, timeout, empty result, malformed response, and injection cases are specified.
- [x] Success criteria include outbound data inspection.
- [x] Dependencies and optional status are explicit.
- [x] Failure cannot create unsupported current-information claims.
- [x] Query/result bounds are validated through configuration without choosing numeric production values.

## Feature Readiness

- [x] Tests cover disabled capability and private-data sentinel leakage.
- [x] Source provenance is retained in answers.
- [x] Production use is gated by DEC-006.
- [x] Private data from FlowZenit tools cannot reach Tavily until the SPEC-001 access-control gate and approved DEC-006 disclosure policy are satisfied.
- [ ] DEC-010 runtime and DEC-012 operational limits are resolved before production activation.

## Notes

- Tavily is a future optional capability and is not required for core FlowZenit agent workflows.
- Numeric query/result/timeout/retry values and provider-use bounds remain open; absent approved configuration, production search remains disabled.
