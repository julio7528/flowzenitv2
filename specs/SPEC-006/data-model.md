# Data model: Task and Subtask Creation

| Entity | Fields used | Constraint |
| --- | --- | --- |
| Demand/task/subtask row in public.demandas | id bigint, demanda text, tipo smallint, raizid bigint, status text, data_exec date, hora_inicio time without time zone, hora_fim time without time zone | tipo 1=demand, 2=task, 3=subtask; raizid is the exact parent ID. |
| Task creation | demanda=name, tipo=2, raizid=demand ID | Parent must exist and be tipo 1. Demand data_exec must be null. |
| Subtask creation | demanda=name, tipo=3, raizid=task ID | Parent must exist and be tipo 2. |
| Persisted result | Inserted ID and parent relationship read back from Supabase | ID remains a decimal string; show success only after read-back. |

Use fixed Supabase JS/PostgREST queries against existing public.demandas. No schema/grant/RLS change or direct PostgreSQL driver.

## Supabase catalog evidence

Read-only catalog inspection of the development Supabase project on 2026-10-30 confirmed:

- `id` is a non-null `bigint` identity column (`BY DEFAULT`); `status` is non-null and defaults to `Backlog`.
- `demanda` and `tipo` are non-null. `raizid`, `data_exec`, `hora_inicio`, and `hora_fim` are nullable.
- Constraints enforce a nonblank name, `tipo` in 1–3, null parent for type 1, a parent ID for types 2/3, an existing parent, status values by type, and valid schedule field combinations.
- `anon` currently has table grants for `DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, and `TRUNCATE`; the catalog query reported no direct `UPDATE` grant. RLS is enabled and not forced. Existing permissive policies cover `SELECT`, `INSERT`, `UPDATE`, and `DELETE` for `anon` with `true` predicates. This records current state only; this SPEC changes none of it.
- Existing triggers validate parent types and schedule relationships, derive parent status, reject manual parent-status changes, clear scheduled subtasks when a task moves weeks, and clear a demand's `data_exec` after a task is inserted or moved under it.

The trigger that clears the demand date is why task creation requires an unscheduled demand. Exact table, constraint, trigger, grant, RLS, and policy metadata came from read-only `information_schema`, `pg_catalog`, and `pg_policies` queries. No application rows were read or written.
