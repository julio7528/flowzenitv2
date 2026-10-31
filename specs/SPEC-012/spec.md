# Feature Specification: FlowZenit Agent Chat

**SPEC ID**: SPEC-012
**Version**: 2
**Dependencies**: [SPEC-001, SPEC-002, SPEC-004, SPEC-005, SPEC-006, SPEC-007, SPEC-009]
**Risk**: high
**Status**: Draft

## POC outcome

Add a working chat page to the existing React/Vite app. It connects to `POST /api/agent/turn`, supports typed FlowZenit questions and SPEC-009 Supabase text search with source references, and can create one task, subtask, or recurring template on a clear request.

The browser keeps the active chat in memory and sends only a bounded recent context with each turn. It never stores chat content in browser storage or Supabase. The agent route and current anonymous Supabase permissions are public by owner choice. The chat must explain that this is a POC and messages/relevant data are sent to the configured model.

## User scenarios

### US1 — Ask a question in chat

The user asks about current tasks, subtasks, routines, or retrieved text and gets a clear answer grounded in current Supabase results.

**Acceptance**: display evidence/source references where available; distinguish empty data, clarification, dependency failure, and incomplete results.

### US2 — Create an item through chat

The user asks to create one task, subtask, or routine and clarifies missing fields when needed.

**Acceptance**: disable duplicate submission while pending; show the created item only after Supabase confirms and reads it back; show uncertain outcomes without claiming success.

## Functional requirements

- **FR-001**: Add a chat route/navigation item inside the existing React/Vite shell without replacing current pages.
- **FR-002**: Send requests to the same-origin `/api/agent/turn`; do not call Supabase or the model directly from the chat component.
- **FR-003**: Keep the active chat context in memory only, send at most 8 prior user/assistant messages with the current turn, and stay within the API's 8,192-byte request limit. Do not persist it across reloads or sessions.
- **FR-004**: Render grounded text and source references returned by the server, with clear empty, clarification, loading, failed, cancelled, and uncertain-write states.
- **FR-005**: Support one explicit task, subtask, or recurring-template creation. Disable submit while a request is pending and never report UI submission alone as success.
- **FR-006**: Include a concise POC disclosure that the endpoint is public, existing anonymous Supabase permissions are used, and active-chat content/relevant data may be sent to the configured model.
- **FR-007**: Work at 1440, 820, and 390 pixel widths with keyboard-operable controls and visible focus.
- **FR-008**: Keep transcripts, provider credentials, passkeys, and raw errors out of browser storage, URLs, console logs, and analytics.

## Exclusions

Persistent history, conversation list, streaming, attachments, voice, direct browser-to-Supabase chat operations, deletion/edit/status/scheduling actions, and deployment are outside this POC.

## Success criteria

- **SC-001**: The user can navigate to chat, ask a question, and receive a bounded answer with available sources.
- **SC-002**: The user can create one task, subtask, or routine and sees success only after the confirmed server result.
- **SC-003**: Incomplete/ambiguous input, network failure, or denied operation never appears as successful.
- **SC-004**: Active chat remains in memory only and the public/provider disclosure is visible.
- **SC-005**: Responsive, keyboard, lint, build, and applicable automated checks pass with actual evidence.
