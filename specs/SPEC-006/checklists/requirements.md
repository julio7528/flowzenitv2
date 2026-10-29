# Specification Quality Checklist: Write Tools for Demands and Planning

**Purpose**: Reviewer checklist for safe mutation contracts and preservation of current domain rules.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] Mutation scope separates creation, editing, scheduling, and status changes.
- [x] Hierarchy and schedule rules are concrete and match observed behavior.
- [x] Schedule date/time values preserve the approved America/Cuiaba civil-time contract without UTC shifts.
- [x] Destructive deletion is excluded pending explicit policy.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [x] Idempotency, stale-state conflicts, and database rejection behavior are defined.
- [x] Task rescheduling consequences require exact confirmation.
- [x] Existing trigger effects for both task creation under a scheduled demand and task week moves are represented in the preview/outcome contract.
- [x] The DEC-009 matrix is provided as a proposal only and does not grant permission or enable operations.
- [x] Transaction, ledger, stale-state, replay, and read-back requirements are explicit; the concrete adapter remains a technical proposal.
- [x] Success criteria are measurable.
- [x] Dependencies and transaction boundaries are explicit.
- [x] Real writes are gated by adequate access control; action confirmation is not owner authentication.
- [x] Confirmation cards that show a time label it as America/Cuiaba.

## Feature Readiness

- [x] Tests include positive, negative, replay, and rollback cases.
- [x] Parent status is read back as derived, never directly written by the agent.
- [x] Unauthorized and incomplete actions cannot be reported as successful.

## Notes

- Confirmation policy for high-impact operations remains linked to DEC-009; write capabilities cannot bypass SPEC-005.
- No RPC, grant, schema change, or database credential choice is approved here. DEC-001 keeps every real private read/write disabled.
- DEC-001 is approved as retaining the current passkey without new authentication; any separate control needed to satisfy the server-side access gate remains unselected and blocks private reads and writes.
