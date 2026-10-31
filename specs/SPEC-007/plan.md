# Implementation Plan: Routine Recurrence Queries and Creation

**SPEC**: SPEC-007@2 · **Status**: Draft · **Date**: 2026-10-30

## Summary

Add typed query and one-row creation for existing recurring routine templates. Reuse the current Supabase JS/PostgREST connection and permissions. Do not add an occurrence engine, recurrence table, database migration, confirmation store, or background worker.

## Technical context

- `public.recorrente` is the existing routine-template table with name, local times, selected ISO weekdays, and inclusive civil-date boundaries.
- The app displays routine projections as read-only items; the table does not persist occurrences or link a routine to a demand/subtask.
- `America/Cuiaba` is the approved timezone. `DEC-013` remains pending for ambiguous free-form weekday/“next week” semantics; explicit date ranges and weekdays need no inference.
- The recurrence read contract currently lives in `server/domain/read/routine-templates.js`; the create adapter will live in a small typed domain module.

## Design

1. Reuse the existing typed routine query for listing templates and projecting them onto a supplied explicit date.
2. Validate name, ISO weekday array, civil date range, and local time before calling Supabase.
3. Insert one row into fixed table `public.recorrente` using the existing Supabase JS client, then read the exact ID back.
4. Keep `hora_fim=null` null. Do not infer weekdays/date boundaries or convert civil values to UTC.
5. Register only routine query and create tools. No edit/delete/occurrence operation is exposed.

## Task file ownership

- Domain adapter: `server/domain/recurrence/`.
- Agent tools: `server/agent/tools/recurrence-capabilities.js`, `server/agent/tools/registry.js`.
- Temporal helpers: existing `src/lib/recurringTime.js` only if a server-safe shared helper is required; do not duplicate UI-only timezone behavior without tests.
- Tests: `tests/unit/recurrence/`, `tests/contracts/recurrence/`, `tests/security/recurrence/`.

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
| `recurrence_contracts` | Explicit-date projection, validation, civil-time round-trip, PostgREST request shape, read-back, and no-side-effect tests pass with deterministic doubles. |
| `lint` | `npm run lint` exits 0. |
| `production_build` | `npm run build` exits 0. |
| `client_boundary` | The agent recurrence insert adapter is absent from browser assets. |
| final_audit | Read-only FR/SC and task audit, manifest/hash match, zero unresolved failures, and all required SPEC gates pass. |

## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| full_test_suite | NEVER |
| recurrence_contracts | NEVER |
| lint | NEVER |
| production_build | NEVER |
| client_boundary | NEVER |
| final_audit | NEVER |

## Risks and mitigations

- **Ambiguous natural language**: require explicit weekdays and date boundaries when semantics are unclear.
- **Civil-time shift**: preserve local values exactly; never convert `date`/`time without time zone` to UTC.
- **False success after timeout**: do not retry writes automatically; return an uncertain result unless read-back confirms the inserted row.
- **Table permission**: use only current anonymous Supabase privileges and map access errors to safe non-success outcomes.

No validation command has been run for this Draft.
