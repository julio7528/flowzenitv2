# Implementation Plan: Optional Tavily External Search

**SPEC ID**: `SPEC-015` | **Version**: `1` | **Manifest hash**: N/A (no batch created)

**Branch**: `main` preserved | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Status**: Draft planning proposal. This plan does not install Tavily, configure credentials, call the provider, or authorize outbound data.

## Summary

Add an optional, server-only public-web search capability through the existing SPEC-002 tool/runtime boundary. It remains disabled by default, cannot replace structured FlowZenit reads or internal RAG, and cannot receive FlowZenit-derived private data while DEC-006 is pending. Provider output is untrusted, source-linked evidence; errors and insufficient sources produce explicit limitations. Correlation and audit reuse SPEC-010 contracts. No independent Tavily audit store or domain mutation path is introduced.

## Technical Context

**Language/Version**: Existing JavaScript ES modules; no new package selected.

**Primary Dependencies**: SPEC-002 tool registry/runtime ports, SPEC-005 policy and untrusted-content boundary, SPEC-010 correlation/audit contracts. Official Tavily Search API only as a future adapter. No SDK choice is made.

**Storage**: No Tavily-specific database schema. Persistent operational events, if enabled, belong to SPEC-010 and await DEC-005/006. Search results are turn-scoped by default.

**Testing**: Node built-in test runner and SPEC-013 synthetic fixtures/doubles. Routine tests never call Tavily or use real FlowZenit rows. Playwright applies only when integrated into SPEC-012 and after test tooling approval.

**Target Platform**: Server-side runtime selected under DEC-010. No browser call, Vercel Function, region, queue, or background-worker choice is approved.

**Project Type**: Optional server tool adapter for the existing React/Vite application and planned agent runtime.

**Performance Goals**: Query/result bounds, timeout, retry count, rate controls, and latency targets remain unresolved under DEC-010/012.

**Constraints**: Capability off by default; no private outbound fields pending DEC-006; access gate from DEC-001 cannot be bypassed; no SQL or writes; no arbitrary endpoint/provider parameters; all external text is untrusted; no cost budget is invented.

**Scale/Scope**: A single-owner application; this SPEC introduces no users, organizations, tenants, or multi-tenant model. Search is non-core and can be independently disabled.

## Constitution Check

| Gate | Result | Evidence / constraint |
| --- | --- | --- |
| Preserve existing product behavior | PASS | Existing React/Vite/Supabase/Vercel architecture is unchanged; core internal tools do not depend on Tavily. |
| User-controlled scope | PASS | No batch, provider configuration, call, release, or architecture decision is made. |
| Security and data protection | PASS WITH BLOCKERS | DEC-001 blocks private tools until server access control is verified; DEC-006 blocks production provider disclosure; secrets remain server-only. |
| Tests accompany design | PASS | Synthetic contract, privacy, injection, error, provenance, and routing tests are specified; none are run in this documentation task. |
| Durable and auditable execution | PASS WITH BLOCKERS | Reuses SPEC-010; durable audit retention and mutation atomicity remain separate open decisions. Search itself has no mutation. |
| Bounded correction | N/A | Applies to future approved SDD implementation batches. |
| Small, reviewable changes | PASS | One optional adapter and narrow DTOs; no schema, provider package, or domain writes. |
| Manual publication | PASS | No commit, push, merge, or deployment is performed or automated by this plan. |

## Dependencies and Contracts

