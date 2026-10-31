# Data model: Agent Data Integration Foundation

This SPEC adds no database entity. It describes the runtime boundary used by the POC.

| Entity | Fields/meaning | Constraint |
| --- | --- | --- |
| Agent POC decision | Fixed server-side setting permitting the POC route to reach typed operations | Not request-, passkey-, or model-controlled. |
| Supabase public client | Existing project URL and publishable/anon key | Uses only current anon permissions; no service_role or new database role. |
| Typed operation | Registered server-side operation name and validated arguments | No SQL or arbitrary table/column selection. |

No table, column, grant, RLS policy, credential, or deployment setting is added by this SPEC.
