# Research: SPEC-001 server-side integration boundary

**Date:** 2026-10-28  
**State:** Planning evidence for Draft SPEC-001; no runtime decision is approved here.

## Repository baseline

- The product is a React 19/Vite 8 JavaScript ESM SPA. `vite.config.js` sets `envPrefix: 'VITE_'`; the browser Supabase client in `src/lib/supabase.js` reads public Vite configuration.
- Existing React pages call the browser Supabase client directly. This SPEC must not migrate those existing pages or alter their current access path.
- `src/App.jsx` gates navigation with a client-side passkey value stored in `sessionStorage`. That state cannot establish an owner identity at a server boundary.
- No product `api/`, `server/`, `backend/`, `vercel.json`, or API integration tests were found in the checkout. `package.json` does not declare a Vercel CLI/runtime or API framework.
- Existing project tests use Node's test runner; the project has lint, test, and Vite build scripts. No E2E runner is declared.
- The current anonymous/public data path is unresolved. It is not evidence that a future API may return private records.

## Options considered

| Option | Fit | Constraint |
| --- | --- | --- |
| Keep all future agent data access in the browser Supabase client | Reuses the existing path and avoids a server runtime | The passkey is client-side only; the current grants do not establish server-verifiable owner access. This cannot safely expose private agent capabilities under DEC-001. |
| Same-origin Vercel Node.js Function under root `/api` | Fits the current JavaScript/Vercel stack and is documented for Vite projects | No API exists in the checkout; local function development, build integration, region, duration, and deployment details must be validated. DEC-010 is still pending. This option is recommended for evaluation, not approved. |
| Supabase Edge Function or a separate backend service | Can isolate server work from the browser | Introduces a runtime/deployment choice and configuration not present in this checkout. DEC-010 and SPEC-002 must evaluate it; no selection is made here. |

## Recommendation for SPEC-002 to validate

Evaluate a same-origin Node.js Vercel Function as a thin HTTP adapter, with shared ESM modules in a root `server/` directory and agent/domain logic owned by SPEC-002 and the downstream capability SPECs. Keep the existing SPA-to-Supabase path unchanged. Until the DEC-001 access-control gate is separately approved, implemented, and verified, the server path remains fail-closed for private data, provider disclosure of private content, and privileged operations.

This recommendation does not select an authentication mechanism, authorize new server data access, choose deployment configuration, or add a product endpoint. Production runtime/region/duration and local Vercel integration remain open under DEC-010.

## Primary references

- Vite exposes `VITE_` variables in client bundles: [Env Variables and Modes](https://vite.dev/guide/env-and-mode) and [Shared Options](https://vite.dev/config/shared-options).
- Vercel documents root `/api` functions for Vite projects and a Node.js runtime: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) and [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js).
- Local Vercel function development uses the Vercel CLI; the CLI is not currently declared by this project: [vercel dev](https://vercel.com/docs/cli/dev).
- Runtime, region, and duration are configurable and affect execution trade-offs: [Function configuration](https://vercel.com/docs/functions/configuring-functions), [regions](https://vercel.com/docs/functions/configuring-functions/region), and [duration](https://vercel.com/docs/functions/configuring-functions/duration).
- Supabase API keys identify an application component, not the owner; secret/service-role access is elevated and bypasses RLS: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Securing your data](https://supabase.com/docs/guides/database/secure-data), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