- **Prerequisite SPECs**: SPEC-002 (registered server tool/runtime), SPEC-005 (policy, authorization and untrusted content), SPEC-010 (correlation and sanitized audit), as declared in the roadmap. SPEC-001's DEC-001 access gate remains a direct capability prerequisite for any private context. SPEC-013 provides synthetic test guards/evidence.
- **API/data contracts**: `contracts/public-search-tool.md` defines the tool DTO and failure categories; `contracts/disclosure-and-provenance.md` defines data-flow gates; `data-model.md` defines transient records. SPEC-002 owns the public agent turn and tool validation; SPEC-005 owns policy decisions; SPEC-010 owns operational audit/tracing.
- **Security boundary**: Browser may submit a user question only through the approved server boundary. The model may propose a registered tool but cannot set provider URL, credentials, access scope, arbitrary options, or outbound fields. Until DEC-006, no FlowZenit-derived content is sent. User consent does not supersede DEC-006. Search result content is always untrusted.
- **Database changes**: None. The audit event, if persisted, is passed through SPEC-010's contract; no new Tavily table/store or migration is proposed.
- **Out-of-scope files/systems**: No package manifests/lockfiles, app source, API/runtime config, Vercel settings, Supabase schema/data, provider secret, production setting, or deployment artifact is changed by this plan.

## Architecture Proposal

1. **Routing**: classify intent before tool execution. Current public facts may use search if enabled. Exact status, IDs, counts, dates/times, planning, hierarchy, and recurrence use SPEC-004. Semantic internal questions use SPEC-009 only after its own access/disclosure gates. If the owning internal capability is blocked, web search cannot be used as a bypass.
2. **Tool registry**: expose one server-side `PublicSearchTool` through SPEC-002's versioned registry. The model sees only a narrow schema (public query and query class). Server independently validates input and invokes SPEC-005 policy immediately before dispatch.
3. **Preflight and disclosure**: default the feature flag to false. Deny when flag, runtime, access gate, or policy state is missing/unknown. Classify the query and its origin. Until DEC-006 is approved, allow only public user-authored query text that does not contain or depend on private FlowZenit facts. If the query includes internal names/details or ambiguous private context, do not silently redact; deny and ask for a public reformulation.
4. **Provider adapter**: map the internal DTO to an allowlisted Tavily Search request on the server. Do not expose Tavily's full API, arbitrary URLs, Extract/Crawl/Map, model-selected parameters, or raw request/response objects. The provider key is server-only. Exact provider model, endpoint configuration, limits and timeout are left for implementation review and DEC-010/012.
5. **Normalization**: validate response shape and bounded fields; keep title, HTTP(S) source URL, optional provider publication time, retrieval time, snippet and rank. Reject or mark malformed fields; provider rank is not confidence. Return a stable outcome (`completed`, `empty`, `denied`, `disabled`, `timed_out`, `rate_limited`, `provider_failed`, `malformed`, or `partial`).
6. **Grounded response**: pass results to the graph as untrusted external evidence. Each externally sourced claim must reference a returned `sourceRef`, be labeled as external, and report conflict/uncertainty. A timeout, empty result or insufficient evidence cannot produce a definitive current-web claim. Results cannot trigger writes or expand tools.
7. **Audit and trace**: reuse SPEC-010 server-generated correlation, event allowlist, redaction, and optional exporter. Prefer query class and source count; do not persist raw query/snippet/provider body by default. Query fingerprints, external tracing, event retention and export await DEC-005/006. Tracing is not an authorization or audit source of truth.
8. **Failure containment**: provider outage must not block core product reads or writes that are otherwise authorized. Retry policy is bounded only after DEC-012; no retry may broaden data or query scope. Honor provider throttling signals only within a reviewed local bound. Failures are sanitized and exposed as limitations.
9. **Access and activation**: DEC-001's server control is a hard gate for private data and private tool context; DEC-006 is a hard gate for provider disclosure; DEC-010/012 gate runtime and operational bounds. Until then, synthetic tests can prove disabled/deny behavior, but production Tavily use remains off.

## Execution and Recovery Plan

