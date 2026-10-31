# Data model: Agent Runtime and DeepSeek Integration

| Entity | Fields/meaning | Constraint |
| --- | --- | --- |
| AgentTurnRequest | Current user message and optional bounded active-chat messages | Strict schema; only current browser session; no persisted or cross-session history. |
| RuntimeMessage | Role and text content | Role allowlist and existing runtime size/count limits; always untrusted model context. |
| TrustedTurnContext | Server-generated request/turn/correlation/graph identifiers | Never derived from client or model authority claims. |
| TerminalOutcome | Status, bounded answer, and typed evidence references | Safe DTO; no raw provider result or write success without confirmed result. |

The runtime adds no database table. It uses the current Supabase JS/PostgREST path through registered domain tools.
