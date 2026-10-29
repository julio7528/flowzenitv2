# Contract: Persistent Agent Audit Event — SPEC-010

**Status**: Proposed product contract for Draft review. It does not define the final Supabase schema, permissions, or retention values.

## Append interface

~~~text
AuditWriter.append(event: SanitizedAuditEvent)
  -> acknowledged(eventId, sourceEventRef)
   | duplicate(existingEventRef)
   | rejected(reasonCategory)
   | unavailable
~~~

SanitizedAuditEvent uses the allowlist in data-model.md. It contains no raw prompt, transcript, tool payload/result, SQL, credentials, authorization header, cookie, stack trace, or provider body. sourceEventRef is server-owned and stable for deduplication; it is not a client idempotency value.

## Required behavior

- Validate schema version, enum values, lengths, identifiers and timestamp/duration bounds before append.
- Run application redaction/allowlisting before persistence. On redaction failure, reject the payload and emit a separate safe redaction_failed category without the source content.
- A duplicate callback returns the existing reference and does not create a second completed mutation event.
- Return acknowledged only after the durable store confirms commit. An uncertain commit is unavailable, followed by lookup/reconciliation by sourceEventRef; do not retry as a new event.
- Audit writes are not LangSmith writes and are not conversation/checkpoint writes. The implementation must not read or write the development SDD tables.
- Audit queries are separate read contracts, bounded by time range, page size, and correlation reference, and blocked by DEC-001 until the server access gate is satisfied.
- No raw database or provider errors leave the repository boundary.

## Mutation outcome and unresolved atomicity

The event may include a safe outcome category and optional approved target/change summary. SPEC-002's ExecutionLedger remains the source for side-effect replay outcomes. This contract does not claim that audit append and a domain mutation are atomic. Until the integration design proves durable audit capture or a reviewed recovery path, mutation capabilities stay disabled. The behavior when the audit store is unavailable requires an explicit review decision.

## Event classifications

Use suspicious_signal for an injection/abuse indicator without sufficient corroboration. Use confirmed_attack only when an approved evidence rule is met and evidence can be referenced safely. The model, an automated detector, or absence of evidence cannot independently promote a signal. DEC-012/SPEC-005 policy review owns the evidence threshold.
