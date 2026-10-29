# Research: SPEC-010 LangSmith Tracing and Persistent Agent Audit

**Status**: research for a Draft plan. No package was installed, provider called, database accessed, or runtime selected.

## Decisions and rationale

### 1. Keep tracing, durable audit, memory, and SDD control-plane state separate

**Proposed design**: LangSmith is an optional external diagnostic sink; a product-owned audit repository stores minimized operational/security events; SPEC-003 owns conversation history and graph checkpoints; the existing sdd schema stays dedicated to development workflow state.

**Rationale**: the stores have different completeness, readers, retention, and recovery requirements. LangSmith may be disabled, sampled, or unavailable. A checkpoint is execution state, not evidence that a security decision or mutation completed. SDD rows refer to SPEC manifests and runner operations, not production turns.

**Alternatives considered**: treating LangSmith as the audit source (rejected because it is external/optional); copying graph state into audit (rejected because it exposes prompts/tool data and duplicates SPEC-003); reusing sdd.audit_events/sdd.checkpoints (rejected because it mixes development control-plane and product data).

### 2. Generate identifiers at the server boundary and keep external identifiers separate

**Proposed design**: generate requestId, turnId, correlationId, graphRunId, and toolInvocationId on the server. Pass correlationId/graphRunId through internal node and event metadata. Keep LangSmith run/span IDs and model-provider tool-call IDs as separate references. A caller-provided value remains an untrusted client hint.

**Rationale**: SPEC-002 already proposes requestId, turnId and correlationId; SPEC-010 needs graph/tool-level linkage. Server generation prevents client values from becoming an authorization or audit identity.

**Alternatives considered**: use a conversation ID as the trace ID (rejected: it is a grouping key, not a principal or execution ID); reuse provider/LangSmith run IDs as the internal key (rejected: provider-controlled, optional, and not the durable audit authority).

### 3. Redact before both destinations, with LangSmith masking only as defense in depth

**Proposed design**: construct a narrow telemetry DTO from allowlisted fields, redact it locally, then send only the sanitized DTO to the audit store or LangSmith. Do not hand raw graph state to an SDK and rely on SDK masking to make it safe. A redaction exception blocks external export and emits only a safe failure category.

**Rationale**: LangSmith documents input/output hiding, metadata transformation, anonymizers, and conditional tracing. These are useful additional controls but do not replace this application's field allowlist or server access gate.

**Alternatives considered**: regex-only secret scrubbing (rejected as insufficient for arbitrary private text); hiding only model input (rejected because outputs and nested tool data may also expose it); exporting raw traces and masking later (rejected because data has already left the server).

### 4. Separate trace failure from audit-store failure

**Proposed design**: external trace export is best-effort telemetry; an outage marks tracing degraded and must not alter authorization or an otherwise authorized operation. Durable audit failure has its own acknowledgement and recovery path. Mutation behavior during an audit-store failure is not selected and remains a blocker for production writes.

**Rationale**: SPEC-002's durable ExecutionLedger prevents unsafe side-effect replay but does not define transaction atomicity between a mutation and the audit event. Silently continuing could violate the requirement for durable audit; blocking every operation could change behavior. This trade-off needs an explicit decision and integration proof.

**Alternatives considered**: assume audit writes never fail (rejected); equate trace success with audit success (rejected); reuse the action ledger as the audit store (rejected because its scope and read model differ).

### 5. Represent exact metrics and unknown health honestly

**Proposed design**: record measured durations and retry counts; record token usage only from provider-returned usage metadata, otherwise unavailable; store last checked time and freshness with provider health. Missing data never becomes numeric zero or a claim of current availability.

**Rationale**: providers may omit usage, and a health check only proves the observation at its timestamp. No token budget or latency SLO is approved.

**Alternatives considered**: estimate token usage as exact (rejected); infer provider health from a prior successful request without timestamp (rejected); include unbounded labels such as prompts in metrics (rejected).

## Official technical references reviewed

- LangSmith supports LangGraph tracing in JS and callback/custom instrumentation. In serverless environments, its JS guide recommends waiting for callback work to finish before the function exits; this must be validated against the DEC-010 runtime rather than copied as a runtime decision: [Trace LangGraph agents](https://docs.langchain.com/langsmith/trace-with-langgraph), [Trace LangChain agents](https://docs.langchain.com/langsmith/trace-with-langchain).
- LangSmith documents hiding inputs/outputs, transforming metadata, anonymizers, and conditional tracing. Local allowlisting/redaction remains required before export: [Prevent logging of sensitive data in traces](https://docs.langchain.com/langsmith/mask-inputs-outputs).
- LangGraph documentation distinguishes thread-scoped checkpointer state from cross-thread store data, supporting the SPEC-003 separation from audit: [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence).
- Vercel documents Node.js function streaming/runtime and function logs, but this research does not select Vercel Functions, background callback strategy, region, or retention: [Vercel Functions runtimes](https://vercel.com/docs/functions/runtimes), [Vercel Function logs](https://vercel.com/docs/functions/logs).

## Decisions that remain open

| Open item | Decision owner/status | What remains blocked |
| --- | --- | --- |
| Audit/history retention, deletion and export | DEC-005 PENDING | Production retention, expiry, purge, and export lifecycle. |
| Provider fields, region, redaction and retention | DEC-006 PENDING | Real-content export to LangSmith and other external providers. |
| Server-verifiable access control | DEC-001 approved requirement; mechanism not decided | Private audit/trace reads and privileged agent operations. |
| Runtime, region, async flush/queue | DEC-010 PENDING | Production API/export delivery shape and numeric timeouts. |
| Abuse limits and quotas | DEC-012 PENDING | Numeric request/trace/retry/token/cost limits. |
| Audit vs mutation atomicity and audit-store failure behavior | No decision recorded | Any production mutation whose audit must be durable. |
| Attack confirmation evidence rule | SPEC-005/DEC-012 review pending | Labeling an event confirmed; signals remain suspicious absent approved evidence. |

These items remain pending; this research does not convert the proposed architecture into an approved decision.
