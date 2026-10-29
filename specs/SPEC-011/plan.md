# Implementation Plan: FlowZenit Agent Observability Dashboard

**SPEC ID**: SPEC-011 | **Version**: 1 | **Manifest hash**: assigned only if a batch is later created  
**Branch**: main preserved; no branch created | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)  
**Status**: Draft — dashboard design only; no UI, API, or data source is enabled.

## Summary

Add a read-only operational page to the existing React/Vite FlowZenit shell. It consumes bounded redacted execution/audit summaries and provider health from SPEC-010 through a same-origin server API port. It does not query Supabase directly, operate the development SDD supervisor, modify domain data, or enable tracing/RAG.

The intended viewer remains the single application owner under DEC-008. The existing passkey/sessionStorage path is navigation state only, not server-verifiable authorization. Until the SPEC-001 DEC-001 access-control gate is approved, implemented, and verified, private dashboard data endpoints return no private metadata and the page presents an access-disabled state.

## Technical Context and Observed Baseline

**Language/Version**: JavaScript ESM, React 19, Vite 8, React Router 8.5.0 per the current package manifest.  
**Primary Dependencies**: Existing shared React components, router and CSS only. No chart, analytics, or Playwright package is declared.  
**Storage/API**: Browser must call a same-origin API adapter owned by SPEC-010/002; do not use the existing browser Supabase client for agent trace/audit data.  
**Testing**: Existing npm test (node --test), npm run lint (oxlint), npm run build (Vite). Browser E2E is required by the SPEC, but Playwright is not currently declared; the implementation runner/dependency must be reviewed before that gate is run.  
**Target Platform**: Existing FlowZenit internal web layout on desktop, tablet and mobile.  
**Project Type**: Additive read-only page in the existing single-page application.  
**Performance Goals**: No numeric dashboard load/SLO or polling interval is approved. Queries remain bounded by SPEC-010/DEC-012.  
**Constraints**: preserve existing routes and access behavior; no new users, roles, organizations, tenants, authentication, SDD operations, private browser Supabase queries, provider secrets, or raw prompt/transcript display.

Observed in the checkout:

- src/App.jsx contains the current RequireAccess wrapper, internal navigation, skip link, route outlet, mobile menu and existing FlowZenit route tree.
- src/pages/InicioPage.jsx and InicioPage.css implement the domain/home dashboard. SPEC-011 is an operational agent view and should be a distinct page rather than replacing the home dashboard.
- Existing shared PageHeading and FeedbackState components provide page title, loading/error semantics. Internal CSS uses a white workspace, restrained dark-green text, green active-navigation/accent, subtle borders and compact responsive spacing.
- No product observability endpoint, trace data, audit repository, provider-health source, RAG sync status, or evaluation metrics are currently implemented.
- No chart library or browser E2E runner is declared. Use native lists, tables, CSS summaries and an ordered trace timeline; do not add a chart dependency in this planning work.

## Proposed Architecture

### Read-only flow

1. The future route at /interno/observabilidade renders inside the existing internal shell and uses the existing navigation/passkey flow only for UI consistency.
2. A page adapter calls a same-origin typed observability API owned by SPEC-010. It sends bounded filter fields only; no direct database query, SQL, provider call, secret, arbitrary field, or raw detail request originates in the browser.
3. The server checks DEC-001 before reading audit/trace data. If closed, it returns only a stable access_disabled outcome with no counts, run IDs, source existence, or private details. The UI renders an accessible generic unavailable state.
4. After the gate is satisfied, the page renders bounded summaries and details from SPEC-010 contracts, preserving freshness and partial source failures.
5. Optional RAG/index/outbox and evaluation sources are consumed only through contracts owned by SPEC-008/009/013. Their absence, disabled state, stale state, or unrun status is explicit; the dashboard does not enable vector RAG or declare a quality pass.

The exact API path, cache headers and endpoint authorization context remain owned by SPEC-001/002/010 and the access-control decision. This plan does not create an API contract that bypasses those owners.

### Page sections

