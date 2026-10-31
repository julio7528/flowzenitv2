# SPEC-007 quickstart

## POC validation

1. Run `npm test`, focused recurrence contracts, `npm run lint`, and `npm run build`.
2. Verify explicit-date template queries include both date-range boundaries and do not insert occurrences.
3. Verify one clear template creation preserves selected weekdays, civil dates/times, and nullable `hora_fim`, then reads the exact ID back.
4. Verify missing/ambiguous weekday, date range, or time makes zero writes; no edit/delete/occurrence tool is registered.
5. Verify no migration, grant, RLS, schema, direct `pg`, Docker, or `service_role` change was introduced.

Use deterministic PostgREST doubles in automated checks. The production-route test intercepts provider and Supabase JS requests; it does not write Supabase rows.

## Recorded validation — 2026-10-30

| Check | Command | Result |
| --- | --- | --- |
| Full suite | `npm.cmd test` | Exit 0; 436 tests, 433 passed, 3 skipped, 0 failed. |
| Recurrence contracts | PowerShell command below | Exit 0; 17 passed, 0 failed. |
| Lint | `npm.cmd run lint` | Exit 0 (`oxlint`). |
| Production build | `npm.cmd run build` | Exit 0; Vite 8.3.5, 165 modules transformed. |

```powershell
$files = @(rg --files tests/contracts/recurrence tests/unit/recurrence tests/security/recurrence | Where-Object { $_.EndsWith('.test.js') } | Sort-Object)
node --test $files
```

Production-route coverage confirms one template insert and exact-ID read-back through the existing Supabase JS publishable client, plus an explicit-date query that performs GET only. Ambiguous or incomplete create requests and unsupported occurrence/task side effects invoke no write handler.

## Server boundary and database scope

| Check | Command | Result |
| --- | --- | --- |
| Browser asset boundary | PowerShell command below | Exit 0; 22 assets scanned, no sentinel or restricted marker hits. |
| Diff whitespace | `git diff --check` | Exit 0. |

```powershell
$env:SPEC001_SCAN_SENTINEL = 'FlowZenitSpec007ClientBoundary20261030'
try { node scripts/security/scan-client-assets.js dist; $scanExit = $LASTEXITCODE } finally { Remove-Item Env:SPEC001_SCAN_SENTINEL -ErrorAction SilentlyContinue }
if ($scanExit -ne 0) { exit $scanExit }
$assetFiles = @(Get-ChildItem -LiteralPath dist -File -Recurse)
$markers = @('createSupabaseRecurrenceRepository','server/domain/recurrence','server/agent/tools/recurrence-capabilities','SUPABASE_SECRET_KEY','service_role')
$hits = @()
foreach ($file in $assetFiles) { $content = Get-Content -LiteralPath $file.FullName -Raw; foreach ($marker in $markers) { if ($content.Contains($marker)) { $hits += "$($file.Name):$marker" } } }
if ($hits.Count -gt 0) { $hits; exit 1 } else { "Restricted recurrence/server markers: 0 hits across $($assetFiles.Count) built client files." }
```

SPEC-007 adds no migration and changes no table schema, grants, RLS policies, or triggers. It uses the server-only Supabase JS client with the existing publishable key. No Node `pg`, Docker, local PostgreSQL, `service_role`, occurrence worker, or occurrence write was added.
