# Implementation Plan: FlowZenit Agent Chat Interface

**SPEC ID**: `SPEC-012` | **Version**: `1` | **Manifest hash**: N/A (no batch created)

**Branch**: `main` preserved | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Status**: Draft planning proposal. This document does not approve the SPEC, a batch, an API, an authentication mechanism, or a provider/data policy.

## Summary

Add a responsive chat route to the existing React/Vite application. The browser owns presentation and transient interaction state; a same-origin client adapter calls the server-owned agent turn API from SPEC-002. Conversation history is read through SPEC-003 contracts, exact transactional questions use SPEC-004 tools, semantic retrieval remains optional under SPEC-009, and confirmations consume only a policy-approved SPEC-005 contract. The existing passkey remains a navigation gate and is not server-verifiable identity. Until the SPEC-001 access-control gate is implemented and verified, private history, private domain reads, and privileged writes stay unavailable. Real conversation persistence and provider disclosure remain subject to DEC-005 and DEC-006.

## Technical Context

**Language/Version**: Existing JavaScript ES modules and React 19 application; browser targets follow current Vite build configuration.

**Primary Dependencies**: Existing `react`, `react-dom`, `react-router`, and Vite. Do not add a chat, streaming, state, or E2E package as part of this plan. Playwright is not currently declared and would require a separately reviewed implementation dependency.

**Storage**: No chat storage in the browser. Durable history/checkpoints belong to SPEC-003 and remain gated by DEC-001/DEC-005. No browser-local transcript persistence is proposed.

**Testing**: Existing Node test runner for pure state/formatting modules; component and API contract tests need an implementation-level harness decision. E2E is required by the SPEC; Playwright is absent from `package.json` and remains a dependency to resolve before implementation. Use synthetic fixtures only.

**Target Platform**: Existing Vite single-page application in the browser plus the server-side API/runtime contracts owned by SPEC-001/002/003/005. No server/API implementation is assigned to this SPEC.

**Project Type**: Existing single-project React web application.

**Performance Goals**: No numeric latency target is approved. Show an explicit pending state immediately, do not render stale or unverified mutation success, and keep controls usable while a request is pending. Numeric timeouts, message limits, payload limits, and rate limits remain governed by DEC-010/DEC-012 and the owning API SPECs.

**Constraints**: Preserve current routes and visual system; no provider credentials, direct browser provider calls, direct browser Supabase calls, raw SQL, or client-side authorization claims. Do not introduce users, tenants, organizations, or a separate appointment entity. Render all presented local dates/times with `America/Cuiaba` context. User-visible success requires an acknowledged durable result.

**Scale/Scope**: Single-owner product UI. This plan does not define sharing, multi-user behavior, a new auth/session design, conversation retention, provider disclosure, a public API, or a new domain model.

## Constitution Check

| Gate | Result | Evidence / constraint |
| --- | --- | --- |
| Preserve existing product behavior | PASS | Add one route/navigation entry within the existing React/Vite shell; existing pages and domain flows remain unchanged. |
| User-controlled scope | PASS | Draft-only documentation; no batch, approval, API path, package, or implementation is authorized here. |
| Security and data protection | PASS WITH BLOCKERS | Browser is a presentation client only. DEC-001 private-data gate is mandatory; passkey/sessionStorage do not authorize server requests. No private request or mutation is enabled before the gate. DEC-005/006 remain open. |
| Tests accompany design | PASS | Synthetic unit, contract, integration, E2E, accessibility, and security cases are specified; no test is claimed to have run. |
| Durable and auditable execution | PASS | UI idempotency state and terminal outcomes refer to SPEC-002 ExecutionLedger and SPEC-010 audit contracts; chat does not own either store. |
| Bounded correction | N/A | Applies to a future approved SDD batch, not this planning activity. |
| Small, reviewable changes | PASS | Feature paths are limited to chat UI/client adapter and tests; API/runtime, history storage, tools, confirmation policy, and domain handlers remain owned by dependent SPECs. |
| Manual publication | PASS | No commit, push, merge, deploy, reset, or discard. |

## Dependencies and Contracts

