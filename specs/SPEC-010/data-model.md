# Data Model: SPEC-010 Agent Observability

**Status**: proposed logical model for Draft review. It is not a migration/schema approval.

## Separation boundaries

| Model | Owner | Not interchangeable with |
| --- | --- | --- |
| Trace span | SPEC-010 / LangSmith adapter | Persistent audit evidence |
| Agent audit event | SPEC-010 product observability | Conversation message, graph checkpoint, or SDD event |
| Correlation context | SPEC-002 runtime, extended here | Principal, owner identity, confirmation grant, or authorization |
| Provider health observation | SPEC-010 | Current service guarantee or capability authorization |
| Redaction result | SPEC-010 | Approval to disclose a field externally |

No entity represents a new domain commitment, user account, organization, or tenant.

## CorrelationContext

| Field | Type / rule | Notes |
| --- | --- | --- |
| requestId | Server-generated opaque ID | One accepted server request. |
| turnId | Server-generated opaque ID | One logical agent turn; SPEC-002 owner. |
| correlationId | Server-generated opaque ID | Joins safe internal events and spans. |
| graphRunId | Server-generated opaque ID | Internal graph execution; distinct from vendor span/run ID. |
| toolInvocationId | Server-generated opaque ID per dispatch | Created before a typed tool handler is called. |
| parentRef | Optional internal event/run reference | Must resolve only inside the approved server-side store. |
| conversationRef | Optional opaque SPEC-003 key | Grouping reference, not authentication or authorization. |
| clientCorrelationHint | Optional, untrusted and separately stored | Never replaces server IDs or controls access. |

## TraceSpan

| Field | Type / rule |
| --- | --- |
| internalSpanRef | Server-generated opaque reference |
| correlationId, graphRunId, parentRef | Required relationships |
| componentKind | Fixed enum: api, graph, node, model, retriever, tool, guardrail, persistence |
| componentName, componentVersion | Registered bounded values; no content-derived names |
| startedAt, endedAt, durationMs | Server timestamps and measured non-negative duration |
| outcome | Fixed safe terminal/in-progress category from SPEC-002 |
| retryCount | Non-negative count; exact operational maximum remains DEC-012 |
| providerName, modelId | Allowlisted identifiers only; no key or endpoint URL |
| tokenUsage | Either exact provider-returned input/output counts with source marker, or unavailable |
| exportState | disabled, pending, sent, skipped_by_policy, failed, redaction_failed |
| langSmithRunRef | Optional vendor-generated reference, never an authorization token |

Raw state, prompts, transcripts, retrieved content, tool args/results, provider headers and raw exceptions are excluded by default.

## AgentAuditEvent

| Field | Type / rule |
| --- | --- |
| eventId | Server-generated stable event ID |
| sourceEventRef | Server-owned event/ledger reference used for idempotency; not the user-provided idempotency key |
| schemaVersion | Versioned contract identifier |
| createdAt | Server timestamp |
| correlationId, requestId, turnId, graphRunId | Safe cross-reference fields when available |
| toolInvocationId | Optional per-tool reference |
| eventKind | execution, guardrail, confirmation, mutation, provider, redaction, persistence |
| operationName, operationVersion | Registered typed operation only |
| initiatorScope | owner_request_intent, agent, system, or unknown; not verified identity |
| principalRef | Null unless a future approved identity control supplies a safe reference; no owner UUID is introduced here |
| decision, outcome, reasonCategory | Allowlisted categories; no raw policy expression or exception |
| classification | benign_validation_failure, suspicious_signal, confirmed_attack, or not_applicable |
| evidenceRef | Optional safe reference to a separately approved evidence source; raw prompt/content excluded |
| targetKind, targetRef | Optional allowlisted typed reference; omitted until approved field policy permits it |
| changeSummary | Optional categorical summary; before/after values or digests require field-policy review |
| durationMs, retryCount | Optional measured values |
| tokenUsage | Exact provider-returned values or unavailable; never estimated |
| redactionPolicyVersion, redactionOutcome | Required before persist/export; redaction failure records only a safe category |
| retentionPolicyVersion | Absent until DEC-005 approves a policy; no TTL/default inferred |

Audit is append-oriented. Storage uniqueness and transaction boundaries are implementation details pending schema/security review. If a durable write is not acknowledged, the event is not reported as persisted. Whether that condition blocks a mutation is an open decision.

## ProviderHealthObservation

Fields: component enum (deepseek, gemini, supabase, langsmith), observed state (healthy, degraded, unavailable, not_configured, unknown), checkedAt, freshness, safe reason category, optional duration. Values are last-known observations only. No credentials, URLs, request payloads, or private content are allowed.

## RedactionResult

Fields: policyVersion, destination (internal_audit, external_trace, operational_log), allowedFieldSetVersion, outcome (accepted, rejected, failed), removedFieldCategories, safe failure category. Never store the rejected raw value or a recoverable copy.

## Relationships and lifecycle

One request may contain one or more graph runs; one graph run may contain ordered child spans and tool invocations; an audit event may refer to the same server correlation but does not depend on a LangSmith run existing. A history/checkpoint record may hold an allowlisted correlation reference but does not own the audit lifecycle. A run may have no audit counterpart for noncritical spans, and an audit event may exist when tracing is disabled or sampled out.

DEC-005 owns audit retention/deletion. DEC-006 owns external fields and processor handling. DEC-001 gates private queries and protected actions. The exact schema/table, partitioning, indexes, field retention, deletion behavior, and transaction coupling are not approved.
