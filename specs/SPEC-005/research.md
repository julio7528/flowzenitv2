# Research: SPEC-005 guardrails and action authorization

**Date:** 2026-10-28  
**Status:** Planning evidence only. DEC-009 remains pending; no action confirmation policy is approved here.

## Repository and contract baseline

- No agent runtime, API, tool registry, guardrail policy engine, prompt-injection suite, or confirmation grant store exists in the checkout. Existing tests cover current UI timeline and SDD tooling, not agent security.
- The existing app is React/Vite and accesses Supabase from browser code. The passkey and `sessionStorage` gate are navigation controls; they are not server-verifiable identity or action authorization. Existing `anon` table policies/grants are not a basis for a new privileged agent endpoint.
- The product has client-side `window.confirm` for existing deletions and a `ConfirmDialog` for some weekly task moves. Those UI dialogs do not issue a server-bound, one-time action grant. The weekly move path checks whether an affected subtask exists but does not retrieve the exact affected list before confirmation. This observation does not authorize changing the existing UI or importing its behavior into agent policy.
- Existing direct client writes include demand hierarchy edits/deletes, subtask planning updates, and subtask status changes. Database migrations enforce hierarchy, parent-derived status, date/time constraints, and weekly planning rules; these are domain-integrity rules, not authorization or confirmation policy.
- SPEC-006 excludes agent deletion in its first write set, says a task move with child schedule consequences must display exact affected records and require a matching confirmation, and keeps real writes closed until DEC-001. SPEC-007 also depends on SPEC-005 but has unresolved DEC-013 temporal semantics. SPEC-005 must provide contracts, not duplicate either domain operation.
- SPEC-001 supplies the server boundary and DEC-001 access gate. SPEC-002 supplies the graph/tool proposal/executor ports and explicitly defaults protected tools to deny. SPEC-004 supplies typed reads. No guardrail result or confirmation can replace the DEC-001 gate.

## Threat and control findings

1. **Prompt injection is not eliminated by a detector.** OWASP guidance describes direct and indirect injection through users, retrieved records, and web results, and recommends separating untrusted content, limiting privileges, validating model output, and requiring approval for consequential actions. The runtime policy must remain decisive even when detection misses an attack.
2. **Model output is untrusted input.** Tool names/arguments need ordinary server-side allowlist/schema validation, canonicalization, policy checks, domain preconditions, and an authorization decision immediately before the side effect. Provider schema/strict mode, prompt instructions, or model confidence cannot authorize an operation.
3. **Authorization, confirmation, and idempotency are different checks.** DEC-001 access control decides whether the request has a valid server access capability; the action policy decides whether the operation/capability is permitted; confirmation only approves the exact proposed action when DEC-009 says it is required; an execution ledger makes retries/replays safe. None can substitute for another.
4. **DEC-009 is a required policy input, not a mechanism choice.** The exact per-action confirmation matrix and thresholds remain pending. High-impact and mutation operations remain unavailable until the relevant matrix entry is approved. A test fixture can supply a synthetic matrix to verify the generic engine without approving real policy.
5. **One-time action grant needs atomic consumption.** The SPEC's draft grant fields imply a server-side store or equivalent compare-and-set port. A browser boolean, request text saying “yes,” re-read of an old approval, or process-local memory is not sufficient for race/replay safety. Storage backend, expiry value, and retention are not selected here.
6. **Current product confirmations are not reusable server grants.** UI confirms are specific frontend behavior; the existing weekly move dialog does not enumerate exact impacted rows. Any agent write contract must compute current domain consequences and bind a grant to the exact canonical action before side effects.

## Proposed guardrail pipeline for review

`bounded request validation → classify/label untrusted segments → build prompt with explicit provenance boundaries → normalize model output → parse/schema validate exact tool proposal → DEC-001 access gate → server policy decision (capability/scope/domain/matrix) → confirmation challenge/consume if the approved matrix requires it → idempotency reservation → owning typed handler → validate result/claims → redact response and security event`

This is defense in depth. Untrusted content labels and prompt delimiters help the model handle data; they do not create a trust boundary that the model can enforce. A deterministic server policy denies tools regardless of the prompt or classifier result.

## Open decisions and dependencies

- **DEC-001**: access-control solution is not selected; all private reads and privileged side effects remain blocked until the gate is approved, implemented, and verified.
- **DEC-009**: per-action confirmation matrix, risk thresholds, grant lifetime, and approval-validity details remain pending. Do not infer which actions are low/high impact or enable a real operation from a synthetic test matrix.
- **DEC-012**: abuse/rate/tool-call limits remain pending; use only bounded limits approved through SPEC-002/DEC-012.
- **DEC-005/006 and SPEC-010**: persistent security events, traces, redaction sharing, retention, or external processing remain unapproved.
- **SPEC-002**: runtime tool proposal/executor and retry/correlation interfaces; policy must run at the executor boundary immediately before the handler.
- **SPEC-004**: exact read contracts. **SPEC-006/007**: later domain write/temporal tools; neither gets enabled by this planning document.
- Confirmation challenge transport/storage, canonical serialization version, atomic consume implementation, and event escalation workflow remain technical proposals requiring review before implementation.

## Official primary references

- OWASP GenAI project: [LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/), [Prompt Injection Security Glossary](https://genai.owasp.org/glossary/prompt-injection/), [OWASP GenAI LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/).
- Project-specific contracts to preserve: [SPEC-001 API boundary](../SPEC-001/contracts/agent-api-boundary.md), [SPEC-002 runtime ports](../SPEC-002/contracts/runtime-ports.md), [SPEC-004 read tools](../SPEC-004/contracts/read-tools.md), and [SPEC-006 write tools](../SPEC-006/spec.md).