- **Prerequisite SPECs**: SPEC-002 turn/runtime; SPEC-003 history/checkpoint lifecycle; SPEC-004 exact structured reads; SPEC-005 guardrails and confirmation lifecycle; SPEC-006 write tools; SPEC-007 temporal resolution. SPEC-001 owns the access boundary. SPEC-009 owns optional semantic retrieval and its quality gate. SPEC-010 owns correlation/audit event contracts. SPEC-011 is a separate observability dashboard and is not embedded in the chat.
- **API/data contracts**: The UI adapter consumes the candidate SPEC-002 `agent-turn` contract and SPEC-003 `conversation-history` contract. It maps typed outcomes to view state and does not define endpoint paths or HTTP codes. Action proposals follow SPEC-005 canonical action/payload/precondition semantics; the current one-time grant is only a technical proposal. SPEC-006/007 provide domain outcomes. Source references follow SPEC-004/009. Contracts under this SPEC are presentation/client boundaries only.
- **Security boundary**: Browser route access through the existing passkey is navigation state only. Server access control is independent. With DEC-001 unmet, no private API request may return private content or existence/count metadata, no provider call may receive real FlowZenit content, and no write capability may be registered. The closed state may display a generic disabled notice or deterministic synthetic fixture only. No passkey value, sessionStorage value, conversation ID, confirmation click, or client-generated assertion grants access.
- **Database changes**: None owned here. No migrations, Supabase changes, or direct browser database access. SPEC-003 owns any future history persistence proposal; DEC-005 must precede activation.
- **Out-of-scope files/systems**: No production source edits during planning; no changes to `src/lib/supabase.js`, database schema, RLS, Vercel runtime, provider configuration, SDD supervisor, or `sdd.*` ledger. In future implementation, runtime/API server paths remain owned by SPEC-001/002/003/005.

## Architecture Proposal

1. **Route and shell**: Add a lazy-loaded chat page and a navigation item under the existing internal React Router shell. The existing access screen is preserved but is not described as server authentication. Chat API capability state is fetched/returned by the server contract, not inferred from route access.
2. **Feature components**: Keep conversation list, transcript, composer, status/outcome banner, source references, and action proposal presentation as small presentational components. A feature-level state module owns selection, optimistic user message display, request lifecycle, cancellation UI, and retry/reconcile affordances. It does not store transcripts across reloads.
3. **Client adapter**: A same-origin `agentApi` adapter calls only contracts from SPEC-002/003. It validates known response shapes, ignores unknown optional fields, and fails closed on unknown required schema versions. Requests include message content and opaque conversation grouping only; never owner IDs, roles, passkey results, credentials, SQL, provider selection, or arbitrary tool names.
4. **Turn lifecycle**: The client sends one turn, disables duplicate submission while pending, and associates the reply with a server-generated `turnId`/`correlationId`. On network ambiguity it shows `pending verification` and asks the server/runtime ledger for safe status before allowing a replay. A browser retry does not imply the prior mutation failed.
5. **History**: Conversation list and pages come through SPEC-003 only after both the access gate and DEC-005 lifecycle policy permit them. Checkpoint payloads, graph state, tool arguments/results, prompts, and hidden reasoning are never rendered. The UI never persists private history in localStorage/sessionStorage or URL parameters.
6. **Evidence and time**: Exact status/date/time/count facts use SPEC-004 structured query results. SPEC-009 semantic retrieval may be shown only when the server marks it enabled, grounded, and current; production vector retrieval requires measured quality evidence and an explicit decision. Source references are human-readable and link only to product records the authorized API permits. Every displayed planning/confirmation time is explicitly labelled `America/Cuiaba`.
7. **Action proposals**: Render only server-supplied canonical target, validated proposed values, known consequences, expiry if policy supplies it, and explicit cancel/confirm controls. The UI does not classify risk or issue grants. An unresolved DEC-009 matrix means live mutations are denied; synthetic fixtures may exercise the visual lifecycle. If approved policy requires confirmation, the SPEC-005 server lifecycle remains authoritative and revalidates preconditions before execution.
8. **Transport**: The client contract supports buffered terminal responses. Incremental progress/streaming is an optional adapter capability only if DEC-010 selects a runtime/transport and SPEC-002 approves the event contract. The UI must work without streaming. Never expose raw provider events, internal graph state, or unvalidated tool proposals.

## Execution and Recovery Plan

