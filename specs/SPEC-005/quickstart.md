# SPEC-005 quickstart

## POC validation

1. Run `npm test`, focused guardrail and no-side-effect tests, `npm run lint`, and `npm run build`.
2. Verify only typed reads/search and one `create_task`, `create_subtask`, or `create_routine_series` action are allowed.
3. Verify clear single-record creation needs no extra confirmation, while missing/ambiguous fields and unsupported mutations make zero write calls.
4. Verify injection content cannot add operations and uncertain Supabase results are never reported as success.

Use deterministic doubles; do not create live database fixtures for these contract checks. Record actual outcomes in the active SDD gates.

## Executed evidence — 2026-10-30

- `npm.cmd test` — exit 0; 395 tests, 392 passed, 3 skipped, 0 failed.
- `$files = @(rg --files tests/security/guardrails tests/unit/guardrails tests/contracts/guardrails tests/unit/agent | Where-Object { $_.EndsWith('.test.js') } | Sort-Object); node --test $files` — exit 0; 98 passed, 0 skipped, 0 failed.
- `npm.cmd run lint` — exit 0 (`oxlint`).
- `npm.cmd run build` — exit 0; Vite 8.3.5 transformed 165 modules.
- No live Supabase write was used in these contract checks; write behavior was checked with deterministic handler spies.
- Response tests confirm that a committed result with a persistent ID is reported as success, while dependency, failed, conflict, and unconfirmed results cannot use optimistic model text as success. Raw database error fields are rejected by the strict response contract.
