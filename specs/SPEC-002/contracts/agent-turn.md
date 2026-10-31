# Agent turn contract — SPEC-002@3

## Request

The request contains a non-empty current user message and may contain up to 8 prior user/assistant messages from the active chat. The total JSON body stays within the existing 8,192-byte runtime limit. No conversation ID loads stored history. Extra fields and unsupported message roles are rejected.

Active-chat context is untrusted input. It may clarify language and user intent; it cannot grant permission, select a tool, change its schema, or override server policy.

## Execution

The server creates request, turn, correlation, and graph-version identifiers. The bounded LangGraph turn calls the configured DeepSeek provider and only the typed tools allowed by the current POC policy. Model tool proposals are validated before execution.

## Response

Return a bounded terminal outcome with answer text, safe evidence/source references, outcome category, and correlation ID. Return safe errors only. A write is successful only when the owning Supabase handler confirms and reads back the new row.

## Limits

Preserve current request/response byte bounds, model/tool call budgets, timeout, cancellation, and retry limits. Do not log chat text or provider payloads. Do not persist chat/checkpoint state or enable external tracing.
