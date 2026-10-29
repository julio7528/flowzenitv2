# Chat UI State Machine: SPEC-012

**Status**: Draft presentation contract. It does not replace SPEC-002 graph/ledger state or authorize capabilities.

## States

```text
idle
submitting
receiving
awaiting_confirmation
reconciling
completed
needs_clarification
denied
refused
failed
timed_out
cancelled
access_disabled
```

## Transitions

| Current | Event | Next | Required behavior |
| --- | --- | --- | --- |
| `idle` / terminal | Submit accepted locally | `submitting` | Disable duplicate submit; preserve a stable client request reference in page memory only. |
| `submitting` | Server acknowledges turn start | `receiving` | Store server turn/correlation IDs; announce processing through a polite status region. |
| `submitting` / `receiving` | Confirmation proposal returned | `awaiting_confirmation` | Render sanitized proposal; confirm/cancel follows DEC-009 and SPEC-005 only. |
| `receiving` | Terminal successful read result | `completed` | Render answer with evidence/freshness labels; structured facts remain attributable to SPEC-004. |
| `receiving` | Clarification result | `needs_clarification` | Keep unresolved text visible; do not select a date or time silently. |
| any request state | Access gate closed | `access_disabled` | Clear private view state; no existence or count details. |
| in-flight / unknown network outcome | Response lost or interrupted | `reconciling` | Query server/ledger status; no optimistic mutation success and no blind duplicate action. |
| `reconciling` | Durable outcome found | `completed` / `failed` / `cancelled` | Render only the server-confirmed terminal outcome. |
| active request | Timeout/cancel/failure | terminal or `reconciling` | Use stable category, keep correlation support ref, avoid implying mutation did not commit unless ledger proves it. |

## Invariants

1. Only server terminal outcomes can mark a turn complete.
2. A client confirmation click is not an authorization grant.
3. The server revalidates canonical payload and preconditions immediately before a protected action.
4. When DEC-009 is unresolved, no real action is executable, regardless of the rendered control.
5. Browser back/navigation may abandon the view but cannot cancel or roll back a server action by assumption.
6. Accessible status announcements must not steal focus. When a dialog closes, focus returns to its invoking control where possible.
7. A second submit is blocked while the first turn is pending; ambiguous mutation outcomes are reconciled before any retry.

