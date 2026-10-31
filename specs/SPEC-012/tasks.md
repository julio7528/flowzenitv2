# Tasks: FlowZenit Agent Chat

**Input**: `spec.md`, `plan.md`, the existing React/Vite shell, and the agent API contract.
**Execution**: Only through the exact approved SDD batch containing SPEC-012@2.

## Setup

- [ ] T001 Inspect `src/App.jsx`, existing page styles, and `POST /api/agent/turn`; record the route and response fields used by the chat.

## US1 — Ask a question in chat

- [ ] T002 [US1] Add API adapter tests in `tests/unit/chat/agent-api.test.js` for request bounds, response shape, safe errors, cancellation, and no browser Supabase/model call.
- [ ] T003 [US1] Implement the same-origin request/response adapter in `src/lib/agentApi.js`; reject malformed response objects and preserve distinct empty, failed, cancelled, and incomplete outcomes.
- [ ] T004 [US1] Add the chat page and message rendering in `src/pages/ChatPage.jsx`, including source references rendered as safe text/links and an explicit POC data-flow notice.
- [ ] T005 [US1] Add navigation to the chat page in `src/App.jsx` while preserving all existing routes and page behavior.
- [ ] T006 [US1] Add responsive chat styles in `src/pages/ChatPage.css` for 1440, 820, and 390 pixel widths, keyboard focus, and reduced-motion preference.

## US2 — Create an item through chat

- [ ] T007 [US2] Add chat state tests in `tests/unit/chat/chat-state.test.js` for active-session context bounds, duplicate-submit prevention, clarification, confirmed create, and uncertain write outcomes.
- [ ] T008 [US2] Implement in-memory transcript/context and pending/error/result states in `src/pages/ChatPage.jsx`; send bounded context through `src/lib/agentApi.js` and never persist it to storage or URL.
- [ ] T009 [US2] Run `npm test`, focused chat contracts, `npm run lint`, and `npm run build`; record actual outcomes in the SDD gates and `specs/SPEC-012/quickstart.md`.
- [ ] T010 [US2] Run the local browser smoke described in `plan.md`; record navigation, query/evidence, create/uncertain, keyboard, and responsive-width results in `specs/SPEC-012/quickstart.md` without deploying.
- [ ] T011 [US2] Inspect `git diff --check` and the browser build; record the client-boundary result in `specs/SPEC-012/quickstart.md`.
- [ ] T012 Perform a read-only FR/SC/task audit and record the final conformance report in `specs/SPEC-012/checklists/final-audit.md`.

## Dependencies and execution order

- T001 precedes all story work. T002–T006 deliver chat question/answer. T007–T008 add active-session context and action lifecycle. T009–T012 are final gates.

## Independent acceptance

- The user can open chat and ask a grounded question through the existing API.
- The UI displays available evidence and honest loading/empty/error/uncertain states.
- A single clear task, subtask, or routine create can be requested without leaving the chat.
- The active transcript exists only in memory and the POC disclosure is visible.
