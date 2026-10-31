# Final Audit — SPEC-017@2

**Audited**: 2026-10-30  
**Batch**: `6eaea72f-608c-46c3-9d4d-1d150da41798`  
**Manifest hash**: `585bb0e583f2fa94c7753faca99695b3becfb853c1ccaea4b2235d1a36891797`  
**SPEC snapshot hash**: `5bbb5b089d37f228f3fa833c51791b80adde90e7762835359563c94d9d3c022e`

## Requirement conformance

| Requirement | Result | Evidence |
| --- | --- | --- |
| FR-001 | PASS | Vite development server returned the chat page at `/interno/chat` and handled same-origin `/api/agent/turn`; default-port malformed POST returned JSON 400. |
| FR-002 | PASS | `server/dev/agentApiDevMiddleware.js` adapts Node HTTP to the existing `api/agent/turn.js` Fetch handler; focused tests passed 3/3. |
| FR-003 | PASS | Focused test verified unrelated paths reach the next Vite middleware without loading the agent handler. |
| FR-004 | PASS | Invalid input returned `400 application/json`; the real request retries returned valid JSON terminal responses. |
| FR-005 | PASS | The config copies only allowlisted server environment values; static `envPrefix: 'VITE_'` remains in place. Security boundary tests passed, and 24 client assets had zero synthetic sentinel matches. |
| FR-006 | PASS | No package, Docker, local PostgreSQL, direct database URL, or database setup was added. |
| FR-007 | PASS | The bridge is registered by Vite's `serve` plugin only. No Vercel handler, Supabase schema, grant, RLS, or access policy was changed. |
| FR-008 | PASS | Acceptance used a read-only question. No create/update request or database write was issued. |

## Success criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| SC-001 | PASS | Local Vite bridge returned HTTP 200 `needs-clarification`, then HTTP 200 `completed` for read-only requests. |
| SC-002 | PASS | The malformed-input contract returned JSON 400; successful and clarification responses were JSON terminal DTOs. |
| SC-003 | PASS | `/interno/chat` returned HTTP 200 and `npm run build` exited 0 with 170 modules transformed. |
| SC-004 | PASS | `envPrefix` stayed `VITE_`; client-boundary test passed and the client asset scan found no synthetic sentinel. |
| SC-005 | PASS | No write request was sent. No Docker or local database was started. |

## Quality gates

| Gate | Result | Evidence |
| --- | --- | --- |
| `focused_bridge_contract` | PASS | `node --test tests/unit/dev/agentApiDevMiddleware.test.js`, exit 0; 3 passed. |
| `full_test_suite` | PASS | `npm.cmd test -- --test-reporter=dot`, final run exit 0; no failed tests. |
| `lint` | PASS | `npm.cmd run lint`, exit 0. |
| `production_build` | PASS | `npm.cmd run build`, exit 0; Vite 8.3.5, 170 modules. |
| `client_boundary` | PASS | `node scripts/security/scan-client-assets.js dist` with process-only synthetic sentinel, exit 0; 24 assets, zero matches. |
| `supabase_read_only_smoke` | PASS | Vite default route returned JSON 400 for malformed input; valid read-only retries returned HTTP 200 `needs-clarification` and `completed`. No response text or record contents were retained. |
| `final_audit` | PASS | This read-only FR/SC/task review found no remaining implementation work in SPEC-017's scope. |

`git diff --check` exited 0.

## Correction record

- The first full-suite run failed because an existing boundary test expects `envPrefix` to remain a static config property. The config was adjusted to keep that property static and load server env through a serve-only plugin. The focused boundary tests then passed 7/7 and the final full suite passed. SDD recorded one resolved correction attempt (13 seconds).
- The first valid live read-only turn returned HTTP 500 `failed`; retries on the same route returned HTTP 200 `needs-clarification` and HTTP 200 `completed`. SDD recorded one resolved, non-reproducing correction attempt (13 seconds). No deterministic Vite bridge defect was found for this response.
- Total: two correction attempts across separate failures, 26 seconds unioned SPEC correction time, no unresolved failure, under both configured limits.

## Disposition

All SPEC-017 tasks and required gates are complete. The local chat now reaches the existing agent API through `npm run dev`; a transient agent-turn failure occurred once during smoke and was not reproduced on retry. No deployment or version-control publication was performed.
