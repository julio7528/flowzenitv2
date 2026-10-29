# Contract: Redacted Execution and Trace Summary — SPEC-010

**Status**: Draft read-model proposal for SPEC-011. It does not authorize a private endpoint or approve LangSmith links.

## Query

~~~text
ExecutionQuery = {
  fromInclusive,
  toExclusive,
  cursor?,
  pageSize?,
  correlationId?,
  outcome?,
  toolName?,
  provider?,
  classification?
}
~~~

Requests are time-bounded and server-validated. Page size, date-window maximums and numeric request limits come from approved configuration; DEC-012 remains pending. correlationId and cursor are selectors, not credentials.

## Summary and detail

~~~text
ExecutionSummary = {
  requestId,
  turnId?,
  correlationId,
  graphRunId,
  startedAt,
  durationMs?,
  outcome,
  retryCount?,
  providers: ProviderHealth[],
  auditCounterpart: "present" | "missing" | "unknown",
  traceCounterpart: "present" | "missing" | "sampled_or_disabled" | "unknown",
  sourceFreshness: "current" | "delayed" | "unknown"
}
ExecutionDetail = ExecutionSummary & {
  spans: [{
    sequence,
    parentRef?,
    componentKind,
    componentName,
    componentVersion?,
    startedAt?,
    durationMs?,
    outcome,
    retryCount?,
    tokenUsage?,
    safeErrorCategory?
  }],
  auditEvents: SanitizedAuditEventSummary[],
  langSmithRunRef?
}
~~~

- Spans are ordered by server sequence/time. Tool input and output values, prompts, transcript, retrieved content, provider bodies and stack traces are excluded.
- Missing audit/trace counterparts are explicit and distinct from empty result sets. Disabled, sampled, delayed and unavailable data must not appear as zero executions or successful health.
- Event classifications preserve suspicious_signal and confirmed_attack as different values. A redacted/partial event shows the evidence limit rather than promoting its class.
- Token counts are shown only when the provider returned them; otherwise they are unavailable.
- A LangSmith reference is an opaque vendor identifier, not authorization. A clickable external link is withheld until DEC-006 approves region/endpoint and the UI can construct it from a trusted allowlist.

## Response envelope

~~~text
ExecutionPage = {
  executions: ExecutionSummary[],
  nextCursor?,
  sourceStates: { audit, trace, providers, rag?, evaluations? },
  queriedAt,
  outcome: "ok" | "empty" | "access_disabled" | "partial" | "invalid_request" | "unavailable"
}
~~~

The DEC-001 access gate runs before any private query; a closed gate returns no execution metadata and makes zero repository or provider calls. RAG/index and evaluation source states are optional. Their absence means not configured/unknown, not healthy or zero.

## Error semantics

- A successful query with no matching rows is empty.
- A partial source outage is partial with the failed source and its last successful timestamp when known.
- Both sources unavailable is unavailable, not empty.
- Invalid filters and cursors return a stable safe error with no event details.
- This is an internal read-model proposal; it does not select an HTTP path, UI route, endpoint authorization mechanism, or provider retention policy.
