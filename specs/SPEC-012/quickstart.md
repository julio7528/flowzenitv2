# SPEC-012 Chat Validation Quickstart

This is an implementation-time validation guide. No chat feature or server API currently exists, and none of the commands below were run during this documentation task.

## Prerequisites

- An approved SPEC/batch and resolved implementation dependencies.
- SPEC-001's server-side access-control gate implemented and verified before enabling private reads or actions.
- DEC-005 approved before real conversation persistence/history is enabled.
- DEC-006 approved before real FlowZenit content is sent to external providers.
- DEC-009 approved before production mutations are enabled.
- DEC-010 runtime/streaming and DEC-012 operating limits resolved by their owners.
- Synthetic fixtures and isolated API/test environment; do not use production transcripts or data.
- Playwright availability reviewed before E2E setup. It is not currently in `package.json`.

## Local static checks

From the repository root, after an authorized implementation:

```powershell
npm run lint
npm run build
npm test
```

Expected evidence: lint/build pass, existing tests remain green, and new pure chat-state/formatting tests pass. Do not infer success without running the commands and recording output.

## Contract and security scenarios

Use an injected synthetic API adapter, not a live provider or real database:

1. Closed-gate: submit attempts and history requests do not disclose private content, counts, or conversation existence; the private repository/provider/tool call count is zero.
2. Read: structured current result renders human-readable source references; exact status/date/time values are not inferred from RAG.
3. Empty/partial/stale: each receives a distinct label and is not shown as a complete successful result.
4. Confirmation fixture: confirm/cancel, changed payload, stale precondition, expiry, replay, and cancellation all produce zero mutation unless a synthetic server fixture returns an acknowledged terminal outcome.
5. Ambiguous response: show pending verification and query the execution ledger contract before offering retry; never show unverified mutation success.
6. History: use synthetic policy data; malformed/unknown IDs and closed gate yield no message content or existence metadata.
7. Time: render confirmation and planning examples with explicit `America/Cuiaba` labels.
8. Provider and RAG: no real provider calls; vector retrieval is marked disabled/unapproved unless quality evidence and product decision are present.

## Browser and accessibility scenarios

After the E2E runner is approved and available, exercise the chat at 1440, 820, and 390 CSS pixels. Verify no horizontal document overflow; keyboard-only send, selection, cancel, and confirmation; focus return after dialogs; screen-reader announcements that do not steal focus; mobile keyboard/composer interaction; and loading, error, reconnect, empty, and access-disabled states.

The eventual E2E command is not fixed here because Playwright is absent and runtime/tooling decisions remain open. Do not install a dependency as part of this Draft planning task.
