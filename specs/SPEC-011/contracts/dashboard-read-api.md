# Contract: Dashboard Read API Adapter — SPEC-011

**Status**: Client-side contract for Draft review. Server endpoint paths and authorization remain owned by SPEC-001/002/010 and are not approved here.

## Operations

~~~text
loadExecutions(ExecutionQuery) -> ExecutionPage
loadExecutionDetail(correlationId, graphRunId) -> ExecutionDetailResult
loadAuditEvent(eventId) -> SafeAuditEventResult
~~~

The structures come from SPEC-010 contracts/trace-summary.md and contracts/audit-query.md. Exact eventId lookup is bounded; the server still applies DEC-001 before repository access. The UI adapter may map fields to view models but must not widen the source allowlist or combine sources into an implied success.

## Request constraints

- Same-origin server API only. No browser-side Supabase, LangSmith, DeepSeek, Gemini, or raw SQL calls.
- Execution filters are bounded and allowlisted. No dynamic table/column/filter expressions are accepted from query parameters.
- Correlation IDs and cursors are values for lookup, not authorization.
- No private ID, page, filter or source detail is written to localStorage/sessionStorage. URL persistence is not proposed.
- Requests must use a no-store policy for private operational responses once access is enabled; exact headers and cache settings are owned by the server/runtime review.

## Response handling

- access_disabled: clear current result/detail and show a generic privacy/access-disabled state with no counts or existence metadata.
- empty: show the active filters and a clear action.
- partial: show sections from healthy sources and label failed/delayed sources with last successful timestamps when provided.
- unavailable: show a source-safe error and retry control; do not render empty/zero.
- invalid_request: map to an inline filter validation message without exposing server internals.
- Unknown or malformed response fields are ignored; unknown required schema version fails closed and requests a safe refresh.

This contract defines client adapter behavior only; it does not add an authentication, endpoint, cache or storage decision.
