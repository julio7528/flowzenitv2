# Agent API boundary — SPEC-001@3

This POC contract allows the existing public route to reach only server-registered typed operations through the current Supabase anon permissions.

| Boundary | Contract |
| --- | --- |
| Browser to agent | Same-origin JSON POST to /api/agent/turn; active-chat context is bounded and untrusted. |
| Agent to provider | Server-only configured DeepSeek client; only active-chat context and typed data needed for the current turn. |
| Agent to data | Existing Supabase JS/PostgREST client, public schema, and current anon permissions. |
| Operation | Server-owned registry, strict input schema, fixed tables/columns, safe result envelope. |

No login, owner token, service_role, arbitrary SQL, Docker, local PostgreSQL, direct Node pg, grant/RLS/schema change, or deployment is introduced. The endpoint is public and the POC accepts that boundary.

Errors are stable categories. Do not return raw SQL/PostgREST bodies, provider bodies, stack traces, credentials, or prompt text.
