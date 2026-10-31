# Implementation Plan: Agent Data Integration Foundation

**SPEC**: SPEC-001@3 · **Status**: Draft · **Date**: 2026-10-30

## Summary

Open the existing agent access gate for the owner-approved public POC and preserve the current Supabase connection and permission boundary. This SPEC does not add a client, migration, database permission, or login mechanism. SPEC-002 consumes the gate for the agent runtime; later SPECs own each typed Supabase operation.

## Technical context

- JavaScript ESM, React/Vite, Node/Vercel Functions, Supabase JS/PostgREST.
- `server/security/accessGate.js` currently denies every operation. `server/agent/runtime/capabilities.js` separately disables the production provider, database, and tool calls; SPEC-002 owns that runtime policy.
- The existing browser app uses a publishable Supabase key. The agent must stay within that same `anon` permission set.
- No Docker, local database, direct `pg`, `service_role`, schema change, RLS/grant change, or deployment is part of this plan.

## Design

1. Keep an explicit server-owned POC decision in `server/security/accessGate.js`; no request property, browser passkey, or model result can change it.
2. Make the POC boundary state that access is public and unauthenticated. The gate grants only entry to the typed POC path; Supabase remains the final permission boundary.
3. Keep provider and database policy wiring in SPEC-002 and typed data operations in their owning SPECs.
4. Use stable safe errors and existing runtime limits. Do not add logging of prompt, record contents, credentials, or cookies.

## Task file ownership

- This SPEC: `server/security/accessGate.js`, its unit/security tests, and the shared owner decision record.
- SPEC-002: production capability policy and `/api/agent/turn` runtime.
- SPEC-006/007: typed task, subtask, and recurrence PostgREST operations.
- SPEC-012: browser chat only.

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
| `full_test_suite` | `npm test` exits 0; tests assert the POC gate is open and browser/request/model data does not alter the fixed decision. |
| `lint` | `npm run lint` exits 0. |
| `production_build` | `npm run build` exits 0. |
| `client_boundary` | Built browser assets contain no provider or privileged Supabase credential; the client does not gain an agent database path. |
| final_audit | Read-only FR/SC and task audit, manifest/hash match, zero unresolved failures, and all required SPEC gates pass. |

## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| full_test_suite | NEVER |
| lint | NEVER |
| production_build | NEVER |
| client_boundary | NEVER |
| final_audit | NEVER |

## Risks and mitigations

- **Public endpoint and data**: owner accepted the existing public `anon` boundary for this POC. Keep this disclosure explicit and use no extra database privilege.
- **Provider cost/abuse**: retain the existing request, model, and tool-call bounds from SPEC-002; this SPEC adds no rate-limit service.
- **Unexpected scope expansion**: keep the tool allowlist server-owned and operation-specific.

No validation command has been run for this Draft.
