# Data model: Agent Guardrails and POC Action Policy

| Entity | Fields/meaning | Constraint |
| --- | --- | --- |
| ToolProposal | Registered tool name/version and typed arguments | Strict schema; server registry is authoritative. |
| POCActionPolicy | Operation allowlist and single-create-per-request rule | Allows typed reads/search and one task, subtask, or routine-template creation. |
| Clarification | Safe assistant response for missing/ambiguous required fields | Produces zero write calls. |
| ActionOutcome | Confirmed, denied, invalid, dependency-failed, or uncertain result | Only a persisted/read-back result is success; uncertain writes are not retried automatically. |

No confirmation table, durable action ledger, or new database schema is required for this create-only POC.
