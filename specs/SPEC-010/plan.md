# Implementation Plan: LangSmith Tracing and Persistent Agent Audit

**SPEC ID**: SPEC-010 | **Version**: 1 | **Manifest hash**: assigned only if a batch is later created  
**Branch**: main preserved; no branch created | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)  
**Status**: Draft — planning proposal; no tracing, persistence, or provider use is enabled.

## Summary

Define server-side observability for the future LangGraph runtime with four separate records: optional external LangSmith spans, a minimized persistent agent audit stream, SPEC-003 conversation history/checkpoints, and the development-only SDD control-plane ledger. LangSmith is a diagnostic sink, not the audit authority. A server-generated correlation context links spans and audit events without treating conversation IDs, owner intent, or client state as identity.

Production trace export and private audit reads remain disabled until DEC-001's access-control gate and DEC-005/DEC-006 data decisions are satisfied. The proposed audit storage is a private Supabase/PostgreSQL product namespace, not the existing sdd schema; schema, roles, retention, and write atomicity remain subject to review. No implementation or live provider/database access is part of this plan.

## Technical Context

**Language/Version**: Existing product is JavaScript ESM, React 19, Vite 8, and Supabase JS 2.118.0. Future API/runtime Node version and deployment are subject to DEC-010.  
**Primary Dependencies**: Existing LangGraph.js/LangChain.js contracts from SPEC-002; no LangSmith package is currently declared or installed. Exact versions await the owning SPEC/implementation review.  
**Storage**: Supabase PostgreSQL is the candidate durable audit store. A new private product namespace/table is proposed; no schema, migration, grants, or retention value is approved here.  
**Testing**: Existing project commands are npm test (node --test), npm run lint (oxlint), and npm run build (Vite). Future audit integration tests must use an isolated local database and synthetic records.  
**Target Platform**: A future server-side agent runtime and API defined by SPEC-001/SPEC-002; React/Vite remains the browser application. Runtime, region, background delivery, and function limits remain DEC-010.  
**Project Type**: Existing web application with a proposed, separately bundled server module; no server/API directory currently exists.  
**Performance Goals**: No numeric latency, throughput, sampling, retry, or retention target is approved. Measurements report observed values only.  
**Constraints**: Redact before both persistence and export; never place provider secrets in VITE_* or browser bundles; no private endpoint before DEC-001; no external processing of real FlowZenit content before DEC-006; no retention period before DEC-005.

## Baseline and Architecture

- The checkout contains no product API/server directory, LangSmith package, execution logger, trace exporter, or product audit store. Current tests cover application timeline behavior and the SDD CLI/control plane; they do not verify agent observability.
- SDD audit events and checkpoints in the sdd schema describe the development runner. They must not be reused for production agent events, chat history, graph checkpoints, or tool execution.
- SPEC-002 owns request/turn/graph execution and ExecutionLedger ports. This SPEC supplies observability adapters and event contracts; it does not create a second action ledger.
- SPEC-003 owns user-visible history and LangGraph checkpoints. They may carry safe correlation references, but they are not audit records and must not be queried as an audit substitute.
- SPEC-005 owns guardrail decisions and classification inputs. This SPEC records the stable decision/category and approved evidence reference; it does not redefine policy or decide what confirms an attack.

### Proposed event flow

1. SPEC-002 creates server-side requestId, turnId, correlationId, graphRunId, and a fresh toolInvocationId before dispatch. Client-provided IDs, if later accepted, are stored separately as untrusted hints.
2. The runtime emits a minimized internal event/span envelope with correlation and parent references. Provider usage is populated only from provider-returned usage; absent values are represented as unavailable.
3. A local redaction/allowlist stage runs before either audit persistence or LangSmith export. If it fails, export is denied and a safe redaction-failure category is emitted without the rejected payload.
4. Critical internal audit events use a durable application-owned repository. LangSmith export is a separate, optional adapter. LangSmith failure is recorded as telemetry degradation and does not change an otherwise authorized graph result or any authorization decision.
5. Private dashboard queries are a SPEC-011 concern and remain closed under DEC-001. This SPEC does not expose audit reads or external trace links.

### Four distinct stores / purposes

| Record | Owner | Purpose | Authority and gate |
| --- | --- | --- | --- |
| LangSmith trace | SPEC-010 adapter | Optional graph/span diagnostics | External processor; production content off until DEC-006. Not audit truth. |
| Persistent agent audit | SPEC-010 contract and repository | Minimal security/action/terminal evidence | Candidate private Supabase product namespace; production writes/reads wait on DEC-001, DEC-005, schema/security review, and audit-failure policy. |
| History/checkpoint | SPEC-003 | Conversation presentation and graph resume state | Separate lifecycle and retention; DEC-005 and DEC-001 apply. Never treat as audit. |
| SDD ledger | SDD supervisor | Development manifests, runs, tasks, gates, pauses, and correction evidence | Existing sdd schema only. Never attach production agent events to it. |

