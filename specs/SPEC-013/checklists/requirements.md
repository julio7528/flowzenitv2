# Specification Quality Checklist: Agent Test and Evaluation Platform

**Purpose**: Reviewer checklist for test isolation, agent evaluations, and evidence quality.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] The platform complements per-SPEC tests instead of replacing them.
- [x] Deterministic and live-provider tests are separated.
- [x] Database target safety and cleanup boundaries are explicit.
- [x] Test-environment isolation is distinct from product multi-tenancy; no tenant or organization feature is introduced.
- [x] The client passkey is not server identity; protected endpoints are tested as fail-closed until the SPEC-001 access-control gate is met.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [x] Security, RAG, grounding, persistence, resilience, and E2E cases are specified.
- [x] Dataset versioning and evidence fields are explicit.
- [x] Success criteria are measurable.
- [x] Production refusal behavior is testable.
- [x] Numeric quality thresholds remain proposals until approved; fail-closed/no-side-effect security conditions are preserved as invariants.

## Feature Readiness

- [x] Tests fail on unauthorized effects, secret leakage, and unsupported grounding.
- [x] Security cases cover one single-user dataset and unknown resource IDs without modeling tenants or foreign owners.
- [x] Existing commands remain required.
- [x] Live provider access requires explicit opt-in and synthetic content.

## Notes

- Playwright availability is not currently declared in package scripts; implementation planning must verify tooling before selecting a dependency.
- SPEC-009 relevance thresholds and SPEC-012 SC-001 evaluator population/sample/protocol remain open; this checklist does not approve a metric threshold or Playwright dependency.
