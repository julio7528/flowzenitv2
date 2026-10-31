# Agent POC enablement scope

**Status:** Draft planning note based on the owner's 2026-10-30 direction. It does not approve or create an SDD batch.

## Confirmed POC choices

- Keep the current Supabase anonymous permissions and RLS policies unchanged. The owner accepts that the existing public `anon` access also allows other clients to use those permissions during this POC.
- Use the existing Supabase project through its current JavaScript/PostgREST path. Do not add Docker, local PostgreSQL, a direct Node `pg` connection, another database, new grants, or RLS changes.
- Put the chat in the existing FlowZenit UI and connect it to the existing agent runtime and SPEC-009 RAG retrieval.
- Support questions about existing FlowZenit records and conversational creation of tasks/subtasks. Include recurring-template query and creation from SPEC-007.
- Send only bounded context from the active chat and the typed records needed for the current turn to the configured DeepSeek provider; keep the active chat in browser memory and do not persist it.
- Keep destructive delete operations out of the agent capability set.
- Preserve existing domain constraints, hierarchy, America/Cuiaba civil-date behavior, and safe handling of retrieved text.

## Verified current-state limits

- `public.demandas` has anonymous SELECT/INSERT/DELETE policies with unconditional predicates. Anonymous UPDATE is granted only for selected columns, not as a general table privilege.
- `public.recorrente` currently allows anonymous SELECT/INSERT/UPDATE/DELETE under unconditional RLS policies.
- The current browser passkey is navigation state. The agent's production capability policy and domain access helper currently fail closed, so a new approved SPEC version must explicitly open the POC path.
- A public agent endpoint can be called by anyone; calls can incur model-provider cost. This is part of the owner's accepted public-POC scope, not an authentication guarantee.

## Candidate SDD order

1. SPEC-001@3 — record the owner-approved anonymous Supabase POC access boundary and the unchanged RLS/grants.
2. SPEC-002@3 — enable the existing server runtime/provider path for this POC and typed capabilities.
3. SPEC-005@2 — define the small POC action policy and confirmation behavior.
4. SPEC-006@2 — enable only the requested non-destructive task/subtask creation operations supported by current Supabase contracts.
5. SPEC-007@2 — enable recurring-template query/create behavior, preserve clarification for ambiguous dates, and keep edits and occurrence exceptions out of scope.
6. SPEC-012@2 — deliver the chat UI, connect SPEC-009 retrieval, reads, the enabled writes, and recurrence.

SPEC-009@2 and the other already completed prerequisites remain dependencies; they are not re-executed in this batch. This candidate order and scope still require immutable SPEC snapshots and exact-manifest approval before implementation.

## Explicitly deferred from this POC

- Database authentication redesign, tenant/user model, anonymous-policy changes, service-role access, and production deployment.
- Agent-driven deletion, task/subtask renaming, broad scheduling/status mutations, recurring-instance exceptions, and external tracing.
- Persistent conversation history in this chat slice unless the SPEC-003 access path is explicitly verified as compatible with the Supabase-only requirement.