- **Overview**: bounded run totals and outcome counts only when the source is available; distinguish zero from unknown/unavailable.
- **Executions**: time range, outcome, tool, provider, classification and correlation search; cursor pagination. Keep filters in page memory by default; do not persist private IDs in localStorage or browser history without field-policy review.
- **Execution detail**: ordered graph-node/transitions timeline, tool name/version and safe outcome, latency/retries, normalized error category, audit/trace counterpart state, and safe correlation references. Each permitted audit event reference opens a bounded same-origin event detail by exact event reference; the ID is a selector, not authorization.
- **Integrations**: DeepSeek, Gemini, Supabase and LangSmith last-checked health observations with freshness. Do not expose keys, endpoint URLs or raw responses; health is not a capability guarantee.
- **Guardrails**: suspicious and confirmed classifications remain visibly and semantically distinct; details show permitted evidence and redaction limits.
- **RAG/index and evaluations**: optional panels appear only when owning sources return versioned safe summaries. An index may exist while vector retrieval remains not approved or awaiting quality evidence. The dashboard cannot label vector retrieval production-enabled before SPEC-009 measurement and the required product decision; absent metrics are not zero/pass.

### Proposed module layout

Future paths only; no product source is created by this plan.

~~~text
src/pages/ObservabilidadePage.jsx
src/pages/ObservabilidadePage.css
src/lib/observabilityApi.js
src/lib/observabilityViewModel.js
src/components/observability/
  ExecutionFilters.jsx
  ExecutionList.jsx
  ExecutionDetail.jsx
  IntegrationHealth.jsx
  GuardrailEvents.jsx
  OptionalSourceStatus.jsx
tests/fixtures/observability-dashboard/
tests/unit/observability-dashboard/
tests/contracts/observability-dashboard/
tests/integration/observability-dashboard/
tests/e2e/observability-dashboard/     # runner availability remains open
~~~

The only App.jsx changes contemplated later are an additive route, navigation entry and document title. Existing pages/routes and passkey behavior remain unchanged. The dashboard must not link to SDD operations or expose batch/run approval controls.

## Data and Display Rules

- Use SPEC-010 contracts/audit-query.md, trace-summary.md and provider-health.md. Correlation IDs are query selectors only, never credentials.
- Show unavailable/unknown separately from numeric zero. Show source freshness and queriedAt on every detail/feed where present.
- Open a stable audit-event detail through the exact-event query in SPEC-010; the event reference is never an access token.
- Keep audit and trace counterparts independent; a missing counterpart is shown explicitly and never hidden as a complete execution.
- Exact statuses, times, dates, and operational classifications come from source contracts, not LLM or vector ranking.
- Format displayed instants in IANA timezone America/Cuiaba. Keep source timestamps as instants; conversion is presentational and must preserve time-zone context.
- Suspicious and confirmed events use text labels/icon/structure in addition to color. Do not infer confirmed attack from a severity score or missing/redacted evidence.
- All text/error display uses allowlisted, redacted fields. No raw prompt, transcript, tool arguments/results, SQL, credentials, provider bodies, or stack traces.
- External LangSmith deep links are withheld unless DEC-006 approves a region and the link is constructed from a trusted endpoint allowlist. A vendor run ID alone is not access authorization.
- Do not show SDD supervisor manifests, approvals, correction windows, persisted runner tasks, or control-plane events.

## Constitution Check

| Principle | Result | Evidence |
| --- | --- | --- |
| Preserve product behavior | Pass | Additive route under the existing shell; home dashboard and product routes stay intact. |
| User-controlled scope | Pass | Draft planning only; no implementation, batch, approval or publish action. |
| Security and data protection | Pass with gate | Private read API is fail-closed under DEC-001; field redaction and DEC-005/006 remain required; no browser Supabase query. |
| Tests accompany design | Pass | Synthetic API/view-model, access gate, secret sentinel, keyboard, viewport and optional-source tests are planned. |
| Durable and auditable execution | Pass | This UI reads SPEC-010 only; it does not mutate records or reuse sdd.*. |
| Bounded correction | Pass | No SDD runner activity. |
| Small, reviewable changes | Pass | Additive page and client boundary; no design-system or routing rewrite. |
| Manual publication | Pass | No commit, push, merge, or deployment. |