- **Sequential phases**: (1) capability/policy contract; (2) routing and privacy preflight; (3) adapter request/response validation; (4) source rendering and grounding; (5) audit integration and failure evaluation.
- **Parallel tasks**: synthetic response normalization tests and disclosure sentinel tests may be independent if file ownership is disjoint. Provider adapter, policy integration and audit wiring are sequential. No parallel execution with live provider or production data.
- **Agent assignments**: None for this documentation task. Any future SDD parallel assignment requires exact batch authorization, disjoint paths, and governance evidence.
- **Failure fingerprints**: correlation ID, registered tool/version, policy version, outcome category and provider category. Never fingerprint raw private content in logs. Stable test fixture IDs identify synthetic failures.
- **Checkpoint/recovery data**: Search is one turn-scoped call and does not require durable checkpoint state. The graph may preserve only safe outcome/provenance references. Conversation/checkpoint persistence follows SPEC-003 and DEC-005; audit replay is SPEC-010-owned.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Existing project lint command in the future approved implementation batch | Actual exit code; no credential or browser import path. |
| Build/type check | Yes | Existing project build; scan output for server-key sentinel | Actual build evidence and zero server secret in browser assets. |
| Unit/integration | Yes | Deterministic provider double and registered tool tests | Disabled, allowed public success, privacy deny, malformed, empty, timeout, throttle, provider failure. |
| Database/RLS/contracts | N/A for search adapter | Contract test against SPEC-002/005/010 ports; no DB required for search | No new DB access path or private data route. |
| E2E/accessibility/security/evaluation | Required when integrated | Synthetic prompt-injection and outbound payload tests; SPEC-012 UI source labeling | Zero private sentinels outbound; zero unsupported claims; stable external provenance and failure states. |
| Evidence | Yes | SPEC-013 safe `EvidenceRecord` | Fixture version/digest, policy version, invocation count and result; no raw prompts, provider bodies, secrets, or private data. |

No lint, build, tests, provider call, or database operation was executed for this plan.

## Decisions and Risks

- **DEC-001 APPROVED**: the current passkey is not server-verifiable. Private tool context remains blocked until adequate server access control is approved, implemented, and verified.
- **DEC-005 PENDING**: retention/deletion for audit/search provenance and any query fingerprint.
- **DEC-006 PENDING**: fields sent to Tavily, provider processing, redaction, region, retention and opt-out. Blocks all production Tavily calls until resolved; no user confirmation can replace it.
- **DEC-010 PENDING**: server runtime, region, duration, and async/background behavior.
- **DEC-012 PENDING**: timeout, retries, rate/abuse bounds and operational usage controls; no monetary budget is set.
- **DEC-011**: provider/model decisions elsewhere remain separate. This SPEC does not select a Tavily plan/model or imply approval to call DeepSeek/Gemini.
- **Grounding**: SPEC-009 evaluation determines private RAG behavior; external source attribution here is not equivalent to its quality threshold. No numeric external search quality threshold is set.
- **Outbound text risk**: even user-authored text may include private data. Query classification is defense in depth; pending DEC-006 means a strict public-only boundary and rephrasing path are required.
- **Audit atomicity**: Tavily is read-only, but SPEC-010's durable audit outage behavior and mutation/audit atomicity remain open for other tools; this plan does not resolve them.

## Project Structure

### Documentation (this feature)

```text
specs/SPEC-015/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── public-search-tool.md
│   └── disclosure-and-provenance.md
└── tasks.md
```

### Proposed future files (not created by this plan)

```text
src/agent/tools/publicSearchTool.js
src/agent/providers/tavilySearchAdapter.js
src/agent/policies/externalDisclosurePolicy.js
src/agent/schemas/publicSearch.js
tests/unit/publicSearchTool.test.js
tests/security/tavilyDisclosureBoundary.test.js
tests/evaluation/tavilyGrounding.test.js
```

**Structure Decision**: Keep tool orchestration, provider transport, disclosure policy, and validation separate under the existing server-side agent boundary. Paths are proposals; no source files are created and runtime/API layout remains subject to SPEC-001/002 and DEC-010.

## Complexity Tracking

No constitution exception is proposed. A narrow adapter is necessary to keep external disclosure explicit, auditable, optional, and unable to bypass the internal data-access or tool-policy gates.
