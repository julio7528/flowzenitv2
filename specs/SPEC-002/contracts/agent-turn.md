# Proposed HTTP turn contract — SPEC-002

**Status:** Internal design proposal for Draft review. The path, HTTP status mapping, body limits, and response format are not approved public API contracts. The route must not be enabled before DEC-001 and applicable data-disclosure gates are satisfied.

## Request

Candidate operation: `POST /api/agent/turn`, same-origin HTTPS.

```json
{
  "conversationId": "opaque-correlation-value-or-null",
  "message": "user text"
}
```

- Accept JSON only; reject unknown fields, oversized bodies, invalid encoding, and invalid/missing message values. Exact byte/code-point limits remain an open configuration decision.
- `conversationId` is an opaque conversation grouping value, not a principal, owner identifier, credential, access token, or authority. The server must never trust it for authorization.
- Do not accept an owner ID, role, passkey result, session assertion, model-selected tool name outside a registered proposal, SQL, table/column names, or query fragments.
- Generate `requestId`, `turnId`, and `correlationId` on the server. A caller-supplied correlation value, if later permitted, must be stored separately and must not replace server identifiers.
- Reject unsupported method/content type. Exact CSRF and origin controls require review in the HTTP/API implementation and chat integration.

## Response

Candidate successful synchronous JSON response:

```json
{
  "turnId": "server-generated-id",
  "conversationId": "opaque-correlation-value-or-null",
  "graphVersion": "versioned-graph-id",
  "outcome": "completed",
  "answer": {
    "text": "response text",
    "evidence": [],
    "inference": [],
    "missingEvidence": [],
    "uncompletedActions": []
  },
  "correlationId": "server-generated-id"
}
```

`outcome` is exactly one of `completed`, `needs-clarification`, `denied`, `refused`, `timed-out`, `cancelled`, or `failed`. The response must not contain raw LangGraph state, prompts, hidden reasoning, provider bodies, credentials, SQL, stack traces, or private data when a required gate is closed.

Candidate error envelope:

```json
{
  "error": { "code": "CAPABILITY_DISABLED", "message": "Capability unavailable" },
  "correlationId": "server-generated-id"
}
```

Candidate error codes are `INVALID_REQUEST`, `CONFIGURATION_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`, `CAPABILITY_DISABLED`, `PROVIDER_TIMEOUT`, `BUDGET_EXHAUSTED`, and `INTERNAL`. Exact codes/status mapping remain proposed; stable public messages must not expose raw causes.

## Streaming

The initial graph invocation is synchronous per the SPEC assumption. Whether the HTTP response is buffered JSON or token/event streaming is unresolved. Streaming is not implemented or selected by this contract. If later approved, emit only allowlisted text/progress and terminal events; never stream unvalidated tool proposals, private context, reasoning fields, or raw provider events. Streaming must preserve cancellation, final outcome semantics, and server-side tool validation.
