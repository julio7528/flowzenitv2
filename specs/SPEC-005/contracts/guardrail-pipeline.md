# Contrato proposto do guardrail e PDP — SPEC-005

**Estado:** proposta interna para revisão Draft. A matriz DEC-009 e o mecanismo de confirmação não estão aprovados.

## Pipeline de confiança

```text
bounded request DTO
  -> label/retain source provenance for untrusted segments
  -> prompt assembly with policy instructions separate from data
  -> normalize model result
  -> parse exact named tool call and validate schema
  -> check DEC-001 access capability
  -> policy decision: capability + target + domain preconditions + DEC-009 matrix
  -> request/consume an action-bound grant when the approved matrix requires it
  -> reserve idempotency key
  -> revalidate current domain state and call owning typed handler
  -> validate result/claims and redact output/event
```

Source labels and prompt delimiters are context hygiene only. They are not an enforcement boundary. Deterministic server policy is authoritative even when the model or injection detector reports no attack.

## Policy decision point

```text
Policy.evaluate({ actionIntent, trustedContext, accessDecision, matrix, confirmationState, limits })
  -> { outcome: ALLOW | DENY | REQUIRE_CONFIRMATION, reasonCategory, policyVersion, correlationId }
```

Before `ALLOW`, the PDP requires all of the following:

1. The separately established DEC-001 access capability is valid for the operation. The mechanism is not selected by SPEC-005.
2. The exact operation name/version is in a server allowlist and is enabled for this deployment.
3. The target and input pass the owning tool's strict schema, size, format, enum, and canonicalization rules.
4. Current owner/domain scope and operation-specific preconditions are re-read by the owning service. A stale/missing/changed target is denied.
5. The approved DEC-009 matrix has an entry for the operation/risk context. An absent or unresolved entry denies; the model cannot supply the entry.
6. If that entry requires confirmation, a matching non-expired, not-yet-consumed action grant is present.
7. The request and tool-call budgets are not exhausted, and a durable idempotency reservation can be made before a side effect.

Outcomes use stable user-safe categories such as `INVALID_INPUT`, `CAPABILITY_DISABLED`, `POLICY_DENIED`, `CONFIRMATION_REQUIRED`, `CONFIRMATION_INVALID`, `STALE_PRECONDITION`, `IDEMPOTENCY_CONFLICT`, `BUDGET_EXHAUSTED`, and `DEPENDENCY_UNAVAILABLE`. Exact public HTTP mapping belongs to SPEC-002. Do not expose matrix thresholds, rule expression, raw arguments, or existence of inaccessible records.

## Input and prompt boundary

- Accept only the bounded JSON DTOs owned by SPEC-002/runtime and named tool schemas. Reject unknown fields, unsupported Unicode/control sequences where the field schema prohibits them, oversized/deep JSON, unrecognized enum/date/ID formats, SQL, executable code, and arbitrary query fragments in structured tool/control arguments. Preserve free-form user/domain text as inert untrusted data; never execute it or reinterpret it as a query.
- Preserve user/domain text as content. Attach source-kind and source-reference metadata; render it to the model as untrusted data separate from server-authored policy instructions. Never splice record text into privileged instruction text.
- Prompt-injection rules/classifiers are defense in depth. They may produce a `suspicious_signal` and a safe refusal/clarification for that turn under a reviewed policy, but absence of a signal never grants a tool. Automated detection never sets `confirmed_attack`.
- Unicode/confusable screening may flag suspicious input and send it to safe handling; do not silently rewrite a resource name or approved payload. Canonical hashes use validated typed fields and deterministic serialization.
- No content is sent to an external classifier/model/tracing provider unless DEC-006 and applicable access gates allow it.

## Tool execution and no-op failure

- The tool proposal and confirmation are not passed straight to a handler. The executor independently resolves tool name/version, validates schema, evaluates PDP, rechecks domain preconditions, then reserves idempotency before invoking the owning handler.
- Any deny, missing/changed confirmation, access-gate failure, unapproved matrix entry, exhausted budget, unavailable durable ledger, or stale precondition means zero side effects.
- Authorization and confirmation are checked at execution time, not only when the model proposes the action or when a confirmation card is first prepared.
- Writes, recurrence changes, deletion, and high-impact capabilities remain disabled until their owning SPEC and decisions authorize them. SPEC-006 currently excludes deletion. No SQL or direct Supabase table mutation is exposed to the LLM.

## Output and event handling

- Validate structured claims against current tool results/source references. Grounded claims require an existing allowed `sourceRef`; other claims are labeled as inference/unknown or trigger clarification. Never report a side effect as complete without the owning handler's recorded result.
- Return only fields in the owning response allowlist. Escape/render user or retrieved text as data at the eventual UI boundary; do not interpret model output as HTML/JavaScript.
- Event classes are `benign_validation_failure`, `suspicious_signal`, and `confirmed_attack`. Classification rules and escalation thresholds remain subject to review. An automated classifier alone cannot emit a confirmed attack.
- Event/log allowlist: `eventId`, server `correlationId`, policy/graph version, operation identifier, broad reason category, event class, decision, and elapsed time. Never include prompts, tool payloads/results, secrets, auth material, raw error objects, SQL, private row data, or provider bodies.
- Persistent events, retention, and external traces require DEC-005/006 and SPEC-010; these are not enabled by this contract.
