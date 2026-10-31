# Implementation Plan: Local Vite Agent API

**SPEC ID**: `SPEC-017` | **Version**: `2` | **Manifest hash**: assigned only if an exact SDD batch is registered  
**Branch**: `SPEC-017` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

## Summary

Make the agent chat work when the owner runs the existing `npm run dev` command. Add a development-only Vite middleware that adapts `/api/agent/turn` requests to the existing Fetch handler, loads the handler's local server configuration safely, and forwards its JSON response. The production Vercel function, Supabase schema, and current agent policies remain unchanged.

## Technical Context

**Language/Version**: JavaScript ESM, Node.js 24  
**Primary Dependencies**: Existing Vite 8 and React plugin; no new package  
**Storage**: Existing Supabase project through the current agent handler; no new persistence  
**Testing**: Node built-in test runner, Oxlint, and Vite build  
**Target Platform**: Local development on the existing Node/Vite host  
**Project Type**: React/Vite SPA with a development-only Node middleware  
**Performance Goals**: Add no extra provider or Supabase round trip beyond the existing agent request  
**Constraints**: One `npm run dev` command; no Docker, local PostgreSQL, direct database URL, extra backend process, new dependency, or database write in acceptance validation  
**Scale/Scope**: Single POC application and the single existing agent endpoint

## Constitution Check

| Principle | Result | Application |
| --- | --- | --- |
| Preserve existing architecture | PASS | Reuse the existing React/Vite, Fetch handler, DeepSeek adapter, and Supabase client. |
| User-controlled scope | PASS | SPEC-017 remains Draft; implementation requires an exact approved manifest. |
| Security and data handling | PASS | The provider key remains server-side; `envPrefix: 'VITE_'` stays unchanged. |
| Tests accompany changes | PASS | Add focused bridge tests and run the existing suite, lint, build, and read-only smoke. |
| Durable evidence | PASS | Record actual commands and outcomes in the SPEC quickstart and SDD gates after approval. |
| Small, reviewable change | PASS | Limit code to the Vite config, one dev-only middleware, and its focused tests. |
| Manual publication | PASS | No commit, push, merge, deployment, or publication. |

## Dependencies and Contracts

- **Prerequisite SPECs**: `SPEC-001@3` and `SPEC-012@2` are implemented; the chat client contract exists.
- **API/data contracts**: Preserve `POST /api/agent/turn` from `specs/SPEC-012/contracts/chat-client.md` and the handler's safe JSON errors.
- **Security boundary**: The bridge runs in Vite's Node development server. Load local env values for the server only; keep `envPrefix` restricted to `VITE_` and do not use `define` for provider secrets.
- **Database changes**: None. The live acceptance smoke is read-only and uses the existing Supabase project through the current agent handler.
- **Out-of-scope files/systems**: Production Vercel function, Supabase migrations/permissions, chat UI, agent tools/policy, Docker, and local PostgreSQL.

## Execution and Recovery Plan

- **Sequential phases**: (1) Add focused bridge contract tests; (2) implement the Node HTTP to Fetch adapter; (3) register the dev-only middleware and server env loading in `vite.config.js`; (4) run automated gates; (5) run one live read-only chat smoke; (6) audit scope and evidence.
- **Parallel tasks**: None; all work touches the same Vite request boundary.
- **Agent assignments**: None; this is a small, single-scope change.
- **Failure fingerprints**: A 404/HTML response indicates the middleware did not intercept the route; a generic JSON bridge error indicates handler import/configuration failed; a safe handler error indicates the existing request reached the agent boundary but a dependency or request failed.
- **Checkpoint/recovery data**: Record task IDs, gate keys, commands, exit codes, sanitized HTTP status/content type, and the read-only smoke outcome. Never record env values, message transcripts, or private database content.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Focused bridge contract | Yes | `node --test tests/unit/dev/agentApiDevMiddleware.test.js` | Request/response forwarding, JSON errors, and route passthrough pass. |
| Full test suite | Yes | `npm test` | Exit 0 with actual totals recorded. |
| Lint/static checks | Yes | `npm run lint` | Exit 0 with no new diagnostics. |
| Production build | Yes | `npm run build` | Exit 0; no dev middleware or provider secret is included in client assets. |
| Supabase read-only smoke | Yes | Run `npm run dev` and ask the quickstart question in `/interno/chat` | Real response through configured agent/Supabase path; no row writes. |
| Final audit | Yes | Read-only FR/SC/task review | Every requirement has actual evidence and no unresolved failure. |

## Decisions and Risks

- The bridge will use Vite's development middleware hook so the existing API route is handled before the SPA fallback. Vite documents `configureServer` as a development-server hook and notes it is not run for production builds.
- Vite's `.env*` files are not available in `process.env` while the config is evaluated. If the handler needs them there, the implementation must use Vite's `loadEnv` and keep the values server-side. Preserve the current `VITE_` client prefix.
- If the existing handler cannot be loaded, the bridge returns a generic safe JSON response; it must not leak stack traces or turn an API failure into HTML.
- Current agent write capabilities remain governed by the existing handler; the acceptance smoke is explicitly read-only.

## Project Structure

```text
vite.config.js
server/dev/agentApiDevMiddleware.js
tests/unit/dev/agentApiDevMiddleware.test.js
specs/SPEC-017/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/dev-agent-api.md
  tasks.md
  checklists/requirements.md
```

**Structure Decision**: Keep the adapter in a server-only `server/dev/` module, register it only from the Vite development config, and test the Node HTTP/Fetch translation with a stub handler.

## Complexity Tracking

No constitution violations or additional infrastructure are proposed.
