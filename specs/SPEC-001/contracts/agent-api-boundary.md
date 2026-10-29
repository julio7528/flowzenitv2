# Proposed agent API integration boundary

**Status:** Draft proposal for SPEC-002 to validate. No route is currently implemented or enabled.

## Ownership

- SPEC-001 defines this cross-cutting boundary, browser/server separation, fail-closed rule, secret policy, and safe error/logging expectations.
- SPEC-002 owns future HTTP handlers, orchestration, runtime, and provider calls.
- SPEC-004 owns typed exact queries.
- SPEC-005/SPEC-006/SPEC-007 own authorization policy, write tools, temporal interpretation, and confirmations as assigned by their approved scopes.
- SPEC-008/SPEC-009 own indexing and retrieval.
- SPEC-010/011 own tracing and dashboard behavior.

## Proposed flow

`React browser client → same-origin HTTPS API → bounded JSON parsing and allowlist validation → DEC-001 access gate → owning typed capability → sanitized response`

The access gate is closed until adequate server-verifiable access control is separately approved, implemented, and verified. The browser passkey, `sessionStorage`, the public Supabase key, and current anonymous grants do not satisfy this gate. A closed gate stops processing before private Supabase access, provider calls carrying private FlowZenit content, or writes.

## Request requirements

- Accept only documented JSON DTOs for named capabilities. Reject unknown operations and fields.
- Do not accept model-generated SQL, table/column names, arbitrary filters, or a client assertion that it is the owner.
- Use same-origin requests in the proposed deployment. Exact paths, methods, payloads, body limits, CSRF policy, and streaming behavior require SPEC-002/SPEC-012 planning and DEC-010 where runtime behavior is involved.
- No session cookie, new session, MFA, signup, owner UUID, or new authentication flow is introduced by this proposal.

## Response requirements

- Return successful empty results distinctly from validation, configuration, dependency, and disabled-capability outcomes.
- Return only fields authorized by the owning typed contract.
- Never return stack traces, SQL, credentials, provider response bodies, or private records when the access gate is closed.
- Candidate error envelope for SPEC-002 review:

```json
{
  "error": { "code": "CAPABILITY_DISABLED", "message": "Capability unavailable" },
  "requestId": "server-generated-id"
}
```

Candidate codes are `INVALID_REQUEST`, `CONFIGURATION_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`, `CAPABILITY_DISABLED`, and `INTERNAL`. This example and the exact HTTP status mapping are not approved public API requirements.

## Supabase and provider boundary

- Preserve the existing browser client for existing product behavior. It is not an agent server identity.
- Do not create a private-data server client until the access-control prerequisite is satisfied and the approved access context is known.
- Never use Supabase Secret/service_role credentials to substitute for owner authentication/authorization; never expose privileged credentials to the browser.
- Keep provider credentials in server-only runtime configuration. Sending private FlowZenit content to any provider also requires DEC-006 and the DEC-001 gate.
- Exact query, retrieval, and write operations delegate to the owning SPECs and use no parallel implementation.

## Traceability and logging

Generate a server request/correlation ID and use it across internal layers. The candidate log allowlist is request ID, operation ID, outcome category, duration, and dependency category. Exclude request/response bodies, prompts, transcripts, task text, row values, cookies, authorization headers, API keys, raw exceptions, and provider payloads. Persistent trace fields, retention, and external processing require DEC-005/006 and SPEC-010; this contract approves no retention policy.

## Test contract

With the access gate unset, disabled, or unverified, a synthetic private-data or privileged-action request returns no private data and causes zero Supabase/provider calls and zero side effects. A browser passkey state must not change this result. Validate malformed DTOs, unsupported fields, empty results, missing configuration, dependency errors, and log/error redaction with synthetic fixtures and doubles. Any future database integration test uses an isolated non-production target.

For the current SPEC-001 scope, the required fail-closed integration/authorization check uses injected fakes and spies and must prove that execution stops before a database or provider call. A direct product-database integration test is NOT APPLICABLE because this SPEC introduces no product query, route, persistence, schema, grant, or RLS behavior. This classification is invalid if database interaction is added to scope. SC-001's positive typed-query equivalence remains conditional and NOT VERIFIED until the separate DEC-001 access-control prerequisite is met; only then may its fixture use an isolated non-production target.

Documentary compatibility is verified by T012 against SPEC-002's runtime/HTTP contract, SPEC-004's typed-read contract, and SPEC-005's guardrail/confirmation contracts. Record source references and PASS/FAIL/NOT VERIFIED in the SPEC-001 checklist. This review does not imply downstream implementation or runtime test results.
