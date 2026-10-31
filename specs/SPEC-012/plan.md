# Implementation Plan: FlowZenit Agent Chat

**SPEC**: SPEC-012@2 · **Status**: Draft · **Date**: 2026-10-30

## Summary

Add an accessible, responsive chat page to the current application. Use the existing same-origin agent endpoint. Keep only the active chat in browser memory, send bounded recent context to the endpoint, show RAG evidence, and surface the existing one-record creation operations.

## Technical context

- React 19 and Vite 8, existing navigation in `src/App.jsx`, existing global CSS and page layout.
- The API endpoint is `POST /api/agent/turn`. Its response includes a bounded answer and evidence references.
- The browser must not call DeepSeek or Supabase from the chat page. No chat persistence, local/session storage, URL transcript, new state library, or streaming dependency is needed.
- Existing project scripts are `npm test`, `npm run lint`, and `npm run build`; no E2E dependency is currently declared.

## Design

1. Add `ChatPage` and a small `agentApi` adapter. Reuse existing typography, layout, and controls.
2. Keep transcript and active context in React memory. Send only the bounded current-session messages accepted by SPEC-002.
3. Render evidence/source labels from the API response as text and safe internal references. Do not render raw HTML or provider/tool payloads.
4. Disable send while pending, handle network ambiguity distinctly, and never map a click or pending request to a successful write.
5. Show a concise privacy/POC disclosure before or beside the composer.
6. Test responsive layout and keyboard behavior without adding an E2E dependency; record an actual browser smoke during implementation.

## Constitution check

| Principle | Application |
| --- | --- |
| I. Preserve product behavior | Keep React/Vite, Supabase, existing schema, grants, RLS, triggers, and domain rules. |
| II. User-controlled scope | Execute only the exact ordered manifest after its immutable versions and hash are approved. |
| III. Security and data protection | Keep current anon permissions unchanged, use typed server tools, protect provider secrets, and disclose the public POC boundary. |
| IV. Tests accompany the design | Run the gates listed below and record actual results. |
| V. Durable and auditable execution | Record tasks, gates, checkpoints, and outcomes in Supabase SDD. |
| VI. Bounded correction | Preserve the project correction limits and pause on a reached threshold. |
| VII. Small, reviewable changes | Implement only this SPEC in its manifest position; preserve unrelated working-tree changes. |
| VIII. Manual publication | Do not commit, push, merge, deploy, reset, or discard changes. |
## Validation gates

| Gate | Required evidence |
| --- | --- |
| `full_test_suite` | `npm test` exits 0. |
| `chat_contracts` | API adapter, message bounds, response validation, duplicate-submit, error-state, and source-rendering tests pass. |
| `lint` | `npm run lint` exits 0. |
| `production_build` | `npm run build` exits 0. |
| `chat_browser` | Run the app locally and verify navigation, question, evidence/empty state, pending/error state, create outcome, keyboard flow, and widths 1440/820/390. Record actual results; no deployment. |
| `client_boundary` | Browser source/build contains no provider credential or direct chat Supabase calls; no transcript is written to storage or URL. |
| final_audit | Read-only FR/SC and task audit, manifest/hash match, zero unresolved failures, and all required SPEC gates pass. |

## Gate waiver policies

| Gate key | Policy |
| --- | --- |
| full_test_suite | NEVER |
| chat_contracts | NEVER |
| lint | NEVER |
| production_build | NEVER |
| chat_browser | NEVER |
| client_boundary | NEVER |
| final_audit | NEVER |

## Risks and mitigations

- **Public POC and model disclosure**: show the scope and data flow plainly in the chat.
- **Uncertain create result**: display the API's uncertain outcome; do not automatically resubmit.
- **Untrusted provider/source content**: render as text and validate the API response before display.
- **Mobile layout**: keep one-column layout, flexible message widths, and no fixed-width composer.

No validation command has been run for this Draft.
