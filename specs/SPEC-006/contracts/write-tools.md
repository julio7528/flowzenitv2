# Write tools — SPEC-006@2

## Registered operations

| Operation | Input | Fixed effect |
| --- | --- | --- |
| create_task | Non-empty name and exact demand ID | Insert one public.demandas row with tipo=2 and raizid=demand ID. Parent must be tipo=1 and data_exec must be null. |
| create_subtask | Non-empty name and exact task ID | Insert one public.demandas row with tipo=3 and raizid=task ID. Parent must be tipo=2. |

The server selects the table and columns. The model cannot provide SQL, tipo, raizid, or permission flags. Use the existing Supabase JS/PostgREST client and current anon permissions.

Read the parent before insert. Insert one row, then read back by the inserted ID. Only a confirmed read-back returns success. Do not automatically retry after an uncertain response. Existing constraints/triggers remain authoritative.

No rename, schedule, status, delete, demand creation, migration, RPC, direct pg, Docker, or service_role operation is registered.
