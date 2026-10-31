# Data model: FlowZenit Agent Chat

## Existing app and API contract

`src/App.jsx` provides the authenticated internal shell and React Router. The chat belongs at `/interno/chat`, with its navigation item inside `InternalLayout`; current pages remain in place. Page-specific UI lives in `src/pages/ChatPage.jsx` and `ChatPage.css`.

The client calls only the same-origin `POST /api/agent/turn` endpoint with JSON. The route accepts:

```text
ChatRequest = {
  message: non-empty string,
  activeChatMessages?: Array<{ role: "user" | "assistant", content: non-empty string }> // max 8 prior messages
}
```

The serialized request body must be no larger than 8,192 UTF-8 bytes. The browser omits `conversationId`, does not call Supabase or the model, and does not store chat messages in browser storage, a URL, analytics, or a database.

The successful response envelope from `api/agent/turn.js` is:

```text
ChatResponse = {
  turnId: UUID,
  conversationId: string | null,
  graphVersion: "agent-turn-v1",
  outcome: "completed" | "needs-clarification" | "denied" | "refused" | "timed-out" | "cancelled" | "failed",
  correlationId: UUID,
  answer: {
    text: string,
    evidence: unknown[],
    inference: unknown[],
    missingEvidence: unknown[],
    uncompletedActions: unknown[]
  }
}
```

Public HTTP errors use a safe `{ error: { code, message } }` envelope. The UI validates the envelope and renders only allowlisted fields as text; it never displays raw exceptions, provider payloads, or HTML. Search evidence can contain `{ sourceType, sourceId, displayText, parentChain, citationRef }`; citations are rendered as text, not interpreted as URLs. The server composes the confirmed-create message only from its committed write outcome and exact read-back.

| Entity | Fields/meaning | Lifetime |
| --- | --- | --- |
| ChatMessage | Role, text, response outcome, and safe evidence references | React memory for the active page/session only. |
| ActiveChatContext | At most 8 prior user/assistant messages; current message sent separately | Validated as untrusted input by SPEC-002; not persisted. |
| ChatRequest | Current message and bounded active context; request may receive an AbortSignal | Same-origin POST `/api/agent/turn`; body ≤ 8,192 UTF-8 bytes. |
| ChatResponse | API envelope, validated answer, evidence, terminal outcome | Render allowlisted text and citation references only. |
| POC disclosure | Public endpoint, existing anon Supabase permissions, and configured-model data flow | Visible next to the composer. |

Do not store chat data in localStorage/sessionStorage, URL parameters, analytics, or Supabase history tables.
