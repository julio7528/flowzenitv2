# Guardrail pipeline — SPEC-005@2

The live POC uses this sequence:

1. Validate the current message and at most 8 prior active-chat messages against the runtime byte limit.
2. Label user and retrieved text as untrusted context.
3. Let the model propose only a registered typed operation.
4. Validate the operation and arguments on the server.
5. Allow typed reads/search or at most one task, subtask, or recurring-template creation.
6. Clarify missing/ambiguous values before any write.
7. Map results to safe answer text; report create success only after the Supabase row is read back.

Assistant text and retrieved content cannot authorize a write. No SQL, table/column selection, delete, rename, schedule, status change, recurrence edit, or multi-record write is allowed. Clear single-record creation does not require a separate confirmation store.
