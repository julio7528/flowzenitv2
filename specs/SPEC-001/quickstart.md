# SPEC-001 quickstart

## POC validation

1. Run `npm test`.
2. Run `npm run lint`.
3. Run `npm run build`.
4. Verify gate tests represent the owner-approved public `anon` POC decision and cannot be altered by a request, passkey, or model result.
5. Inspect browser assets and confirm no provider/privileged credential or chat-to-Supabase client path was added.

The product continues to use only current Supabase `anon` permissions. Do not use Docker, local PostgreSQL, direct Node `pg`, `service_role`, or database permission changes. Record actual outcomes in the active SDD gates.
