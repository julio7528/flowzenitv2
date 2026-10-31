# Feature Specification: Agent Runtime and DeepSeek Integration

**SPEC ID**: SPEC-002
**Version**: 3
**Dependencies**: [SPEC-001, SPEC-004]
**Risk**: high
**Status**: Draft

## Owner-approved POC runtime

Enable the existing `POST /api/agent/turn` route and use the already configured DeepSeek provider. The route and the current `anon` database path are public by owner choice. The provider may receive the bounded active chat context and only the typed FlowZenit data needed for the current answer. The active chat exists in browser memory only; there is no cross-session history or tracing provider.

Use LangGraph/LangChain and the existing Supabase JavaScript/PostgREST path. Keep the provider key server-side, existing request/model/tool bounds, typed tools, validation, safe errors, and prompt-injection defenses. Do not use Docker, local PostgreSQL, direct Node `pg`, `service_role`, new database grants/RLS/schema, or deployment.

## User scenarios

### US1 — Ask about current FlowZenit data

As a user, I ask a question in the chat and get an answer based on typed current reads and the existing Supabase textual RAG search.

**Acceptance**: the route runs the bounded graph and configured provider; relevant active-chat context may be sent to DeepSeek; citations/evidence come from typed tool results; errors and empty results are distinguishable.

### US2 — Clarify and carry out an explicit POC action

As a user, I clarify a missing task, subtask, or routine field and ask the agent to create it.

**Acceptance**: the runtime carries only a bounded active-chat context in the current browser session; tools receive strict schemas; a model proposal cannot select SQL, permissions, or an unregistered tool; the final response reflects the operation result.

## Functional requirements

- **FR-001**: The production route MUST run the configured bounded LangGraph turn rather than returning the closed-gate response.
- **FR-002**: The route MUST use DeepSeek with server-only credentials and enforce existing request, timeout, response, retry, and tool-call limits.
- **FR-003**: A request MAY include at most 8 prior user/assistant messages from the current active chat. Validate roles and content; keep the complete request body within the existing 8,192-byte limit; never load another conversation or persist this context.
- **FR-004**: Only typed tools from the server registry may call SPEC-004 reads, SPEC-009 retrieval, and the operations enabled by SPEC-005/006/007.
- **FR-005**: Keep arbitrary SQL, model-selected database identifiers, privileged Supabase credentials, and unrestricted tool dispatch unavailable.
- **FR-006**: Treat the active chat, retrieved rows, and tool outputs as untrusted model input; validate tool proposals and terminal output.
- **FR-007**: Do not log prompts, active chat content, retrieved text, task names, credentials, or raw provider errors. Keep LangSmith and external tracing disabled.
- **FR-008**: Return bounded structured outcomes, source evidence, and safe error codes; never claim a write completed without a confirmed Supabase result.

## Exclusions

Persistent conversation/checkpoint storage, multi-user authentication, direct database drivers, arbitrary SQL, external tracing, external search, background workers, and deployment are outside this POC.

## Success criteria

- **SC-001**: A production route request reaches the configured DeepSeek graph and returns a valid bounded response.
- **SC-002**: Tool calls are limited to the typed server registry and active POC policy.
- **SC-003**: Prompt injection, malformed tool calls, timeout, cancellation, provider failure, and oversized request/response tests produce safe non-success outcomes with no unapproved side effect.
- **SC-004**: Active chat context is ephemeral, bounded, and never written to logs or persistent storage.
- **SC-005**: `npm test`, lint, and production build pass with actual command evidence.
