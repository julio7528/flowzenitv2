# SPEC-006 quickstart

## POC validation

1. Run `npm test`, focused domain-write contracts, `npm run lint`, and `npm run build`.
2. Verify task and subtask insert shapes use fixed `public.demandas`, server-owned `tipo`/`raizid`, the existing Supabase JS client, and exact-ID read-back.
3. Verify invalid/wrong-type parent, blank name, and a demand with `data_exec` set make zero insert calls.
4. Verify timeout/uncertain insert results are not retried automatically and are not shown as completed.
5. Verify no migration, grant, RLS, schema, direct `pg`, Docker, or `service_role` change was introduced.

Use deterministic PostgREST doubles in these automated checks. Record actual outcomes in the active SDD gates.

## Recorded validation — 2026-10-30

- `npm.cmd test`: PASS, exit 0; 417 tests, 414 passed, 3 skipped, 0 failed.
- `$files = @(rg --files tests/contracts/domain-write tests/security/domain-write tests/unit/domain-write tests/unit/guardrails tests/security/guardrails | Where-Object { $_.EndsWith('.test.js') } | Sort-Object); node --test $files`: PASS, exit 0; 111 passed, 0 failed.
- `npm.cmd run lint`: PASS, exit 0 (`oxlint`).
- `npm.cmd run build`: PASS, exit 0; Vite 8.3.5 transformed 165 modules.
- Production route contract: mocked DeepSeek plus intercepted Supabase JS Data API; parent GET, one task POST, and exact-ID read-back GET. No live application rows were written.
- `node scripts/security/scan-client-assets.js dist` with a process-only synthetic sentinel: PASS; 22 built files scanned, no sentinel match. Restricted server-only markers had 0 hits.
- `git diff --check`: PASS, exit 0. SPEC-006 added no migration, grant, RLS policy, trigger, table, or database permission change.
