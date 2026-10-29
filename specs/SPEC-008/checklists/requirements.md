# Specification Quality Checklist: Gemini Embeddings, pgvector, and Incremental Indexing

**Purpose**: Reviewer checklist for data safety, synchronization, and vector-version requirements.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] Scope separates indexing from query-time hybrid retrieval.
- [x] Source-of-truth and derived-index responsibilities are explicit.
- [x] Outbox, replay, and deletion behavior are observable.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [ ] DEC-006 data-sharing and DEC-007 content-value approvals are pending.
- [ ] DEC-010 worker/runtime and DEC-011 model/dimension approvals are pending.
- [x] Index metadata represents the single-user application dataset; no owner UUID, tenant, or organization model is introduced.
- [x] Event ordering, duplicate delivery, provider failure, and incompatible dimensions are covered.
- [x] Success criteria are measurable.
- [x] Embedding version and migration boundary are explicit.

## Feature Readiness

- [x] The planned tests use deterministic doubles and synthetic records; this checklist does not assert that tests have been implemented or executed.
- [x] Production private-data indexing is blocked until the SPEC-001 access-control gate and DEC-006/DEC-007 are satisfied.
- [x] Deletion invalidates derived content before retrieval.

## Notes

- Current domain titles are short; usefulness of vector indexing must be demonstrated before it is enabled.
- Metadata-only changes (such as status or schedule) are separated from embedding-input changes; the chosen text representation remains subject to DEC-007.
