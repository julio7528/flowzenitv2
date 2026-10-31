# Tasks: Local Vite Agent API

**Input**: `spec.md`, `plan.md`, `research.md`, `contracts/dev-agent-api.md`, and `quickstart.md`.
**Prerequisites**: SPEC-017@2 is Draft. Implementation is allowed only through an exact approved SDD batch.
**Tests**: Focused middleware contract tests, existing project suite, and a read-only live Supabase chat smoke.
**Organization**: One P1 story; tasks are sequential because they share the Vite route/config boundary.

## Phase 1: Setup

- [ ] T001 Review the existing handler and chat contract in `api/agent/turn.js` and `specs/SPEC-012/contracts/chat-client.md` before changing the dev server.

## Phase 2: User Story 1 - Ask the chat a question in local development (P1)

**Independent test**: Start `npm run dev`, send a valid read-only question through `/interno/chat`, and receive a JSON answer from the existing handler using the configured Supabase project.

- [ ] T002 [US1] Add focused request/response, safe-error, and route-passthrough tests in `tests/unit/dev/agentApiDevMiddleware.test.js`.
- [ ] T003 [US1] Implement the dev-only Fetch handler bridge in `server/dev/agentApiDevMiddleware.js`, preserving the existing API response contract.
- [ ] T004 [US1] Wire the development middleware and server-only environment loading into `vite.config.js` while keeping `envPrefix: 'VITE_'` and adding no client secret definitions.
- [ ] T005 [US1] Run `node --test tests/unit/dev/agentApiDevMiddleware.test.js`, `npm test`, `npm run lint`, and `npm run build`; record each actual result in `specs/SPEC-017/quickstart.md`.
- [ ] T006 [US1] Perform the read-only Supabase smoke from `specs/SPEC-017/quickstart.md`; record the response state and confirm no rows were changed.
- [ ] T007 [US1] Review the SPEC-017 diff and complete `specs/SPEC-017/checklists/final-audit.md` against each FR, SC, and acceptance scenario.

## Dependencies and execution order

- T001 establishes the existing API contract. T002 precedes T003/T004. T005 depends on the bridge implementation. T006 and T007 are final verification tasks.
- No tasks are parallelizable; they share the Vite dev-server boundary.

## Implementation strategy

Deliver only the local route bridge, verify it through deterministic tests, then demonstrate the configured real Supabase read path without database writes. Keep all production and database behavior unchanged.
