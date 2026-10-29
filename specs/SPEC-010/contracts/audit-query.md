# Contract: Bounded Audit Query — SPEC-010

**Status**: Draft proposal for SPEC-011. Private reads remain disabled until DEC-001 is satisfied and DEC-005 permits the fields/lifecycle.

## Request

~~~text
AuditQuery = {
  eventId?,
  correlationId?,
  fromInclusive,
  toExclusive,
  cursor?,
  pageSize?,
  eventKinds?,
  outcome?,
  classification?
}
~~~

- The server validates timestamp ordering, supported enum values, cursor integrity/shape, and approved maximum page size. Numeric limits/defaults remain configuration inputs; DEC-012 and implementation review own their values.
- An exact eventId lookup is permitted as a bounded primary-key lookup. Otherwise the request must include a bounded time window, optionally narrowed by correlation ID. Unbounded scans are rejected.
- Correlation ID and cursor are selectors, not credentials or access scopes.
- The DEC-001 access gate runs before the repository. Closed/unverified gate returns a stable access-disabled category and makes zero private repository calls.

## Response

~~~text
AuditPage = {
  events: SanitizedAuditEventSummary[],
  nextCursor?,
  sourceFreshness: "current" | "delayed" | "unknown",
  outcome: "ok" | "empty" | "access_disabled" | "invalid_request" | "unavailable"
}
~~~

Only fields in the approved audit view allowlist are returned. The response does not contain raw prompts, transcripts, tool arguments/results, SQL, secrets, provider bodies, full stack traces, or inaccessible-record existence details. Missing trace counterparts and missing audit counterparts remain distinct.

## Ordering and errors

Results are ordered by server-created timestamp then event ID for stable pagination. Invalid or foreign-looking cursors produce a stable validation result with no event data. Repository errors are normalized to a safe category and do not become empty results.

This contract is a proposal for a future read model, not an endpoint path, API response approval, or authorization policy.
