# Specification: Local Vite Agent API

**SPEC ID**: `SPEC-017`  
**Version**: `2`  
**Dependencies**: [SPEC-001, SPEC-012]  
**Risk**: `medium`  
**Feature Branch**: `SPEC-017`  
**Created**: 2026-10-30  
**Status**: Draft  
**Input**: Make the chat work with the normal `npm run dev` command by connecting its same-origin API call to the existing agent handler and configured Supabase project, without Docker or a local database.

## Scope and Exclusions

### In scope

- Serve the chat UI and existing `POST /api/agent/turn` handler from the normal Vite development server.
- Reuse the existing agent, DeepSeek, and Supabase behavior and response contract.
- Load server configuration for local development without exposing provider credentials to browser code.
- Verify a read-only chat question against the configured Supabase project.

### Explicitly out of scope

- Changes to the deployed Vercel API route or production behavior.
- Docker, local PostgreSQL, a direct database URL, or a second local backend command.
- Database schema, grants, RLS, or Supabase project changes.
- New chat capabilities or changes to existing write authorization.
- Real database writes as part of validation.

## Contracts and Constraints

- **Existing contracts**: Keep the same-origin `POST /api/agent/turn` request and response contract in `specs/SPEC-012/contracts/chat-client.md` and the existing handler in `api/agent/turn.js`.
- **Compatibility**: `npm run dev` serves the SPA and the agent route on the same origin. Existing Vite page routes and production builds continue to work.
- **Security and data handling**: Provider secrets remain in the Node development process. They must not enter `import.meta.env`, client `define` values, browser responses, or build assets. The existing public Supabase key and access policy remain unchanged.
- **Dependencies**: [`SPEC-001`, `SPEC-012@2`]. No new package or database dependency.

## User Scenarios & Testing

### User Story 1 - Ask the chat a question in local development (Priority: P1)

The owner starts the application with `npm run dev`, opens the chat, and asks “O que está pendente?”. The chat reaches the existing agent handler, which uses the configured DeepSeek provider and Supabase data to return its normal answer and available evidence.

**Why this priority**: The chat currently shows a generic failure in the developer's normal local workflow, so its primary use is unavailable there.

**Independent Test**: Start only `npm run dev`, open `/interno/chat`, submit a read-only question, and observe a valid agent response produced through the existing API contract.

**Acceptance Scenarios**:

1. **Given** the configured local Supabase and DeepSeek variables, **When** the owner asks a read-only question in chat, **Then** the browser receives the existing JSON response from `/api/agent/turn` and displays its answer and any evidence.
2. **Given** a non-agent SPA route, **When** it is opened or refreshed, **Then** Vite continues to serve the existing application page.
3. **Given** the agent route receives an unsupported method or invalid request, **When** it responds, **Then** the browser receives the existing safe JSON error contract rather than Vite HTML or JavaScript.

### Edge Cases

- Server configuration is missing or invalid: the API returns a safe JSON error and does not expose values or stack traces.
- The existing handler cannot be loaded: the bridge returns a generic safe JSON failure, not an HTML error page.
- A request targets a path other than `/api/agent/turn`: the bridge passes it to the existing Vite middleware chain.
- The Vite server restarts: the route remains available without a separate service or manual API process.

## Requirements

### Functional Requirements

- **FR-001**: `npm run dev` MUST serve both the existing React/Vite UI and the same-origin `/api/agent/turn` endpoint.
- **FR-002**: The development endpoint MUST invoke the existing `api/agent/turn.js` handler and preserve its request, status, response-body, and safe-error contracts.
- **FR-003**: The development bridge MUST intercept only the agent API path and MUST leave all other Vite routes and assets unchanged.
- **FR-004**: The development API MUST return JSON for agent-route success and failure; it MUST NOT fall through to the SPA fallback for that route.
- **FR-005**: Server-only configuration from the existing local environment files MUST be available to the Node handler while remaining absent from browser runtime values and production client assets.
- **FR-006**: The solution MUST use the existing Supabase project and current agent integration; it MUST NOT require Docker, local PostgreSQL, a direct database URL, a second development command, or a new package.
- **FR-007**: The solution MUST NOT change the deployed Vercel function, database schema, database permissions, current write policy, or existing chat behavior.
- **FR-008**: The acceptance smoke MUST use a read-only question and MUST NOT create or modify Supabase records.

## Key Entities

- **Agent API request/response**: Existing in-memory HTTP exchange between the chat client and `api/agent/turn.js`; no new persisted entity is introduced.
- **Local server configuration**: Existing environment values available only to the Node development server.

## Success Criteria

### Measurable Outcomes

- **SC-001**: With the existing provider and Supabase configuration present, the owner can start the app with one command, `npm run dev`, and receive a chat answer from a read-only question.
- **SC-002**: Every tested response from `/api/agent/turn`, including malformed input and unsupported methods, is JSON and follows the existing API error contract.
- **SC-003**: All existing SPA routes continue to load, and `npm run build` remains successful without adding an API server to production assets.
- **SC-004**: No provider credential is found in the browser bundle or returned to the browser by the development bridge.
- **SC-005**: Validation makes zero database writes and requires no Docker or local PostgreSQL service.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | `npm run lint` | Exit 0 with no new diagnostics. |
| Build | Yes | `npm run build` | Exit 0; production build remains client-only as before. |
| Unit/contract tests | Yes | Focused bridge tests and `npm test` | Request forwarding, response forwarding, safe errors, route isolation, and secret-boundary cases pass. |
| Supabase smoke | Yes | Start `npm run dev`; ask one read-only question at `/interno/chat` | Actual answer from the configured agent/Supabase path; no row writes. Record outcome without credentials or private record contents. |
| Completion evidence | Yes | Read-only FR/SC review | Each item is marked PASS, FAIL, or NOT VERIFIED with actual evidence. |

## Completion Evidence

- [ ] Each acceptance criterion is marked PASS, FAIL, or NOT VERIFIED with evidence.
- [ ] Required commands and their actual exit codes are recorded.
- [ ] The local read-only chat smoke is recorded without credentials or private record contents.
- [ ] No database write, schema change, deployment, or unrelated change is included.

## Assumptions

- The user already has the existing `.env.local` values for the current Supabase project and DeepSeek provider.
- Local development may use the same current anonymous Supabase permissions as the existing agent API.
- The development bridge is a small local adapter around the existing Fetch `Request`/`Response` handler; it does not create a second agent implementation.
