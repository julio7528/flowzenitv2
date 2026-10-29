# Chat Client Adapter Contract: SPEC-012

**Status**: Draft proposal for the React client. Server endpoint paths and authorization are owned by SPEC-001/002/003 and are not defined or approved here.

## Operations

```text
submitTurn({ conversationId?, message, clientRequestRef? }) -> TurnResult
loadHistory({ conversationId, cursor?, pageSize? }) -> HistoryPage
listConversations({ cursor?, pageSize? }) -> ConversationPage
cancelTurn({ turnId, correlationId }) -> CancelResult
lookupTurn({ turnId, correlationId }) -> TurnStatusResult
confirmAction({ proposalRef, confirmationRef }) -> TurnResult
cancelAction({ proposalRef }) -> ActionOutcome
```

These names describe client intents only. Implement only operations exposed by the owning server contracts. `conversationId`, `proposalRef`, `turnId`, `correlationId`, cursors, and request references are not credentials or access scopes.

## Turn request

The adapter maps to SPEC-002's candidate `POST /api/agent/turn` request. It must not add `ownerId`, role, passkey result, browser session assertion, provider/model selection, tool name, SQL, table/column names, or raw authorization material.

```json
{
  "conversationId": "opaque-grouping-value-or-null",
  "message": "user text"
}
```

The client does not choose message/body limits. It must surface the server's stable validation outcome. The server generates canonical request, turn, and correlation IDs.

## Turn result projection

The adapter consumes SPEC-002's candidate outcomes: `completed`, `needs-clarification`, `denied`, `refused`, `timed-out`, `cancelled`, or `failed`. It maps them to typed UI states and allowlisted answer blocks. API status codes, endpoint route, streaming event schema, and numeric limits remain owned by SPEC-002/DEC-010/DEC-012.

The normalized UI result may include:

```text
TurnResult = {
  schemaVersion,
  turnId,
  conversationId?,
  correlationId,
  outcome,
  answerBlocks[],
  sourceReferences[],
  actionProposal?,
  capabilityState,
  freshness
}
```

The adapter does not pass through raw LangGraph state, prompts, hidden reasoning, provider responses/errors, credentials, SQL, raw tool arguments/results, or private content when a gate is closed. Unknown required versions fail closed.

## Closed-gate behavior

- The access decision is made by server-owned controls before any private repository, history store, provider, trace, or tool call.
- `access_disabled` must clear current private content, messages, counts, and source details. The UI may show only generic capability-disabled guidance without confirming whether a conversation or record exists.
- With DEC-001 unmet, the adapter must not issue real private read/history/confirmation requests. Synthetic local fixtures may be used only in tests/storybook-like harnesses and are not production data.
- Provider unavailability and authorization denial are not represented as an empty conversation or empty search result.

## History

History operations consume SPEC-003's bounded pagination contract and are enabled only after DEC-001 and DEC-005 allow the operation. Conversation IDs and cursors do not authorize access. Messages are rendered in stable order; checkpoint payloads and graph state are never requested by the UI.

## Streaming and cancellation

Buffered terminal results are the baseline. Streaming is an optional capability only after a runtime/transport is selected by DEC-010 and an event contract is approved by SPEC-002. If enabled, the client accepts only allowlisted answer/progress/terminal events. It never renders raw model/provider events or unvalidated tool proposals. Cancel is best-effort and does not prove a pending mutation did not commit; ambiguous outcomes require safe server lookup before retry.

## Error mapping

| Server outcome | Client behavior |
| --- | --- |
| `access_disabled` / `CAPABILITY_DISABLED` | Clear protected view state; show generic disabled message. |
| `needs-clarification` | Preserve draft; show bounded clarification prompt; do not invent date/time. |
| `denied` / `refused` | Show safe reason category; no action is executed. |
| `timed-out` | Show timeout and only offer retry if lookup proves retry is safe. |
| `failed` / dependency unavailable | Show stable error and correlation reference; do not show empty-success state. |
| `cancelled` | Show cancellation; mutation state is still reconciled if server reports it may have started. |
| pending/unknown network result | Show pending verification; do not report mutation success or failure until reconciled. |

