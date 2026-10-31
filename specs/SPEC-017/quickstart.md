# SPEC-017 Validation Quickstart

## Prerequisites

- The existing `.env.local` has the current Supabase URL/public key and `DEEPSEEK_API_KEY` configured.
- No Docker, local PostgreSQL, direct database URL, or additional local backend process is required.

## Read-only acceptance smoke

1. Run `npm run dev` from the repository root.
2. Open the local app at its Vite URL and navigate to `/interno/chat`.
3. Ask: `O que está pendente?`
4. Confirm the chat shows an answer or a truthful empty/clarification result from the existing agent endpoint, rather than the generic `Falha` caused by a missing local API route.
5. Confirm the browser request is same-origin `POST /api/agent/turn` with a JSON response.
6. Do not ask for a create/update action during this smoke. Confirm no Supabase rows were changed.

## Required automated evidence for an approved implementation

| Check | Method | Evidence to record |
| --- | --- | --- |
| Bridge contract | `node --test tests/unit/dev/agentApiDevMiddleware.test.js` | Request/response adaptation, method/error handling, and non-agent path passthrough. |
| Project test suite | `npm test` | Actual exit code and pass/fail/skip totals. |
| Lint | `npm run lint` | Actual exit code and diagnostics. |
| Production build | `npm run build` | Actual exit code and evidence the development middleware is not in client assets. |
| Supabase smoke | Steps above | Outcome and evidence references only; no credential, transcript, or private row contents. |

## Baseline diagnosis before implementation

On 2026-10-30, a malformed POST to `/api/agent/turn` on the existing Vite server returned `404` with no JSON content type. The separate temporary handler returned `400 application/json` for the same malformed input. These probes did not call DeepSeek or Supabase. Re-run the read-only acceptance smoke after implementing the bridge.

## Automated validation — 2026-10-30

| Check | Command | Result |
| --- | --- | --- |
| Focused bridge | `node --test tests/unit/dev/agentApiDevMiddleware.test.js` | Exit 0; 3 passed, 0 failed. Covers request/response forwarding, safe JSON on handler-load failure, and passthrough for other paths. |
| Existing security boundary | `node --test tests/security/conversation/server-boundary.test.js tests/unit/dev/agentApiDevMiddleware.test.js` | Exit 0; 7 passed, 0 failed. Confirms static `envPrefix: 'VITE_'` remains inspectable and server modules stay outside client output. |
| Full suite | `npm.cmd test -- --test-reporter=dot` | Final run exit 0; no failed tests. The first run exposed the static `envPrefix` expectation; it was corrected in one recorded SDD correction attempt, then the suite passed. |
| Lint | `npm.cmd run lint` | Exit 0; Oxlint emitted no diagnostics. |
| Production build | `npm.cmd run build` | Exit 0; Vite 8.3.5 transformed 170 modules. The development middleware is not registered for the build command. |
| Client secret-boundary scan | `node scripts/security/scan-client-assets.js dist` with a process-only synthetic sentinel | Exit 0; 24 assets scanned, zero sentinel matches. |
| Whitespace/conflict check | `git diff --check` | Exit 0. |

The live read-only Supabase chat smoke is recorded below.

## Live local chat smoke — 2026-10-30

- Started the normal Vite dev command on an isolated port with `npm.cmd run dev -- --host 127.0.0.1 --port 5181 --strictPort` so the user's existing server was not stopped.
- `/interno/chat` returned HTTP 200. A malformed POST to `/api/agent/turn` returned HTTP 400 with `application/json`, confirming the request no longer reaches Vite's SPA/JavaScript fallback.
- The existing default-port server also returned HTTP 400 JSON for the malformed POST and HTTP 200 HTML for `/interno/chat` after the Vite config reload.
- Three valid read-only requests through the new Vite bridge returned, in order: HTTP 500 `failed`, HTTP 200 `needs-clarification` with one evidence item, and HTTP 200 `completed`. The first failure was recorded as non-reproducible; one correction attempt took 13 seconds and was resolved by the successful retry. No response text or record contents were retained.
- The smoke used only a read-only question; no create/update request was issued. The test did not invoke a write action.

The endpoint now returns a valid agent response through the Vite development server. A `needs-clarification` result is a valid terminal outcome and is rendered by the existing chat client; it is distinct from the previous generic transport failure.
