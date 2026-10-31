# SPEC-002 quickstart

## POC validation

Run these commands from the repository root for this SPEC:

1. `npm.cmd test`
2. `$files = @(rg --files tests/contracts/agent tests/unit/agent tests/security/agent | Where-Object { $_.EndsWith('.test.js') } | Sort-Object); node --test $files`
3. `npm.cmd run lint`
4. `npm.cmd run build`
5. `node scripts/security/scan-client-assets.js dist` with a process-only synthetic `SPEC001_SCAN_SENTINEL`, followed by a restricted-marker scan and `git diff --check`.

## Recorded execution — 2026-10-30

| Check | Result | Evidence |
| --- | --- | --- |
| Full test suite | PASS | `npm.cmd test`: 383 tests, 380 passed, 0 failed, 3 skipped; exit 0. |
| Agent runtime contracts | PASS | Explicit-file `node --test` command above: 93 passed, 0 failed; includes the default-route composition test. |
| Lint | PASS | `npm.cmd run lint`; oxlint exit 0. |
| Production build | PASS | `npm.cmd run build`; Vite production build exit 0. |
| Client boundary | PASS | 22 built assets scanned; synthetic sentinel and restricted server markers had 0 hits; `git diff --check` exit 0. |

`tests/contracts/agent/production-route.test.js` exercises the actual default route with synthetic server configuration and a mocked DeepSeek HTTP response. No live provider request was sent, as this quickstart does not authorize a live smoke request. The route creates its Supabase JS/PostgREST read path from server configuration; the test returns an answer without invoking a database read.

Use deterministic provider and Supabase doubles in automated tests. Do not send a live provider smoke request unless separately authorized. Record actual outcomes in the active SDD gates.
