# Chat View Model: SPEC-012

**Status**: Presentation model proposal. This is not a persistence schema, API approval, or new domain entity.

## Boundaries

- Durable conversations, messages, checkpoints, execution ledgers, audit events, and domain records remain owned by SPEC-003, SPEC-002, SPEC-010, and SPEC-004/006/007 respectively.
- The browser view model exists only in memory for the active page/turn. No transcript or private message is written to localStorage, sessionStorage, URL, or the SDD control plane.
- `conversationId`, `turnId`, `correlationId`, source references, action references, and trace references are selectors/labels. None is identity, authorization, or a secret.
- All records shown below are projections from allowlisted server responses or synthetic fixtures.

## Entities

### ConversationView

| Field | Type | Rule |
| --- | --- | --- |
| `conversationId` | opaque string or `null` | Grouping only; never an authorization token. May be absent for a new transient conversation. |
| `title` | bounded display string or `null` | Derived only from an approved server summary; no client-side transcript persistence. |
| `updatedAt` | ISO instant or `null` | Rendered in `America/Cuiaba`; absence remains unavailable. |
| `historyState` | `not_loaded \| loading \| ready \| empty \| access_disabled \| unavailable` | `access_disabled` clears message content and existence/count metadata. |
| `nextCursor` | opaque cursor or `null` | SPEC-003 pagination selector only; not authorization. |

### MessageView

| Field | Type | Rule |
| --- | --- | --- |
| `messageId` | opaque string | UI key only; not a durable capability. |
| `turnId` | opaque string or `null` | Server correlation value. |
| `role` | `user \| assistant \| tool_summary \| system_status` | Raw provider/tool messages are not displayed. |
| `content` | allowlisted display blocks | Never contains hidden reasoning, raw tool args/results, prompt, provider body, or credentials. |
| `createdAt` | ISO instant or `null` | Render local time with explicit `America/Cuiaba` label where a time is shown. |
| `state` | `pending \| complete \| failed \| cancelled \| pending_verification` | A pending/uncertain action is never labelled completed. |
| `sources` | `SourceReference[]` | Evidence selectors from SPEC-004/009; not authorization. |
| `evidenceKind` | `structured \| semantic \| inference \| incomplete \| unavailable` | The UI distinguishes evidence from inference and gaps. |

### SourceReference

| Field | Type | Rule |
| --- | --- | --- |
| `sourceKind` | `demand \| task \| subtask \| routine \| external` | No independent appointment/commitment type is added. |
| `recordRef` | opaque reference | Display only if server has authorized it; do not expose as sole human label. |
| `label` | bounded text | Server-provided sanitized title/type; no raw SQL or arbitrary markup. |
| `relationLabel` | bounded text or `null` | Optional hierarchy context supplied by structured tool. |
| `observedAt` | ISO instant or `null` | Enables stale/fresh context without claiming unsupported certainty. |
| `freshness` | `current \| stale \| unknown` | Unknown/stale evidence is not phrased as a complete current answer. |

### TurnViewState

| Field | Type | Rule |
| --- | --- | --- |
| `phase` | `idle \| submitting \| receiving \| awaiting_confirmation \| reconciling \| completed \| failed \| timed_out \| cancelled \| access_disabled` | Legal transitions are defined in `contracts/chat-state-machine.md`. |
| `turnId`, `correlationId` | opaque string or `null` | Created by the server; safe to show only as bounded support references. |
| `transport` | `buffered \| streaming \| unknown` | Streaming appears only if the approved runtime advertises it. |
| `message` | bounded user-facing text | Stable safe text; no raw exception/provider body. |
| `retryAvailable` | boolean | True only when server contract says retry/reconciliation is safe. |

### ActionProposalView

Defined in [contracts/action-proposal-view.md](contracts/action-proposal-view.md). It projects one canonical action without containing a usable grant or authorization credential.

## Validation rules

- Reject unknown required schema versions and malformed required fields; ignore unknown optional fields.
- Do not coerce `access_disabled`, `unavailable`, `stale`, or `partial` into an empty successful result.
- Clear private view state on access-disabled responses and on conversation switch before loading the next page.
- Never synthesize missing times, exact statuses, source references, confirmations, expiries, token counts, or successful outcomes.
- Every local time shown for FlowZenit planning is formatted with `America/Cuiaba`.
- Exact transactional facts come from SPEC-004. Semantic results are visibly identified and remain subject to SPEC-009's production quality gate.

## State transitions

```text
idle -> submitting -> receiving -> completed
                  -> awaiting_confirmation -> submitting -> receiving -> completed
                  -> reconciling -> completed | failed | timed_out
                  -> failed | timed_out | cancelled | access_disabled
```

The client cannot transition to `completed` for a mutation based on its own click, local timer, streamed text, or lost network connection. Completion requires an acknowledged terminal result from the server/ExecutionLedger.
