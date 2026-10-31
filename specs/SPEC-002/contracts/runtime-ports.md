# Runtime ports — SPEC-002@3

| Port | POC implementation | Boundary |
| --- | --- | --- |
| Model | Existing configured DeepSeek adapter | Server credential only; active-chat context and required typed data only. |
| Read tools | Completed SPEC-004 typed queries and SPEC-009 lexical Supabase retrieval | Fixed schemas and current anon permissions. |
| Write tools | SPEC-006 task/subtask create and SPEC-007 routine-template create | Registered after their SPEC completes; one record per request. |
| Policy | Server-side POC capability and action policy | No client/model override; unsupported operation denied. |
| Response | Existing bounded terminal response composer | Safe DTO; no raw provider, database, or tool errors. |

No direct database driver, service-role client, tracing adapter, persistent checkpointer, or background queue is part of this POC.
