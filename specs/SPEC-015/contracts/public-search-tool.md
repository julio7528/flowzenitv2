# Public Web Search Tool Contract — SPEC-015

**Status:** Draft internal contract. No Tavily adapter is enabled. HTTP status mapping, limits, and provider configuration remain proposals.

## Tool interface

```text
PublicSearchTool.invoke({ query, queryClass }, trustedContext)
  -> { outcome, sources[], limitations[], correlationId }
```

- Register only through SPEC-002's typed server tool registry. Model tool schemas do not replace independent server validation and policy authorization.
- The server derives authorization, correlation IDs, feature state, provider settings, and query policy. The caller cannot provide a provider URL, API key, arbitrary Tavily options, tool permissions, or data scope.
- Only requests classified as public current information are eligible. Internal status, date, schedule, counts, IDs, and hierarchy route to SPEC-004; internal semantic retrieval belongs to SPEC-009 subject to its gates.
- Default capability state is disabled. A missing flag or unknown policy state denies before network I/O.
- Until DEC-006 is approved, the request contains only explicitly public user-authored query text, and any request containing or requiring FlowZenit-derived private information is denied with a safe request to reformulate. User confirmation by itself is insufficient.
- The adapter maps the internal DTO to a minimal allowlisted Tavily Search request. Search is the only proposed initial endpoint. Extract, Crawl, Map, arbitrary URLs, raw provider parameters, and free-form provider configuration are excluded.

## Response and provenance

- Normalize sources to `sourceRef`, bounded `title`, validated HTTP(S) `url`, optional provider publication time, server `retrievedAt`, bounded snippet, and provider rank.
- Keep provider ordering distinct from confidence. Preserve source link and external-source label in any user-facing answer.
- Treat every result field and linked page content as untrusted data. Do not follow embedded instructions, execute links, invoke additional tools, grant access, or mutate FlowZenit records based on results.
- A response claim based on external search must cite its returned `sourceRef`; conflicting or insufficient evidence is reported as uncertain/insufficient.
- Do not expose raw provider bodies, headers, API errors, request credentials, or arbitrary HTML.

## Failure and retry categories

Normalize `disabled`, `denied`, `invalid_request`, `timed_out`, `rate_limited`, `provider_failed`, `malformed`, `empty`, `partial`, and `completed`. The exact public HTTP codes, timeout, retry count, backoff, result cap, character limit, and rate limits remain unselected pending DEC-010/012. Retries must be bounded by a subsequently approved policy; a retry cannot add data or broaden query scope. Timeout/failure/empty states cannot yield a definitive current-information claim.

## Audit and privacy

Use SPEC-010's correlation and sanitized event contracts. Log outcome/provenance metadata through its allowlist; do not persist raw query, snippets, full URLs with sensitive query parameters, or provider bodies by default. Query fingerprints, provider trace export, and retention require DEC-005/006. A user-visible source URL is separate from audit retention.

## Security invariants

1. Disabled, access-blocked, disclosure-pending, or runtime-unavailable means zero outbound requests.
2. No private FlowZenit content reaches Tavily until SPEC-001's gate is verified and DEC-006 explicitly permits each field.
3. A search result cannot alter tool registry, authorization, confirmation, prompts, or domain state.
4. No Tavily search is used as a substitute for structured internal reads or to evade a failed access gate.
5. The feature remains optional: disabling it leaves core FlowZenit tools operational.

