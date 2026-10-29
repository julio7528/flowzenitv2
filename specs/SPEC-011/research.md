# Research: SPEC-011 Administrative Observability Dashboard

**Status**: Draft plan research. Source inspection was read-only. No application test, API, Supabase query, package installation, provider call, or migration was performed.

## Baseline observations

- The product uses React/Vite, React Router, shared PageHeading and FeedbackState components, an internal route shell and responsive CSS.
- The current home page is a domain summary. Observability needs a separate operational route and must not replace or merge with it.
- There is no product API, agent trace/audit table, LangSmith dependency, RAG sync feed, evaluation dashboard feed, chart library, or Playwright command in the current checkout.
- The existing passkey is checked in browser navigation state. It is not a server authorization signal. Current broad anonymous database grants also do not authorize private dashboard data.
- The SDD control plane exists in its own workflow and Supabase sdd schema. Dashboard components must not query or display it.

## Proposed design decisions

### 1. Keep the UI additive and read-only

**Decision proposal**: add a distinct Observabilidade page under the existing internal route shell, with only route/navigation/title additions. Keep current home, task/planning pages and passkey navigation intact.

**Rationale**: fits the established product navigation and visual identity while preserving the home page's domain-specific role.

**Alternatives considered**: replace the home dashboard (rejected because it displaces the existing owner workflow); add a second admin shell (rejected because it duplicates the current UI and could imply a new operator identity).

### 2. Read through the SPEC-010 server contract

**Decision proposal**: the React page uses a small same-origin API client for SPEC-010 bounded queries. No browser-side Supabase table query, provider call or raw trace access is allowed.

**Rationale**: the server owns the DEC-001 gate, bounded query, redaction and trace/audit distinction. The browser's passkey, a correlation ID and a page route are not authorization.

**Alternatives considered**: direct Supabase from the page (rejected because it would bypass the private server boundary); expose raw LangSmith calls in the browser (rejected because it leaks credentials and bypasses field control).

### 3. Treat optional feeds as source-owned status

**Decision proposal**: show RAG/index/outbox and evaluation summaries only from versioned safe contracts supplied by SPEC-008/009/013. Missing, disabled, stale, unrun and unavailable remain different from zero or pass.

**Rationale**: the base dashboard depends on SPEC-010; optional sources may not exist yet. Index existence alone is not evidence of useful vector retrieval.

**Alternatives considered**: assume metrics from absent integrations (rejected); infer RAG production enablement or quality in the UI (rejected); block basic observability until every optional feed exists (rejected).

### 4. Use native accessible components before adding chart libraries

**Decision proposal**: use summary cards, labelled filters, a paginated list/table, an ordered graph timeline and compact health/status rows using existing CSS patterns. Add no chart dependency in this plan.

**Rationale**: current app has no chart package; all requested information can be expressed in responsive semantic structures without a new data-visualization dependency.

**Alternatives considered**: a charting library (not needed for the current requirements and would add an unapproved dependency); wide trace table on mobile (rejected because it causes horizontal overflow).

### 5. Keep sensitive filters transient and local time explicit

**Decision proposal**: keep correlation search and detail selection in page state unless DEC-005/006 approves persistence. Format all displayed instants in America/Cuiaba while sending validated bounded instants through the API contract.

**Rationale**: avoids adding private IDs to browser history/storage and honors approved timezone DEC-003.

**Alternatives considered**: put all filters and correlation IDs in persistent URL/storage (rejected pending field policy); display server-local timezone without naming it (rejected due ambiguity).

## Cross-SPEC mapping

- SPEC-010 supplies bounded execution and audit queries, trace summaries and provider health. LangSmith is a link/reference source, not the authoritative audit.
- SPEC-001/002 own server routing and the fail-closed access gate. SPEC-011 must not choose an authentication method.
- SPEC-005 supplies security event categories; suspicious and confirmed stay distinct.
- SPEC-008/009 own index/retrieval synchronization data; this page only displays its reported state.
- SPEC-013 owns test/evaluation evidence and dataset versions; the dashboard does not run evaluations.
- DEC-008 limits intended audience to the single owner. The UI does not add staff, organization, tenant, account, or role concepts.

## Open implementation decisions and risks

| Item | Status | Consequence |
| --- | --- | --- |
| DEC-001 server-verifiable access control | Mechanism not decided | No private execution/audit endpoint can serve data. |
| DEC-005 retention/deletion/export | Pending | Sensitive field availability and persistence/link behavior remain constrained. |
| DEC-006 provider data and region | Pending | No raw details or LangSmith deep link; continue redacted summaries only after access gate. |
| DEC-010 runtime/API/cache behavior | Pending | Endpoint path, cache headers, function timeout and polling strategy are not selected. |
| DEC-012 operational limits | Pending | Numeric query/page/time bounds, health-check frequency and polling cadence are not selected. |
| Playwright | Not in current package manifest | E2E execution cannot be claimed until an approved runner exists. |
| RAG and evaluation feed contracts | Optional prerequisites | UI must show unavailable/not configured when SPEC-008/009/013 sources are absent. |

No proposed layout, route, API client, or data visualization becomes an approved production decision by this research.
