# Implementation Plan: Agent Guardrails and POC Action Policy

**SPEC**: SPEC-005@2 · **Status**: Draft · **Date**: 2026-10-30

## Summary

Keep the existing guardrail pipeline and simplify its live POC policy to typed reads/search plus a single explicit task, subtask, or recurring-template create. Clear create requests execute once without a confirmation dialog. Missing or ambiguous required fields are clarified before any database call. Other mutations remain unavailable.

## Technical context

- JavaScript ESM, Zod schemas, LangGraph tool proposals, Supabase JS/PostgREST.
- Guardrail modules already exist under `server/agent/guardrails/`; write commands and tools exist under `server/domain/write/` and `server/agent/tools/`.
- Confirmation/store/ledger contracts from prior drafts are not required for this create-only POC. Do not add a table, migration, grant, or RPC for action confirmation.
- Current Supabase `anon` permissions stay unchanged. All tool operations remain server-allowlisted and use the existing permissions.

## Design

1. Retain strict input/output schemas, bounded content, safe errors, and prompt-injection defenses.
2. Add one explicit action policy for the enabled POC operations. Clarification is required when intent or required fields are ambiguous.
3. Permit one typed create per request after domain validation; do not execute a model-suggested second action in the same request.
4. Return only a confirmed persisted result as success. If a network failure makes the write uncertain, tell the user the result could not be confirmed and do not retry automatically.
5. Do not add persistent grants, an action ledger, user identity, tracing, or raw content logs.

## Constitution check

| Principle | Application |
| --- | --- |
| I. Preserve product behavior | Keep React/Vite, Supabase, existing schema, grants, RLS, triggers, and domain rules. |
| II. User-controlled scope | Execute only the exact ordered manifest after its immutable versions and hash are approved. |
| III. Security and data protection | Keep current anon permissions unchanged, use typed server tools, protect provider secrets, and disclose the public POC boundary. |
| IV. Tests accompany the design | Run the gates listed below and record actual results. |
| V. Durable and auditable execution | Record tasks, gates, checkpoints, and outcomes in Supabase SDD. |
| VI. Bounded correction | Preserve the project correction limits and pause on a reached threshold. |
| VII. Small, reviewable changes | Implement only this SPEC in its manifest position; preserve unrelated working-tree changes. |
| VIII. Manual publication | Do not commit, push, merge, deploy, reset, or discard changes. |
## Validation gates

| Gate | Required evidence |
| --- | --- |
| `full_test_suite` | `npm test` exits 0. |
| `guardrail_contracts` | Focused input/output validation, injection, action policy, no-side-effect, and unsupported-mutation tests pass. |
| `lint` | `npm run lint` exits 0. |
| `production_build` | `npm run build` exits 0. |
| final_audit | Read-only FR/SC and task audit, manifest/hash match, zero unresolved failures, and all required SPEC gates pass. |

## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| full_test_suite | NEVER |
| guardrail_contracts | NEVER |
| lint | NEVER |
| production_build | NEVER |
| final_audit | NEVER |

## Risks and mitigations

- **Public request path**: current `anon` access is owner-accepted for this POC; do not silently add privilege.
- **Duplicate after uncertain response**: suppress automatic retries for write operations; show an explicit uncertain result.
- **Retrieved injection**: label retrieved text as untrusted and keep tool authorization outside model-controlled data.

No validation command has been run for this Draft.
