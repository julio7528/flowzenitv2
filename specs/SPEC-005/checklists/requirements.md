# Specification Quality Checklist: Agent Guardrails and Action Authorization

**Purpose**: Reviewer checklist for security boundaries, approvals, and adversarial test coverage.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] Threats include direct and indirect prompt injection.
- [x] Authorization is tied to each side effect.
- [x] Confirmation is bound to the exact action and payload.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [ ] DEC-009 confirmation matrix is resolved before high-impact actions are enabled.
- [x] Deny-by-default, redaction, classification, and invalidation behavior are testable.
- [x] Success criteria include no-side-effect assertions.
- [x] Error and abuse cases are identified.

## Feature Readiness

- [x] Adversarial tests cover untrusted user, record, and web content.
- [x] Confirmation replay and payload change are covered.
- [x] Scope explicitly blocks operations without approved policy.
- [x] Action authorization and confirmation do not prove owner identity; protected capabilities remain gated by SPEC-001.
- [x] DEC-001 access control, policy authorization, action confirmation, and idempotency are separate checks in the proposed execution path.
- [x] Prompt-injection detection is defense in depth; an automated signal cannot grant permission or confirm an attack.
- [x] Confirmation lifecycle is a technical proposal with a synthetic test matrix; no operation-to-confirmation mapping is approved.

## Notes

- A model classifier is not a security boundary; the server policy check remains authoritative.
- DEC-009's confirmation matrix remains pending; the one-time expiring grant is a Draft technical proposal, not an approved mechanism.
- Existing client `window.confirm`/`ConfirmDialog` behavior is not a server-side grant or proof of authorization.
- Real mutations stay disabled until DEC-001 and the relevant DEC-009 policy entry, durable idempotency, and owning SPEC gates are satisfied.
