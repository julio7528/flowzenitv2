# Data Model: SPEC-011 Dashboard View

**Status**: UI projection model for Draft review. The page does not own or persist operational records.

## Core records

### DashboardSnapshot

| Field | Rule |
| --- | --- |
| queriedAt | Server timestamp of the response |
| outcome | ok, empty, access_disabled, partial, invalid_request, unavailable |
| sourceStates | Audit, trace, integrations and optional RAG/evaluation source states |
| executions | Bounded ExecutionSummary list from SPEC-010 |
| nextCursor | Opaque pagination cursor; not a credential |
| freshness | Explicit current/delayed/unknown source state |

### ExecutionSummary

Projection of the SPEC-010 trace-summary contract: request/turn/correlation/graph references, start time, duration when known, terminal outcome, retries, provider state, audit/trace counterpart state, and source freshness. Correlation reference is hidden when the access gate is closed.

### ExecutionDetail

Ordered spans and audit summary references for one graph run. Each span displays component, safe outcome, timing, retry count and provider-returned token counts if available. Raw prompt, transcript, retrieved text, tool arguments/results, policy internals and provider error body are excluded.

### ProviderHealthView

Component, safe state, checkedAt, freshness, duration and reason category. It is explicitly a last-known observation, not a guarantee that the next request will work.

### OptionalSourceStatus

| Field | Rule |
| --- | --- |
| sourceKind | rag_index, outbox_sync, retrieval_quality, test_evaluation |
| state | enabled, disabled, not_approved, awaiting_quality_evidence, not_configured, stale, delayed, unavailable, unknown |
| sourceSpec | Owning SPEC identifier (008, 009, or 013) |
| observedAt | Measurement time when supplied |
| version | Index generation, dataset version or contract version where applicable |
| metrics | Allowlisted measured fields only; missing values stay unavailable |

The dashboard does not create an embedding/index/evaluation entity. It displays a source-owned projection.

### GuardrailEventView

Event ID, timestamp, correlation reference, operation/tool category, decision/outcome, optional classification (suspicious_signal, confirmed_attack, or benign_validation_failure), evidence availability, permitted evidence summary, and source freshness. A missing classification is represented as unknown/unavailable state rather than a classification value. Redacted evidence remains marked partial/limited and cannot be promoted by the UI.

## Filter state

Filters include bounded local date/time window, outcome, tool, provider, security classification and correlation search. Values remain page-local by default. The UI uses America/Cuiaba for display; the API contract uses validated instants and keeps the timezone context explicit.

## UI states

loading, ready, empty, partial, access_disabled, invalid_filter, unavailable, and stale. State transitions must not interpret an API failure as empty or zero. On access-disabled or authorization error, clear sensitive detail from the view.

## Relationships and ownership

The dashboard joins execution, trace, audit and health records only by the SPEC-010 correlation contract. Missing counterparts are represented explicitly. It does not join to conversation transcript/checkpoint data, query the SDD ledger, or retrieve private domain record text. Optional source rows remain owned by SPEC-008/009/013.
