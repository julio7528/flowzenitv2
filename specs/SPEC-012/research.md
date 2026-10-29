# Research: SPEC-012 Chat Interface

**Status**: Draft research record. Findings are limited to the current checkout and existing Draft contracts; recommendations below are proposals, not approvals.

## Current repository findings

- The product is a React/Vite JavaScript application using React Router. `src/App.jsx` defines the internal navigation shell, lazy-loaded pages, and a passkey check stored in `sessionStorage`.
- That client passkey is not a server-verifiable identity. It cannot authorize the agent API, private history, or a mutation. The route may control navigation only.
- `src/lib/supabase.js` is a browser-side Supabase client. The chat must not use it for agent turns, history, provider calls, or privileged actions.
- Existing styles include responsive navigation, accessible dialogs, live status patterns, and a focus-management hook. The chat can follow these conventions without adding a UI framework.
- `package.json` has React, React Router, Vite, Oxlint, and Node's built-in test runner. No chat/streaming state library or Playwright E2E dependency is declared. No chat route or server API is present.
- Existing routes and product domain remain additive. SPEC-002/003/004/005/006/007 define the server-side runtime, history, query, guardrail, write, and temporal boundaries.

## Decisions and rationale

### Keep a thin same-origin client adapter

- **Decision**: The chat page communicates only through a feature-level client adapter to the server contracts owned by SPEC-002 and SPEC-003.
- **Rationale**: The existing browser contains database access code and a client passkey; a thin adapter prevents the chat from turning these into a false security boundary and keeps runtime changes outside React components.
- **Alternative considered**: Call Supabase or model vendors directly from the page. Rejected because it would expose protected data/capabilities and conflict with DEC-001 and project security principles.

### Keep UI state separate from durable conversation data

- **Decision**: Component/state data are transient view models. SPEC-003 owns history/checkpoint storage and lifecycle.
- **Rationale**: Checkpoints, conversation messages, audit records, and SDD control-plane records have different purposes and policies. The browser must not persist private transcripts while DEC-001/005 are unresolved.
- **Alternative considered**: Local storage for offline transcript continuity. Rejected because it creates an unapproved private data store and complicates deletion/retention.

### Use structured evidence for exact facts

- **Decision**: Status, dates, times, counts, and exact hierarchy facts are presented from SPEC-004 structured results. Semantic RAG is optional and only used when the server contract identifies grounded evidence.
- **Rationale**: SPEC-009 explicitly keeps RAG from replacing transactional queries. The current product data is mostly short labels, so vector search has no assumed value.
- **Alternative considered**: Use a single LLM/RAG answer path for all questions. Rejected because stale/semantic retrieval cannot establish exact current transactional values.

### Treat streaming as a capability, not a UI prerequisite

- **Decision**: The base interface handles buffered terminal outcomes. Progress/streaming is conditional on DEC-010 and an approved SPEC-002 event contract.
- **Rationale**: Runtime, hosting region, execution limits, and stream transport have not been approved. A buffered path can still provide explicit pending, timeout, cancellation, and terminal states.
- **Alternatives considered**: Commit to SSE, WebSocket, or provider token streaming now. Deferred because this would choose runtime/transport policy that belongs to DEC-010/SPEC-002.

### Confirmation display is not confirmation policy

- **Decision**: Render a typed proposal supplied by the server, but let SPEC-005's approved policy determine whether a live action can proceed. An unresolved DEC-009 matrix denies live writes.
- **Rationale**: UI copy and a button cannot authorize an action; payload and preconditions must be revalidated server-side.
- **Alternative considered**: Hard-code a risk matrix in the chat. Rejected because DEC-009 remains pending and policy belongs to SPEC-005.

## Open decisions retained

| Decision | Still open | Planning impact |
| --- | --- | --- |
| DEC-001 | A suitable server-side access control for private agent capabilities is not approved or implemented. | Keep private API, history, and privileged actions disabled. The plan does not invent an access solution. |
| DEC-005 | Retention, deletion, export, and sharing/lifecycle rules. | No real persisted conversation history or continuity until approved. |
| DEC-006 | Fields sent to DeepSeek/Gemini/LangSmith, redaction, opt-out, region, and vendor retention. | No real FlowZenit content sent to external providers. |
| DEC-009 | Confirmation matrix per operation. | No live mutation; use synthetic fixtures for UI lifecycle. SPEC-005's grant is only a proposal. |
| DEC-010 | Server runtime, region, execution length, background work, and stream transport. | No transport or streaming guarantee selected. |
| DEC-011 | Exact model/configuration choices. | The UI accepts normalized server outputs; it selects no model. |
| DEC-012 | Abuse and operational limits/budgets. | Numeric request, message, retry, and rate limits are not set by this UI plan. |
| DEC-013 | Bare weekday and “next week” semantics. | Display a clarification state when the temporal resolver cannot safely resolve the request. |

## Validation dependencies

- Browser/API response contracts should be tested against synthetic server fixtures until the DEC-001 gate is implemented and verified.
- Conversation history tests must use a synthetic lifecycle policy; they must not imply a production retention duration.
- Action tests use a versioned synthetic confirmation matrix with `allow`, `deny`, and `require confirmation` cases. This matrix proves UI behavior only and does not approve real policy.
- The planned E2E command requires a Playwright dependency that is not currently declared. Adding that package is an implementation planning decision outside this Draft document.
- SC-001's 90% target is measurable in principle, but evaluator population, sample size, and run protocol are not specified. Agree on those before treating the percentage as a release gate; this plan does not choose them.
- No dependencies were installed, no tests were run, and no provider/database operations were performed for this research.
