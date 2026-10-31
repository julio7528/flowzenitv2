# SPEC-001 requirement checklist

Current POC scope for immutable candidate version 3. Fill each evidence cell and mark the checkbox only after implementation evidence exists.

| Complete | Requirement | Evidence |
| --- | --- | --- |
| [ ] | FR-001 | Evidence path/task |
| [ ] | FR-002 | Evidence path/task |
| [ ] | FR-003 | Evidence path/task |
| [ ] | FR-004 | Evidence path/task |
| [ ] | FR-005 | Evidence path/task |
| [ ] | FR-006 | Evidence path/task |
| [ ] | FR-007 | Evidence path/task |
| [ ] | SC-001 | Evidence path/task |
| [ ] | SC-002 | Evidence path/task |
| [ ] | SC-003 | Evidence path/task |
| [ ] | SC-004 | Evidence path/task |

## Executed validation

- `npm test` — exit 0; 373 tests, 370 passed, 0 failed, 3 skipped.
- `npm.cmd run lint` — exit 0; ran the `oxlint` package script. The initial `npm run lint` invocation exited 1 because the RTK output adapter reported a JSON EOF parse error without a lint diagnostic; the direct npm invocation verified the script successfully.
- `npm run build` — exit 0; Vite 8.3.5 transformed 165 modules.
- Focused access-gate/security checks — exit 0; 14 tests passed, then the guardrail registry test passed 1/1.

## Client boundary

- `git diff --check` — exit 0.
- `node scripts/security/scan-client-assets.js dist` with a process-only synthetic sentinel — exit 0; 22 built files scanned, no sentinel match.
- Built-asset scan — 22 files; zero occurrences of `SUPABASE_SECRET_KEY`, `DEEPSEEK_API_KEY`, `SERVICE_ROLE_KEY`, `service_role`, or `server/agent/`.
