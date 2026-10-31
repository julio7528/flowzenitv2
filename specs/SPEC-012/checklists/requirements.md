# SPEC-012 requirement checklist

Current POC scope for immutable candidate version 2. Fill each evidence cell and mark the checkbox only after implementation evidence exists.

| Complete | Requirement | Evidence |
| --- | --- | --- |
| [x] | FR-001 | `/interno/chat` route and navigation in `src/App.jsx`; local browser smoke. |
| [x] | FR-002 | Same-origin adapter in `src/lib/agentApi.js`; adapter and client-boundary tests. |
| [x] | FR-003 | Eight-message/8,192-byte bounds in `src/lib/agentApi.js` and `src/lib/chatState.js`; tests plus no-storage browser check. |
| [x] | FR-004 | Outcome/evidence rendering in `src/pages/ChatPage.jsx`; chat contract tests and browser states for sources, empty, clarification, failure, cancellation, and uncertainty. |
| [x] | FR-005 | Exact server-confirmed create state in `src/lib/chatState.js`; production-route contract and synthetic browser confirmation; uncertain response never reports success. |
| [x] | FR-006 | POC data-flow disclosure in `src/pages/ChatPage.jsx`; visible in browser smoke. |
| [x] | FR-007 | Responsive and keyboard styles in `src/pages/ChatPage.css`; browser checks at 1440/820/390 px and Enter submission. |
| [x] | FR-008 | In-memory-only state; no chat URL/storage keys in browser smoke; `tests/security/agent/client-boundary.test.js` and built-asset scan. |
| [x] | SC-001 | Route, question, bounded adapter, and source evidence verified by browser smoke and API tests. |
| [x] | SC-002 | Production route contract verifies task create/readback; UI confirmation is driven only by the server-composed response. |
| [x] | SC-003 | Clarification and uncertain network states verified in reducer tests and browser smoke; no optimistic success state. |
| [x] | SC-004 | No chat storage keys or transcript URL state; disclosure visible in browser smoke. |
| [x] | SC-005 | Full suite, chat contracts, lint, production build, browser smoke, and client-boundary checks passed. |