## Proposed Module Organization

These are future destinations, not files created by this planning step.

~~~text
server/agent/observability/
  correlation.js             # server-generated IDs and parent/child linkage
  event-contracts.js          # allowlisted span, audit, health and usage DTOs
  redaction.js                 # deterministic pre-persistence/pre-export policy
  audit-repository.js          # private append/query port adapter; no sdd schema
  audit-writer.js              # deduplication and durability acknowledgement
  langsmith-adapter.js         # optional trace adapter, disabled by default
  trace-policy.js              # versioned destination-specific policy references
  metrics.js                   # bounded counters/timings; no content labels
  usage.js                     # exact provider usage or unavailable state
  provider-health.js           # last-checked component status
  access-gate.js               # SPEC-001 gate adapter; default closed
  safe-errors.js               # provider/database error category mapping
tests/fixtures/observability/  # synthetic IDs, secret sentinels and provider doubles
tests/unit/observability/
tests/contracts/observability/
tests/integration/observability/  # local isolated database only
tests/security/observability/
supabase/migrations/           # possible future product audit schema; only after decisions and approved batch
~~~

No source module under api/, server/, src/, or supabase/ is created in this planning work.

## Integration Contracts

- **SPEC-001 boundary**: all telemetry is server-generated. A client correlation value cannot authorize, identify an owner, select an audit record, or replace the server correlation ID. No private read, provider call with private content, or mutation occurs while the DEC-001 gate is closed.
- **SPEC-002 runtime**: the tracing adapter receives graph callbacks/spans and server correlation context. Define graphRunId as the stable internal execution ID; LangSmith trace/run IDs remain vendor-generated and are linked only through an allowlisted metadata field. Define toolInvocationId before handler invocation; provider tool-call IDs remain separate untrusted references. SPEC-002's ExecutionLedger remains the authority for replay and action outcomes.
- **SPEC-003 memory**: only approved correlation references may cross into history/checkpoint metadata. Transcript, compacted context, checkpoint payload, and audit events have separate stores, readers, serializers, and lifecycle. No graph state snapshot is copied into audit or LangSmith by default.
- **SPEC-005 guardrails**: persist operation/tool version, decision, broad reason category, classification, and safe evidence reference. Do not persist raw prompt, arguments, result, policy expression, or secret. Automated signals stay suspicious unless an approved evidence rule supports confirmed classification.
- **SPEC-011 dashboard**: the dashboard consumes a bounded, redacted read model from SPEC-010 after its access gate; it cannot query sdd.* and cannot infer zero from missing/unavailable metrics.
- **Audit read model**: SPEC-011 uses the bounded query contract in contracts/audit-query.md; correlation IDs and cursors are selectors, never authorization.
- **Supabase**: proposed server-only write adapter targets a new non-exposed product namespace with least-privilege grants and append semantics. The current broad anonymous grants and service_role/Secret key are not authorization. Exact schema, privileges, connection client, and transaction/outbox approach remain pending security review; do not access live Supabase.
- **LangSmith**: use the LangGraph/LangChain callback integration or an adapter around custom nodes, with tracing opt-in and explicitly disabled in production until DEC-006. The installed SDK's masking is defense in depth; local allowlisting/redaction must happen before payload is handed to the SDK.
- **Provider states**: report component, state category, checkedAt, and freshness. A successful health probe is not a promise that a subsequent model, database, or trace request will succeed. Do not expose endpoint URLs, API keys, raw provider response bodies, or credentials.

## Error, Durability, and Logging Policy

- LangSmith outage, timeout, quota rejection, or callback flush failure marks external tracing degraded (and records a safe internal status when available); it must not skip guardrails or change an already authorized domain outcome.
- Internal audit persistence has a separate acknowledgement and failure state. Whether a mutation may start or be reported successful when an audit write is unavailable is an open blocking design decision. Until resolved and tested, production mutations remain disabled; never silently drop a required audit event or describe a non-acknowledged action as audited.
- Audit append must be idempotent by a server-owned source event reference. Duplicate span callbacks may be deduplicated; they must not manufacture duplicate mutation outcomes. SPEC-002's execution ledger remains the side-effect replay authority.
- Internal operational logs contain only correlation/request/run references, component and operation identifiers, broad outcome categories, durations, retry counts, and redaction status. No prompts, transcripts, row contents, tool payloads/results, tokens, cookies, authorization material, SQL, environment values, or raw exceptions.
- Sampling may apply to external diagnostic traces only. It must not sample away critical audit events. Sampling percentage and event-retention values remain unselected.
- Token counts and provider costs are distinct. Record exact token usage only when the provider supplies it; absent or unsupported usage is unavailable. No budget or cost enforcement is inferred.

## Constitution Check

