# Action Proposal View Contract: SPEC-012

**Status**: Draft UI projection. The proposal is not a grant, risk policy, or authorization decision.

## View model

```text
ActionProposalView = {
  proposalRef,
  operationLabel,
  target: { kind, recordRef?, displayName, hierarchyContext? },
  proposedChanges: [{ fieldLabel, before?, after? }],
  consequences: [{ kind, description }],
  schedule?: { civilDate?, localStart?, localEnd?, timeZone: "America/Cuiaba" },
  confirmationState: "not_required" | "required" | "unresolved" | "expired" | "stale" | "denied",
  expiresAt?,
  payloadFingerprintLabel?,
  safeStatusMessage
}
```

Only allowlisted display values from the server are rendered. Do not expose a canonical payload hash as a reusable token, confirmation grant, arbitrary IDs as the sole target label, raw tool payloads, or internal policy details. Any displayed schedule time must include `America/Cuiaba`.

## Interaction

- Show confirm only if server policy explicitly returns an actionable proposal and DEC-009-approved policy permits it. While DEC-009 remains pending, production mutation controls remain disabled/absent and the server denies writes.
- Cancel/reject causes no mutation and records only a safe terminal outcome if the owning API does so.
- Changed or stale payload/preconditions, expired/consumed grant, replay, missing policy, or unresolved ledger state cannot be confirmed by the client; show a refreshed/denied state and ask the server for a safe next step.
- The underlying server must apply SPEC-005 confirmation lifecycle, SPEC-006/007 domain validation, and SPEC-002 durable idempotency/ExecutionLedger rules.

## Synthetic validation cases

Use non-production fixtures for allowed-without-confirmation, confirmation-required, denied, unresolved policy, changed payload, changed precondition, expired proposal, cancellation, duplicate confirmation, concurrent replay, and uncertain network completion. Synthetic cases demonstrate UI behavior only; they do not approve DEC-009.
