# Implementation Plan: Dependency-Aware SDD Execution and Gate Waivers

**SPEC ID**: `SPEC-016` | **Version**: `1` | **Manifest hash**: assigned only if a future batch is created  
**Branch**: existing branch preserved | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)  
**Status**: Draft; no implementation authorization.

## Summary

Allow separately approved SPEC batches to proceed when their declared dependencies are complete, even if an unrelated batch is paused. Add an auditable owner-authorized `WAIVED` outcome for eligible required gates, distinct from `PASSED`. Preserve immutable manifests, explicit batch approval, correction limits, and all product access decisions.

## Technical Context

**Language/Version**: JavaScript ESM and PostgreSQL functions in the existing SDD schema.  
**Primary Dependencies**: Existing `scripts/sdd/sddctl.js`, Supabase SDD RPCs, Node test runner.  
**Storage**: Additive changes to the private `sdd` governance schema only; snapshot-derived gate waiver eligibility and exact owner waiver authorizations.  
**Testing**: `node:test`, `npm test`, lint/build, and PostgreSQL migration/RPC tests. Prefer isolated PostgreSQL; for this MVP, use the owner-authorized development Supabase project through direct SQL when local isolation is unavailable, following the synthetic-fixture, project/schema verification, marker, rollback, or exact-ID cleanup rules in `spec.md`.
**Target Platform**: Existing FlowZenit SDD supervisor and runner.  
**Project Type**: Internal workflow CLI, governance documentation, and PostgreSQL control plane.  
**Performance Goals**: No new latency target; admission and waiver checks remain bounded by existing batch/task queries.  
**Constraints**: Never mutate approved manifest contents; never mark unrun tests `PASSED`; no runner-credential approval; no changes to product grants, RLS, DEC-001/009/012, or deployment settings.  
**Scale/Scope**: One owner-controlled project with bounded batches and auditable correction history.

## Constitution Check

- User retains control of batch membership and exact SPEC versions: pass.
- New independent work still requires a valid immutable manifest and owner approval: pass.
- The paused batch stays paused unless explicitly resumed: pass.
- Gate waivers remain separate from passes and require privileged owner authorization: pass.
- SDD schema privileges may be tightened or granted for the governance RPC only; product grants and RLS remain unchanged: pass.
- Product security gates and least privilege remain unchanged: pass.

## Dependencies and Contracts

- **Prerequisite SPECs**: None. This is an internal governance change; any batch containing this SPEC still requires exact owner approval.
- **API/data contracts**: [gate waiver and scheduling contract](contracts/gate-waiver-and-scheduling.md).
- **Security boundary**: Runner credentials may prepare/record evidence; privileged Supabase SQL/MCP authorization is required for a waiver or resume.
- **Database changes**: Additive migration only under `sdd`; no product-schema changes. Add a cross-batch writable-scope guard, gate-waiver authorization records, and completion validation. Rollback must not delete audit history or reinterpret existing gate outcomes.
- **Out-of-scope files/systems**: Product routes, UI, business data, RLS/grants outside SDD, deployment, model/provider paths, and product access decisions.

## Execution and Recovery Plan

- **Sequential phases**: (1) dependency/scope admission tests and guard; (2) gate-waiver model and additive migration; (3) privileged RPC fail-closed validation; (4) CLI preparation and reporting; (5) focused tests and final audit.
- **Parallel tasks**: No database and CLI work will run in parallel until contracts are fixed; documentation updates may be parallel only with disjoint files.
- **Agent assignments**: None preassigned. Any future SDD delegation must record roles and disjoint scopes in Supabase.
- **Failure fingerprints**: Gate key, run ID, manifest hash, authorization outcome, and dependency/conflict class; exclude sensitive evidence.
- **Checkpoint/recovery data**: Safe batch/run IDs, gate keys, states, migration version, command results, and evidence references; no credentials, prompts, or private data.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | `npm run lint` | Exit 0; no new diagnostics |
| Build | Yes | `npm run build` | Exit 0 |
| Unit/integration | Yes | Focused SDD tests and `npm test` | Dependency/conflict cases, exact-hash waivers, reporting distinction |
| Database/contracts | Yes | Isolated PostgreSQL tests; if unavailable, direct SQL tests in the verified owner-authorized development Supabase project | Authorized waiver succeeds; stale/mismatched/unauthorized waiver fails; test writes are synthetic and rolled back or cleaned up by captured IDs |
| Security review | Yes | Read-only least-privilege and audit review | Runner role cannot approve waiver, resume, or change product permissions |

## Decisions and Risks

- A waiver records accepted residual risk and never changes test results.
- A paused batch may remain open while a separate eligible batch runs; no cross-batch continuation is automatic.
- Database integrity relies on exact hash binding and server-side authorization checks.
- The current SPEC-005 draft prerequisite metadata must be aligned to completed SPEC-001@2, SPEC-002@2, and SPEC-004@2 before registration.

## Project Structure

```text
scripts/sdd/sddctl.js
supabase/migrations/<new additive SDD governance migration>.sql
tests/sdd/
AGENTS.md
.specify/memory/constitution.md
.agents/skills/sdd-run/SKILL.md
specs/SPEC-016/
```

## Complexity Tracking

No constitution conflict is intended. Explicit waiver authorization and a distinct gate state are the smaller auditable alternative to silently treating unavailable checks as passes.
