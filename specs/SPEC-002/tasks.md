# Tasks: Agent Runtime and DeepSeek Integration

**Input**: `spec.md`, `plan.md`, the existing agent runtime, and the SPEC-001 POC gate.
**Execution**: Only through the exact approved SDD batch containing SPEC-002@3.

## Setup

- [ ] T001 Inspect the existing route, graph, provider adapter, and limit definitions in `api/agent/turn.js`, `server/agent/runtime/`, and `server/agent/model/deepseek.js`; do not print environment values.

## US1 — Ask about current FlowZenit data

- [ ] T002 [US1] Add route-policy tests in `tests/contracts/agent/turn-flow.test.js` proving the production route uses the server-owned POC policy and rejects malformed/oversized requests.
- [ ] T003 [US1] Update `server/agent/runtime/capabilities.js` to allow only provider, Supabase, and registered-tool capabilities covered by the active POC policy.
- [ ] T004 [US1] Connect the configured production graph in `api/agent/turn.js` while preserving bounded parsing, safe terminal responses, timeout, cancellation, and server-only provider credentials.
- [ ] T005 [US1] Verify typed read and SPEC-009 retrieval tool registration through `server/agent/tools/registry.js` and `server/agent/runtime/build-graph.js`; unregistered names remain rejected.

## US2 — Clarify and carry out an explicit POC action

- [ ] T006 [US2] Add strict active-chat context tests in `tests/unit/agent/` for at most 8 prior user/assistant messages, content validation, the 8,192-byte total body limit, and rejection of extra fields.
- [ ] T007 [US2] Extend `server/agent/runtime/state.js` to accept only a bounded active-session message list as untrusted context; do not add database or browser-storage persistence.
- [ ] T008 [US2] Update `server/agent/runtime/build-graph.js` to pass the validated active-session context to the model while keeping tool authorization independent of that context.
- [ ] T009 [US2] Add security tests in `tests/security/agent/` proving active-chat and retrieved prompt injection cannot add tools, select arbitrary SQL, or authorize an unsupported mutation.
- [ ] T010 [US2] Run `npm test`, the focused agent runtime/security contracts, `npm run lint`, and `npm run build`; record actual outcomes in the SDD gates and `specs/SPEC-002/quickstart.md`.
- [ ] T011 Perform a read-only FR/SC/task audit and record the final conformance report in `specs/SPEC-002/checklists/final-audit.md`.

## Dependencies and execution order

- T001 precedes the work. T002–T005 establish a working read path; T006–T009 add bounded chat context and preserve tool boundaries. Complete before SPEC-005/006/007 extend the registry.

## Independent acceptance

- The configured provider serves the production route with bounded typed tools.
- Current-session context is bounded and ephemeral; no earlier or separate conversation is loaded.
- All side effects require the owning SPEC's registered typed tool and policy.
