# Implementation Plan: Task and Subtask Creation Tools

**SPEC**: SPEC-006@2 · **Status**: Draft · **Date**: 2026-10-30

## Summary

Connect the agent's existing typed write boundary to the same Supabase JavaScript/PostgREST client used by FlowZenit. Implement only one task or subtask insert per explicit user request and read the inserted record back. Keep the existing `anon` permissions, database schema, RLS, grants, triggers, and constraints unchanged.

## Technical context

- The repository already defines mutation DTOs, hierarchy validation, outcomes, and a mutation repository port under `server/domain/write/`.
- `public.demandas` has `id bigint`, `demanda text`, `tipo smallint`, `raizid bigint`, and `data_exec date`. The current hierarchy is demand type 1 → task type 2 → subtask type 3.
- The anonymous role can insert and select demands. The current parent/status triggers remain authoritative. No direct PostgreSQL adapter or privileged key is used.
- A task insert can clear its demand's weekly date through an existing trigger. This POC rejects a scheduled demand before inserting.

## Design

1. Add a server-only adapter that calls Supabase JS methods with fixed schema, table, selected columns, and operation shapes.
2. Use typed parent lookup to verify the exact ID and expected `tipo`; reject a parent name without an exact resolved ID.
3. Insert one row with server-owned `tipo`/`raizid`, then read the exact inserted ID back. Return a safe success only after read-back.
4. Do not wrap multiple PostgREST requests in a claimed transaction. A timeout/unknown insert result is reported as uncertain, with no automatic retry.
5. Keep the write tool registry to `create_task` and `create_subtask`; leave other mutation DTOs unregistered.

## Data and file ownership

- Adapter: `server/domain/write/supabase-repository.js`.
- Hierarchy and write handler: `server/domain/write/hierarchy.js`, `server/agent/tools/write-capabilities.js`, `server/agent/tools/registry.js`.
- Unit/contracts: `tests/unit/domain-write/`, `tests/contracts/domain-write/`, `tests/security/domain-write/`.
- No migrations, RLS, grants, trigger, or schema changes.

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
| `domain_write_contracts` | Hierarchy, adapter request shape, tool allowlist, error mapping, and no-retry tests pass using deterministic Supabase/PostgREST doubles. |
| `lint` | `npm run lint` exits 0. |
| `production_build` | `npm run build` exits 0. |
| `client_boundary` | The domain write adapter and Supabase insert path are absent from browser assets. |
| final_audit | Read-only FR/SC and task audit, manifest/hash match, zero unresolved failures, and all required SPEC gates pass. |

## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| full_test_suite | NEVER |
| domain_write_contracts | NEVER |
| lint | NEVER |
| production_build | NEVER |
| client_boundary | NEVER |
| final_audit | NEVER |

## Risks and mitigations

- **Permission mismatch**: use the existing anonymous key and grants; convert permission errors into safe non-success outcomes.
- **Existing trigger effects**: reject a task parent with `data_exec` set; do not hide schedule changes from the owner.
- **Lost insert response**: do not retry automatically and do not claim success without read-back.
- **Cross-request duplicates**: the POC executes one create per request and disables UI resubmission while pending; uncertain writes require a manual check before retry.

No validation command has been run for this Draft.