## Dependencies and Contracts

- **Required dependency**: SPEC-010@1 for execution/audit/trace summaries, provider health, classifications and read query envelopes.
- **Boundary dependencies**: SPEC-001/002 own server API and access gate; this UI does not select their endpoint path or authentication control.
- **Optional data sources**: SPEC-008/009 provide index/retrieval freshness if approved and implemented; SPEC-013 may provide test/evaluation summaries. Their absence does not block the base dashboard.
- **Decision gates**: DEC-001 blocks private content; DEC-005/006 govern retention and visibility/provider fields; DEC-008 limits audience to one application owner and excludes new identity/role models; DEC-010/012 affect runtime, polling/query bounds and health checks.
- **Database changes**: none. The browser never reads an audit/trace/product telemetry table.
- **Protected areas**: src/pages/InicioPage.jsx and home layout; current navigation/passkey behavior; domain CRUD; SDD supervisor and sdd schema; provider configuration/secrets.

## Failure, Loading, and Recovery

- Loading uses the existing accessible status pattern. Network/API failure shows source-specific safe errors and last-known timestamp only when returned by the server.
- Partial results keep successful sections visible and label unavailable sources; never convert a failed source to an empty list or zero.
- Empty results explain active filters and provide a clear-filter action without revealing inaccessible record existence.
- Access-disabled response shows no private count, correlation ID, provider config, or existence detail. The page must not retry in a tight loop.
- A stale list can remain visible only if the response itself marks it stale and the future cache policy is approved. Otherwise clear sensitive rows when access is lost or a request is rejected.
- Detail selection is local page state. A correlation ID in a URL or persistent browser store is not proposed unless DEC-005/006 field policy explicitly allows it.

## Quality Gates for Future Implementation

| Gate | Method | Evidence |
| --- | --- | --- |
| Unit | npm test with deterministic API client doubles | Filter validation, labels, state mapping, freshness, timezone formatting, and no-zero substitution. |
| Contract/security | Synthetic SPEC-010 contract fixtures | Closed gate returns no data; bounded pagination; redaction; missing counterparts; no auth claims from passkey or correlation ID. |
| UI/E2E | Playwright if an approved runner is available | 1440/820/390 viewports, filter/detail navigation, loading/empty/error/partial states, keyboard and mobile menu. |
| Accessibility | Keyboard-only and manual/automated audit | Headings, labels, live status updates, focus, non-color classification, contrast and responsive reflow. |
| Build/lint | npm run lint and npm run build | No existing behavior regression or server-only data/secret in browser assets. |
| Optional sources | Synthetic RAG/evaluation fixtures | Disabled/stale/missing/unrun is not shown as healthy, zero, or pass. |

No tests are executed as part of this planning work. Playwright availability is not assumed.

## Decisions and Risks

- DEC-001 is an approved requirement but no server-verifiable access mechanism is approved. Dashboard endpoints stay closed until the separate access-control gate is met.
- DEC-005/006 continue to restrict field visibility, retention and provider handling. The dashboard defaults to redacted metadata.
- DEC-008 approves the single-owner audience and existing access path; it does not make the passkey verifiable to the server.
- DEC-010/012 leave runtime, region, polling intervals, page/query bounds and health-probe rate without numeric decisions.
- No chart or E2E package exists in the current manifest. The base view can use accessible native components; an E2E runner choice is an implementation dependency, not a planning approval.
- SPEC-008/009 RAG and SPEC-013 evaluation feeds are not implementation prerequisites and may be absent. RAG is not represented as production-enabled or useful without the owning evidence.

## Entry and Completion Criteria

**Entry to future implementation**: SPEC-010 read contracts are stable; SPEC-011 is included in an exact approved SDD batch; API gate is satisfied before private data; DEC-005/006 field visibility is reviewed; E2E runner availability is confirmed before claiming that gate passed.

**Completion evidence**: bounded filters and detail views work on synthetic fixtures; closed access gate yields no private metadata; source failures/freshness are honest; responsive/keyboard criteria pass; SDD controls/domain writes are absent; no secret or raw content is rendered. Draft status remains unchanged.
