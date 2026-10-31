# Specification Quality Checklist: Persistent Conversational Memory

**Purpose**: Reviewer checklist for lifecycle, isolation, and persistence requirements.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] User journeys cover resume, lifecycle management, and separation of stored artifacts.
- [x] Scope excludes unapproved semantic memory and transcript indexing.
- [x] Security boundaries apply to every operation, not just thread creation.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [ ] DEC-005 retention, deletion, export, and sharing policy is resolved before production enablement.
- [x] Pagination, single-user conversation lifecycle, checkpoint compatibility, deletion, and active-turn edge cases are specified.
- [x] Conversation fixtures use the single-user application dataset and do not require authenticated/non-owner identities or multi-user, tenant, or organization support.
- [x] Success criteria are measurable.
- [x] Dependencies and data categories are explicit.
- [x] Bounded context construction and compaction preserve the canonical transcript and carry a source cursor.
- [x] Checkpoint version/integrity/expiry and duplicate/concurrent turn behavior have testable contracts without selecting pending retention or runtime values.

## Feature Readiness

- [x] Tests cover valid/unknown IDs, replay safety, retention, deletion, and fail-closed private-history behavior until the SPEC-001 gate is satisfied.
- [x] Requirements separate transcript content from checkpoints and audit.
- [x] The SPEC explicitly blocks production persistence while its lifecycle policy is open.

## Notes

- The open retention policy is documented as a production gate rather than assigned an invented duration.
- Checked items describe specification completeness and planned coverage; they do not claim implementation or test execution. DEC-005 still blocks production persistence, and DEC-006 blocks sending real transcript content for compaction.
