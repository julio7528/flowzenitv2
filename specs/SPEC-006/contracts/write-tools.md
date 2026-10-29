# Contratos tipados de escrita — SPEC-006

**Estado:** proposta técnica de Draft. As ferramentas não são registradas/ativadas por este documento. Reads seguem SPEC-004; runtime/executor, ledger, access gate e policy seguem SPEC-001/002/005.

## Fronteira de execução

```text
bounded DTO
  -> operation/version allowlist
  -> DEC-001 access gate (closed means zero private DB calls)
  -> strict schema and canonical target/payload
  -> policy/confirmation decision from SPEC-005
  -> durable idempotency reserve from SPEC-002
  -> preview or transactionally revalidated execution
  -> owning typed mutation service
  -> existing Postgres constraints and triggers
  -> database read-back + safe outcome + ledger record
```

The model supplies neither SQL nor table/column names, filters, parent type, policy, idempotency key, permission, or confirmation grant. A supplied display label/name is only a disambiguation hint; the mutation needs an exact persistent decimal ID. The policy rechecks immediately before the side effect. A closed or unverified DEC-001 gate stops before private database access.

## Operation registry proposal

| Operation/version | Required input | Allowed effect |
|---|---|---|
| `create_demand/v1` | `name`, server command context | Insert type 1, `parentId=null`. |
| `create_task/v1` | `name`, exact `parentDemandId` | Insert type 2 under type 1. Preview/outcome includes clearing the parent's weekly date when present. |
| `create_subtask/v1` | `name`, exact `parentTaskId` | Insert type 3 under type 2. Return derived task/demand status. |
| `rename_demand/v1`, `rename_task/v1`, `rename_subtask/v1` | exact ID, exact expected kind, `name` | Change only `demanda`. Parent/type/status edits are rejected. |
| `set_weekly_allocation/v1` | exact ID/kind (`demand` or `task`), `date: YYYY-MM-DD|null` | Set or clear a weekly date; reject subtask and demand with children. |
| `set_daily_subtask_schedule/v1` | exact subtask ID; `date`, `startTime`, `endTime` | Set all three valid fields or clear all three to return to backlog. Reject partial nulls and dates outside the parent's Monday-based calendar week. |
| `set_subtask_status/v1` | exact subtask ID, allowed status | Update subtask only; parent status is database-derived. |

No `delete`, direct parent status, recurring-template mutation, independent appointment, arbitrary multi-operation workflow, or free-form update is registered by this SPEC.

## Preview and confirmation contract

```text
MutationPreview = {
  operation, operationVersion, target: { id, kind }, parent?: { id, kind },
  changes: [{ field, before, after }],
  affectedRecords: [{ id, kind, changes: [{ field, before, after }] }],
  expectedStateFingerprint, summary, timeZone?: "America/Cuiaba"
}
```

Preview reports every existing trigger side effect, including (a) parent `data_exec` cleared by task creation, and (b) child subtask `data_exec`/times cleared by a task week move. The affected set is exact and sorted by persistent ID for stable comparison. A schedule confirmation summary labels displayed times `America/Cuiaba`. The preview itself changes no data.

On explicit confirmation, the executor recalculates the target, expected state, and affected set inside the selected transaction boundary. Any changed field, target, parent, affected ID, or resulting clear invalidates the old confirmation and returns `CONFLICT`/`CONFIRMATION_INVALID` with no write. The summary never treats an existing client-side dialog as a server grant.

## Transaction, idempotency, and read-back

- Revalidate all relevant state and apply the one domain operation in one database transaction. This includes trigger side effects. Do not claim all-or-nothing behavior across multiple PostgREST calls.
- Proposed adapter for review: typed Postgres operation functions/RPC with invoker rights and explicit least-privilege grants after DEC-001; an approved server-side transaction adapter is an alternative. Schema exposure, grants, runtime credentials, and adapter choice remain pending. No function is public/executable by `anon` in this proposal.
- Reserve a server-generated idempotency key with the canonical command hash before execution. `reserved`, `priorOutcome`, `conflict`, and `unavailable` outcomes are distinct. No durable ledger means deny; ambiguous completion is resolved through the ledger and never retried blindly.
- Read back the committed target and derived parent state before returning `COMMITTED`. If the database rejects the command or read-back fails, return a safe failure/uncertain outcome and never claim success.
- Existing display values and IDs are not authorization. Database constraints/triggers remain final integrity checks, not the DEC-001 owner access gate.

## Stable outcome/error envelope proposal

```text
MutationOutcome = {
  outcome: COMMITTED | NO_OP | VALIDATION_ERROR | DENIED | CONFIRMATION_REQUIRED |
            CONFLICT | IDEMPOTENCY_CONFLICT | DEPENDENCY_UNAVAILABLE | FAILED,
  operation, persistentId?, resultingValues?, derivedStatuses?, affectedRecords?,
  correlationId, reasonCategory
}
```

Map database SQLSTATEs and dependency errors to bounded categories such as `INVALID_INPUT`, `NOT_FOUND`, `INVALID_PARENT`, `UNSUPPORTED_TARGET`, `STALE_STATE`, `SCHEDULE_CONFLICT`, `CONFIRMATION_REQUIRED`, `IDEMPOTENCY_CONFLICT`, `ACCESS_DISABLED`, `DEPENDENCY_UNAVAILABLE`, and `INTERNAL`. Do not return SQL, raw Postgres/PostgREST messages, stack traces, secrets, or inaccessible record contents. `SCHEDULE_CONFLICT` is reserved for a domain/precondition issue; overlapping intervals are allowed by the current database and are not rejected as a conflict.

## Required contract tests

- Typed create matrix: demand with no parent, task under demand, subtask under task; invalid/missing/wrong-type parents cause zero effects.
- Exact target disambiguation; duplicate names do not select a record implicitly and no unique-name policy is added.
- Task creation's demand-date side effect and task-move child clears are exact, previewed, confirmed, stale-checked and read back.
- Daily schedule requires all-null or all-valid; parent week rule, strict start-before-end, and overlaps remain valid.
- Status update writes only a subtask and returns trigger-derived parent values.
- Same key/hash replay has at most one effect; same key/different hash conflicts; concurrent same-key call cannot execute twice; timeout/uncertain state does not retry blindly.
- Denied DEC-001, missing DEC-009 entry, invalid confirmation, stale target, trigger/constraint rejection, transaction failure, and ledger failure produce zero new mutation or an explicit uncertain non-success outcome.

All integration fixtures use an isolated non-production database target and synthetic rows. No test may use existing application or production rows.
