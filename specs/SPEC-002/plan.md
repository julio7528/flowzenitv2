# Implementation Plan: Agent Runtime and DeepSeek Integration

**SPEC**: SPEC-002@3 · **Status**: Draft · **Date**: 2026-10-30

## Summary

Enable the existing server route and production LangGraph runtime for the POC. Use the already configured DeepSeek provider with a bounded active chat context and typed domain tools. The runtime stays stateless between requests; chat context is supplied by the current browser session and is not persisted.

## Technical context

- JavaScript ESM, LangGraph/LangChain, DeepSeek Chat Completions, Vercel Node route, Supabase JS/PostgREST.
- `api/agent/turn.js` currently applies `productionCapabilityPolicy`, which denies all provider, Supabase, and tool calls. `server/agent/runtime/build-graph.js` and the typed tool executor already provide bounded graph and proposal boundaries.
- The current provider configuration is server-only. The browser receives only the route response.
- No extra database, schema, auth system, Docker, direct `pg`, service-role credential, tracing service, or deployment is selected.

## Design

1. Use `server/agent/runtime/capabilities.js` as the fixed server-side POC policy consumed by the route and executor. No request field or model output opens the policy.
2. Extend the turn DTO only for a bounded active-session message list. The list is context, never authority; user intent, exact target IDs, and operation schemas remain validated by the guardrail and owning tool.
3. Reuse the existing graph, DeepSeek adapter, response composer, timeout/cancellation, and safe error path.
4. Enable only tools registered by the completed prerequisite SPECs and later SPECs in this manifest. Missing capabilities remain unavailable until their owning SPEC is completed.
5. Keep LangSmith/external tracing off and keep active chat out of logs and persistent storage.

## Task file ownership

- Runtime policy/route: `server/agent/runtime/capabilities.js`, `api/agent/turn.js`.
- Active session context and graph: `server/agent/runtime/state.js`, `server/agent/runtime/build-graph.js`.
- Provider integration: existing `server/agent/model/deepseek.js` and `server/agent/config/secrets.js`.
- Tests: focused files under `tests/contracts/agent/`, `tests/security/agent/`, and `tests/unit/agent/`.

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
| `agent_runtime_contracts` | Focused route, graph, provider-adapter, bounds, and guardrail tests pass. |
| `lint` | `npm run lint` exits 0. |
| `production_build` | `npm run build` exits 0. |
| `client_boundary` | Browser output contains no DeepSeek credential and no direct agent-to-database path. |
| final_audit | Read-only FR/SC and task audit, manifest/hash match, zero unresolved failures, and all required SPEC gates pass. |

## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| full_test_suite | NEVER |
| agent_runtime_contracts | NEVER |
| lint | NEVER |
| production_build | NEVER |
| client_boundary | NEVER |
| final_audit | NEVER |

## Risks and mitigations

- **Public route/provider cost**: retain current model and request bounds; disclose the public POC and external model use in the chat.
- **Untrusted context**: active-session messages and retrieved values are model context only; tool authorization and payload validation stay server-side.
- **Partial manifest execution**: provider and tool capabilities are enabled only as their prerequisite SPECs complete in manifest order.

No validation command has been run for this Draft.