- **Sequential phases**: (1) shared client contract and closed-gate behavior; (2) read-only question/answer/source flow; (3) action proposal and safe confirmation presentation; (4) history/continuity after lifecycle/access gates; (5) responsive, accessibility, timeout, and recovery hardening.
- **Parallel tasks**: After shared view models stabilize, isolated component styling, pure state tests, and source-reference rendering can proceed in disjoint files. API adapter contract and route integration are sequential. History and action live integration cannot proceed until their policy/security gates are satisfied.
- **Agent assignments**: No agent delegation is required by this feature plan. If later used under an approved batch, UI components/tests must have disjoint exact file scopes; authorization remains sequential at the API boundary.
- **Failure fingerprints**: Distinguish `access_disabled`, `empty`, `partial`, `stale`, `provider_unavailable`, `timeout`, `cancelled`, `failed`, and `pending_verification`. Never map API failure to empty data, zero metrics, or success. Correlation IDs are display/support references, not credentials.
- **Checkpoint/recovery data**: Client memory may hold current `conversationId`, `turnId`, `correlationId`, request state, and a non-sensitive retry/idempotency reference for the active page only. Reload recovery and durable thread state belong to SPEC-002/003. Do not persist transcript, message body, action payload, grant, or private IDs in browser storage.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Existing `npm run lint` during implementation | No introduced lint findings. |
| Build/type check | Yes | Existing `npm run build` during implementation | Vite build succeeds; browser bundle contains no server/provider credentials. |
| Unit/integration | Yes | Project tests plus focused chat state and adapter tests using synthetic fixtures | Request lifecycle, duplicate submit, terminal outcomes, safe error mapping, time formatting, and response-schema rejection are covered. |
| Database/API/contracts | Yes | Isolated mock API contract tests and SPEC-002/003 integration tests | Closed gate makes zero private repository/provider/tool calls and returns no existence metadata; allowed responses follow schemas and no raw data leaks. |
| E2E/accessibility/security/evaluation | Yes | E2E at 1440/820/390; keyboard/screen-reader/manual review; Playwright only after dependency is approved | Read/source, no-result/partial, confirmation fixture, history gate, network ambiguity, focus, live announcements, and no horizontal overflow. |

No validation command has been executed as part of this documentation task.

## Decisions and Risks

- **DEC-001 APPROVED**: preserve the current passkey/access path without new authentication. Its client-side state is not server-verifiable; private reads/history and privileged operations remain blocked until an adequate access control is approved, implemented, and verified. No future mechanism is selected here.
- **DEC-005 PENDING**: retention, deletion, export, and lifecycle block real history persistence and continuity.
- **DEC-006 PENDING**: provider data fields, redaction, opt-out, location, and retention block sending real FlowZenit content to model, embedding, or tracing vendors.
- **DEC-009 PENDING**: the action confirmation matrix blocks live mutation policy. SPEC-005's one-time grant lifecycle remains an implementation proposal, not an approved authorization rule.
- **DEC-010 PENDING**: runtime, region, duration, background work, and streaming transport block selecting/activating streaming behavior.
- **DEC-011 PENDING**: model/configuration choices remain outside this UI plan.
- **DEC-012 PENDING**: rate/abuse and numeric operational limits remain unselected.
- **DEC-013 PENDING**: relative weekday and “next week” semantics can require clarification from the backend; the chat must display clarification rather than invent a date.
- **RAG utility risk**: current domain text is mostly short item names. RAG is not assumed useful or enabled until SPEC-009 demonstrates measurable gain and an explicit product decision is recorded.
- **Confirmation/mutation risk**: client controls are not authorization. An unapproved policy, changed payload/precondition, stale proposal, cancelled/expired grant, or ambiguous ledger outcome results in no live mutation.
- **E2E dependency risk**: Playwright is not installed/declared. Record it as a dependency decision in the implementation-ready plan; do not add it during this planning task.

## Project Structure

### Documentation (this feature)

```text
specs/SPEC-012/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-client.md
│   ├── chat-state-machine.md
│   └── action-proposal-view.md
└── tasks.md
```

### Proposed future source/test structure (not created by this plan)

```text
src/
├── pages/ChatPage.jsx
├── pages/ChatPage.css
├── components/chat/
│   ├── ConversationList.jsx
│   ├── MessageList.jsx
│   ├── MessageComposer.jsx
│   ├── ActionProposalCard.jsx
│   ├── SourceReference.jsx
│   └── ChatStatus.jsx
└── lib/
    ├── agentApi.js
    └── chatState.js

tests/
├── unit/chatState.test.js
├── contract/agentApi.test.js
├── integration/chatAccessGate.test.js
└── e2e/chat.spec.js              # Playwright dependency not currently present
```

**Structure Decision**: Keep chat presentation in the current React app and use existing routing/design conventions. API/runtime, history persistence, domain tools, and authorization are contracts owned by other SPECs. The paths above are implementation proposals only and do not modify the repository.

## Complexity Tracking

No constitution exception is proposed. The adapter and state module separate API uncertainty and request lifecycle from presentation; direct component-to-provider or component-to-Supabase calls would violate the security boundary.
