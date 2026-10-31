# SPEC-002@3 — final conformance audit

**Batch:** `d17d161a-0b66-4ea3-a5c0-471d10b9ba20`  
**Approved manifest hash:** `1c1794b51512acf0d098c2c54c06f343458ec3b3d6f8e0e6d88541014a7b77c3`  
**Run:** `320f62c1-e85f-4380-8964-498c8567d23a`  
**Audit date:** 2026-10-30

## Functional requirements

| Requirement | Result | Evidence and scope |
| --- | --- | --- |
| FR-001 | PASS | `api/agent/turn.js` default export lazily composes the bounded production graph. `tests/contracts/agent/production-route.test.js` exercises that default route through a mocked DeepSeek response and verifies a bounded successful response. |
| FR-002 | PASS | The route reads the provider key through the server-only configuration module and builds the existing DeepSeek adapter. Adapter, timeout, retry, and response bounds are covered by agent runtime contracts. No provider credential is imported into browser code. |
| FR-003 | PASS | `activeChatMessages` accepts at most eight strict user/assistant messages with nonempty text. Request parsing enforces the existing 8,192-byte limit. `tests/unit/agent/active-chat-context.test.js` checks count, roles, content, extra fields, and exact UTF-8 byte boundaries. |
| FR-004 | PASS | The current policy and graph allow only the six registered typed read tools. `searchItems` is the textual Supabase retrieval tool; exact facts remain on structured SPEC-004 reads. The later manifest SPECs own any additional write capabilities. |
| FR-005 | PASS | Tool names and arguments are registry/schema validated. Arbitrary SQL, `setDatabasePermissions`, and unknown tool names are rejected before a handler or database call. The route uses the Supabase JS/PostgREST path and public key configuration; no direct `pg`, service-role key, or unrestricted dispatch is wired. |
| FR-006 | PASS | Active chat and retrieval text are explicitly treated as untrusted model context. Security tests prove they cannot add tools, select SQL, or authorize an unsupported mutation. |
| FR-007 | PASS | LangSmith tracing switches are forced off in server configuration. No prompt, active-chat, retrieval, or raw provider content is logged by the route/runtime; safe logging/error contracts retain only approved metadata. |
| FR-008 | PASS | The route returns bounded structured outcomes and generic safe errors. Tool evidence comes from registered read results. The production route contract test verifies the terminal response shape. |

## Success criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| SC-001 | PASS | The actual default route, production graph, server configuration, and DeepSeek adapter complete a request against a mocked DeepSeek HTTP response. No live provider smoke request was sent, as the quickstart explicitly excludes one without separate authorization. |
| SC-002 | PASS | Registry, graph, and executor tests enforce the server-owned typed tool list and registered versions. |
| SC-003 | PASS | Runtime/security contracts cover prompt injection, malformed and unknown proposals, provider failure, timeout, cancellation, and oversized request/response behavior. |
| SC-004 | PASS | Active chat is carried only in the current request/graph state. It is not loaded from or written to a conversation store, browser storage, or trace service. |
| SC-005 | PASS | Full test suite, focused contracts, lint, and production build all passed with recorded exit codes. |

## Task and quality-gate audit

- Tasks T001–T011 are `COMPLETED` in the active SDD run.
- Required gates `full_test_suite`, `agent_runtime_contracts`, `lint`, `production_build`, and `client_boundary` are `PASSED` in SDD.
- `npm.cmd test`: 383 tests; 380 passed, 0 failed, 3 skipped; exit 0.
- Focused agent contracts: 93 passed, 0 failed; exit 0.
- `npm.cmd run lint`: oxlint exit 0.
- `npm.cmd run build`: exit 0.
- Client boundary: 22 assets scanned; synthetic sentinel hits 0; restricted server-marker hits 0; `git diff --check` exit 0.
- `node scripts/sdd/sddctl.js validate d17d161a-0b66-4ea3-a5c0-471d10b9ba20`: valid; manifest mismatches 0; current hash matches the approved hash.
- Two recorded command/test corrections were resolved. The active SDD run has no unresolved failures.

## Limits of this evidence

The production-route integration test uses synthetic configuration and a mocked provider response; it does not contact DeepSeek or issue a live Supabase read. Database reads continue through the typed Supabase JS/PostgREST repository when a registered read tool is invoked. No database schema, grants, RLS, deployment, Docker, local PostgreSQL, or direct database driver was changed or used.