| Principle | Result | Design evidence |
| --- | --- | --- |
| Preserve product behavior | Pass | Additive server adapters; no current UI/domain route changes; LangSmith outage does not alter authorized domain behavior. |
| User-controlled scope | Pass | Draft documentation only; no batch, approval, provider call, migration, or implementation. |
| Security and data protection | Pass with gates | Server-only secrets, allowlisted fields, private namespace proposal, closed DEC-001/005/006 gates, no SDD schema reuse. |
| Tests accompany design | Pass | Synthetic unit/contract/security and isolated database test plan; no test execution in planning. |
| Durable and auditable execution | Pass with open issue | Append/idempotency and distinct audit authority specified; mutation behavior on audit-store failure remains blocking and documented. |
| Bounded correction | Pass | No runner or implementation activity. |
| Small, reviewable changes | Pass | Only SPEC-010 documentation is in scope for this sequence step. |
| Manual publication | Pass | No commit, push, merge, or deploy. |

## Dependencies and Contracts

- **Prerequisite SPECs**: SPEC-001@2 security/API boundary, SPEC-002@1 runtime/ExecutionLedger, SPEC-005@1 guardrail policy.
- **Consumers**: SPEC-011 dashboard reads this SPEC's redacted query contract; SPEC-012 may send UI state/reference fields but does not access audit storage.
- **Decision gates**: DEC-001 blocks private agent/admin endpoints; DEC-005 blocks retention/deletion/export policy; DEC-006 blocks real-data disclosure to LangSmith and other providers; DEC-010 affects async flush/background work; DEC-012 affects numeric event/trace limits.
- **Database changes**: none in this plan. Future audit schema/migration is blocked on retention/access/atomicity review and an exact approved implementation batch.
- **Protected areas**: existing product records and public schema; existing route behavior; SDD tables, migrations, procedures, credentials, and state; browser bundles and public environment variables.

## Execution and Recovery Plan

Implementation, if later authorized, proceeds in this order: define DTOs and server IDs; implement redaction and safe errors; add internal audit repository contract and isolated schema/permissions; integrate append/ack with execution outcomes; add opt-in LangSmith adapter; expose bounded read model to SPEC-011 only after access gate; then run quality gates. LangSmith/export failure never authorizes replay or changes ExecutionLedger state.

Parallel work is suitable only for disjoint redaction tests, event schema tests, and provider adapter tests after shared contracts are fixed. No parallel implementation is authorized now. Recovery records may contain only safe IDs, event category, and state; they may not contain event bodies, credentials, prompts, or checkpoints.

## Quality Gates for Future Implementation

| Gate | Required | Method | Evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | npm run lint | No new violations; server files excluded from Vite client imports. |
| Build | Yes | npm run build | No LangSmith/database/provider secret in browser assets. |
| Unit | Yes | npm test with node:test doubles | IDs/parent links, event schemas, token usage availability, provider state and failure normalization. |
| Contract/integration | Yes | Local isolated Postgres and fake LangGraph/provider adapters | Append idempotency, bounded time query, audit acknowledgement, trace/audit failure independence. |
| Security/privacy | Yes | Synthetic secret sentinels and gate fixtures | Zero sentinel in persistence/export/response; closed access gate gives zero private reads, provider calls and writes. |
| Reliability | Yes | Deterministic dependency outage fixtures | LangSmith outage preserves authorization and domain semantics; audit failure follows only the later approved policy. |

## Decisions and Risks

- **DEC-005 PENDING**: internal audit retention, deletion/export and permitted metadata lifecycle are undecided.
- **DEC-006 PENDING**: LangSmith and all other providers' allowed fields, regional processing, redaction and retention are undecided. Production content export remains off.
- **DEC-001 approved, mechanism pending**: existing passkey is retained but is not server-verifiable; private audit reads and privileged agent operations remain blocked.
- **DEC-010 PENDING**: runtime, region, background callback flush/queue choice, and provider timeouts are not selected.
- **DEC-012 PENDING**: usage limits/abuse policy; no quotas, sampling rates, retry counts, latency SLO, or budget are selected.
- Audit write atomicity with mutations and the required behavior when durable audit storage fails remain an explicit blocker for enabling writes.
- Target references, change summaries, and before/after values may reveal private records; only a field-by-field approved allowlist may be persisted.

## Entry and Completion Criteria

**Entry to a future implementation batch**: exact SPEC version included in an explicitly approved batch; SPEC-001/002/005 contracts compatible; any production audit storage has approved retention/access/field and atomicity policy; DEC-001 access gate is separately satisfied before private endpoints or mutations; DEC-006 is resolved before production trace export; DEC-010/012 values are selected where required.

**Completion evidence**: synthetic correlation and redaction gates pass; audit and tracing remain independent; duplicate events are idempotent; missing provider usage is represented as unavailable; external outage does not alter authorization; no product telemetry uses sdd.*; private reads remain inaccessible unless the approved access gate is verifiably enabled. Draft status is unchanged by this plan.
