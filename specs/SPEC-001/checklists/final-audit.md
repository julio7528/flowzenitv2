# Final conformance audit — SPEC-001@3

**Batch:** `d17d161a-0b66-4ea3-a5c0-471d10b9ba20`  
**Approved manifest SHA-256:** `1c1794b51512acf0d098c2c54c06f343458ec3b3d6f8e0e6d88541014a7b77c3`  
**Immutable SPEC content SHA-256:** `851e7849bd99d2fa671ba1cdf5cbad9339d697369591ea21744d5b919e247e56`

## Functional requirements

| Requirement | Result | Evidence and limit |
| --- | --- | --- |
| FR-001 | PARTIAL | `src/lib/supabase.js` uses the existing `VITE_SUPABASE_URL` and publishable key; both are configured. Their values were not printed. The agent's live PostgREST request is deferred to SPEC-002 runtime activation. |
| FR-002 | PASS at the server boundary | The policy test allows only the server-registered synthetic capability, rejects an unregistered SQL operation before matrix/precondition/handler calls, and rejects arbitrary SQL input under the strict schema. The existing typed read registry remains fixed. |
| FR-003 | PASS | This SPEC changed only the access gate, its tests, and decision/evidence documentation. No product schema, grant, RLS, trigger, or existing browser data path was changed. |
| FR-004 | PASS | This SPEC added no Docker, local PostgreSQL, direct Node `pg`, `service_role`, database migration, or deployment. The optional direct-PostgreSQL test was not run. |
| FR-005 | PASS at the policy boundary | The access decision is fixed and public; request, browser passkey, and model fields cannot authorize or deny it. The decision record describes the endpoint and anon-accessible data as unauthenticated and public. Live route behavior is deferred to SPEC-002. |
| FR-006 | PASS for the client boundary | The 22-file production asset scan found no provider or privileged Supabase credential markers. Provider execution remains owned by SPEC-002. |
| FR-007 | PASS | The browser build contains no `server/agent/` module path. The agent continues to use the same-origin API boundary; the existing application Supabase client remains unchanged. |

## Success criteria

| Criterion | Result | Evidence and limit |
| --- | --- | --- |
| SC-001 | NOT VERIFIED in this SPEC | Public Supabase configuration is present, but the active agent route still uses the disabled production runtime policy until SPEC-002. No claim of a live agent-to-Supabase request is made here. |
| SC-002 | PARTIAL | The decision record and server tests document the public, unauthenticated boundary. Chat-screen disclosure is owned by SPEC-012 and live route behavior by SPEC-002. |
| SC-003 | PASS at the tested boundary | The gate adds no database permission. The guardrail test proves request/model fields cannot add a capability or arbitrary SQL path outside the server registry. Existing `anon` grants/RLS remain authoritative. |
| SC-004 | PASS | `npm test` exited 0 (370 passed, 0 failed, 3 skipped); `npm.cmd run lint` exited 0; `npm run build` exited 0. |

## Task and gate audit

| Task | Result | Evidence |
| --- | --- | --- |
| T001 | COMPLETED | Gate, runtime policy, route, and public Supabase variable presence inspected; no environment values printed. |
| T002 | COMPLETED | Focused gate/security suite: 14 passed, 0 failed. |
| T003 | COMPLETED | Fixed server gate opened; invalid callbacks retain the safe denial; no Supabase privilege is granted. |
| T004 | COMPLETED | Owner decision record states public unauthenticated access through existing `anon` permissions and the no-Docker/no-direct-`pg` boundary. |
| T005 | COMPLETED | Guardrail registry test passed 1/1; unregistered operation and SQL-shaped extra input were denied. |
| T006 | COMPLETED | Full suite, lint, and build results are recorded in the requirements checklist and SDD gates. |
| T007 | COMPLETED | `git diff --check` exited 0; 22 production assets scanned, with no sentinel match or server-only marker. |
| T008 | COMPLETED | This FR/SC/task audit is read-only with respect to product code. |

| Required gate | Result | Recorded evidence |
| --- | --- | --- |
| `full_test_suite` | PASSED | `npm test`, exit 0; 373 tests, 370 passed, 3 skipped. |
| `lint` | PASSED | `npm.cmd run lint`, exit 0 (`oxlint`). The initial `npm run lint` wrapper produced an RTK JSON EOF parse error; the direct npm invocation verified the same package script. |
| `production_build` | PASSED | `npm run build`, exit 0; Vite transformed 165 modules. |
| `client_boundary` | PASSED | `git diff --check` and the production asset scans exited 0. |
| `final_audit` | PASSED | `sdd_record_gate` recorded this audit after the report was written; the immutable manifest hash matched and all four prior required gates passed. |

Two correction attempts were recorded and resolved: one adjusted a test's denial-envelope expectation; the other verified lint after an RTK output-adapter parse error. The SDD status reported two attempts, 32 unioned fix seconds, and no unresolved failure at the time of this audit.

## Scope conclusion

SPEC-001@3's executable tasks and required gates are complete. SC-001's live agent-to-Supabase behavior and the chat disclosure portion of SC-002 remain explicitly deferred to the next owning SPECs; this report does not claim those runtime/UI behaviors passed. No schema/grant/RLS change, Docker, direct Node `pg`, privileged product credential, or deployment was introduced.
