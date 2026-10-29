# Research: Optional Tavily External Search

**Status:** Draft planning research, 2026-10-28. No provider is configured or called.

## Findings and proposed design

| Topic | Finding / proposal | Alternatives and open decision |
| --- | --- | --- |
| Tavily API surface | The official Search endpoint accepts a server-side authenticated request and offers more options than the agent needs. Expose one narrow internal `searchPublicWeb` tool and map only allowlisted fields to the provider request. Do not expose arbitrary URLs, provider parameters, raw bodies, Extract/Crawl/Map endpoints, or model-selected API settings. | Search endpoint only is the proposed first scope; the exact request/result limits and timeout wait on DEC-012 and operational review. |
| Search selection | Route current public-web questions to Tavily only when enabled and authorized. Exact status, date, time, count, hierarchy, and schedule questions use SPEC-004; semantic internal context uses SPEC-009 only after its gates. | A classifier may suggest routing, but server policy makes the decision. Current product data is never substituted with web search. |
| Outbound data | Treat the query as a disclosure. Until DEC-006 approves exact fields and provider processing, send no FlowZenit-derived content, conversation history, identifiers, demand/task names, schedule details, or provider credentials. If user text contains or depends on private details, deny and request a public reformulation; a confirmation prompt alone cannot override pending DEC-006. | A future field-level disclosure policy may be reviewed, but is not chosen here. |
| Result trust | Treat snippets, titles, URLs, and page text as untrusted input. Preserve source provenance; validate bounded fields and safe URL schemes for rendering. Retrieved instructions cannot change policy, tools, data access, or domain state. | Source reputation is not a trust grant. No automated action follows from a result. |
| Failure policy | Normalize disabled, policy-denied, invalid, timeout, provider-rate-limit/error, malformed, empty, partial, and completed states. A failure or insufficient evidence cannot support a definitive current-web answer. | Retry count/backoff, timeout, and usage controls remain open under DEC-012 and DEC-010. Honor usable provider retry hints only within a later approved local bound; do not invent one now. |
| Audit and tracing | Reuse SPEC-010's server correlation, sanitized event allowlist, audit writer, and optional trace exporter. Prefer query class and a one-way query fingerprint over raw query text pending DEC-005/006. | Whether even a query fingerprint may be retained, for how long, and whether Tavily metadata may be exported await DEC-005/006. No separate audit store is proposed. |
| Runtime | Implement the provider adapter behind the SPEC-002 server tool/runtime ports. Keep its feature flag false by default and make it unavailable when runtime, secret handling, or policy gates are not verified. | Vercel Functions, region, background work, and request lifecycle remain subject to DEC-010. |
| Testing | Use deterministic provider doubles and synthetic public queries. Assert outbound request allowlists, zero private sentinels, disabled-by-default, injection resistance, stable failure states, and source references. | No real Tavily call or real FlowZenit record is part of routine tests. Optional live smoke would need separate approval and synthetic-only inputs. |

## Official documentation reviewed

- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search): request fields, authentication, and response shape. API options should be reduced to the internal allowlist.
- [Tavily rate limits](https://docs.tavily.com/documentation/rate-limits): provider limits and throttling can vary; no provider quota is hard-coded here.
- [Tavily API credits](https://docs.tavily.com/documentation/api-credits): usage is plan/endpoint dependent; this plan does not select a financial budget.

These sources inform a proposal only. They do not approve disclosure, provider use, quotas, retention, or activation.

## Pending decisions and blocking effects

- **DEC-001:** private FlowZenit endpoints and tool results remain inaccessible until an adequate server access control is approved, implemented, and verified. The current passkey is not server-verifiable.
- **DEC-005:** retention/deletion of search audit and trace metadata is unresolved.
- **DEC-006:** exact outbound fields, provider handling, location, retention, redaction, and opt-out are unresolved; blocks all production provider calls and any FlowZenit-derived query content.
- **DEC-010:** server runtime, region, duration, and possible async execution are unresolved.
- **DEC-012:** operational bounds, rate/retry/abuse controls are unresolved; no cost budget is inferred.

