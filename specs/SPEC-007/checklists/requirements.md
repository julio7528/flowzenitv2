# Specification Quality Checklist: Temporal Interpretation and Recurrence Management

**Purpose**: Reviewer checklist for date interpretation, recurrence boundaries, and safe scheduling.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] Scope distinguishes template-level recurrence from occurrence-level exceptions.
- [x] Relative time behavior includes reference instant and timezone context.
- [x] Ambiguity is visible to the user before writes.
- [x] Mandatory template sections are complete.
- [x] Existing recurrence schema is documented without a pause/resume field or occurrence identity.
- [x] Overlaps are informational and do not silently move or reject existing schedule records.
- [x] A null `hora_fim` is preserved rather than converted to the UI's display fallback.

## Requirement Completeness

- [x] DEC-003 fixes America/Cuiaba and the spec distinguishes civil fields from absolute instants.
- [ ] DEC-013 bare-weekday and “próxima semana” semantics remain pending and cannot silently select query dates/ranges or consequential write dates before approval.
- [ ] DEC-004 exception policy remains open and blocks occurrence-level actions.
- [x] Date boundaries, invalid intervals, and recurrence validation are testable.
- [x] Success criteria are measurable.

## Feature Readiness

- [x] Tests include fixed-clock Portuguese expressions and week/year boundaries.
- [x] Series edits cannot be mistaken for one-occurrence changes.
- [x] Mutations use the shared authorization and confirmation contract.
- [x] Real private reads and writes remain gated by SPEC-001; confirmation is not owner authentication.
- [x] Confirmation cards that display times label America/Cuiaba explicitly.
- [x] Series projections have no persistent occurrence ID; series edits cannot imply an exception to one occurrence.
- [x] Weekday and “próxima semana” ambiguity is blocked for queries and writes until DEC-013 is resolved.
- [x] Template deletion and active-state toggles are not exposed as new agent operations.

## Notes

- Tests must use the IANA rules for America/Cuiaba and preserve existing database date/time values without UTC shifts.
- DEC-004, DEC-009, DEC-010 and DEC-013 remain pending; proposals in contracts do not approve them or enable protected capabilities.
