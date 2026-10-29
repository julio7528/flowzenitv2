# Research: SPEC-002 runtime and DeepSeek integration

**Date:** 2026-10-28  
**Status:** Planning evidence only; no provider or runtime decision is approved here.

## Repository baseline

- The application is JavaScript ESM with React 19 and Vite. `package.json` currently declares neither LangGraph.js, LangChain.js, a DeepSeek client, nor a server framework. Existing scripts include `node --test`, `oxlint`, and `vite build`.
- `vite.config.js` uses React and `envPrefix: 'VITE_'`. The browser Supabase client reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The existing passkey and `sessionStorage` check are client navigation state, not a server-verifiable principal.
- No API/runtime source, `api/`, `server/`, Vercel project config, or agent tests exist in the inspected checkout. SPEC-001 documents a proposed same-origin API contract and a Vercel Node Function option, both explicitly unapproved.
- SPEC-001 assigns HTTP handlers, orchestration, provider calls, and runtime to SPEC-002; SPEC-004 owns exact read contracts; SPEC-005/006/007 own authorization policy, writes, and temporal interpretation; SPEC-003 owns conversation/checkpoint persistence. No duplicate domain query or write logic belongs here.

## Framework and provider findings

| Area | Evidence and planning implication |
| --- | --- |
| LangGraph.js | `StateGraph` nodes consume state and return updates; a checkpointer is required for checkpoint resume. A process-local memory saver demonstrates graph behavior but is not durable cross-request persistence. Use an injected checkpointer port; do not claim durable resume until SPEC-003 and DEC-005 provide an approved implementation/policy. |
| LangChain.js / DeepSeek | LangChain documents `ChatDeepSeek` in `@langchain/deepseek` as beta and lists tool calling, structured output, and token streaming. This package and its compatible `@langchain/core`/LangGraph versions are not installed. Exact versions and model compatibility require a later dependency spike. |
| DeepSeek protocol | The Chat Completions API may return content, tool calls, usage, finish reason, and provider-specific reasoning fields. API documentation warns that generated tool arguments may be malformed or include hallucinated fields; strict mode is beta and local validation remains required. In thinking mode with tools, the provider requires `reasoning_content` to be passed through subsequent requests. Keep any such value in short-lived adapter state only; never expose or log it. |
| Vercel Node Functions | Vercel documents a root `api/` directory for Functions alongside Vite, the Node.js runtime, response streaming, configurable duration, cancellation support, and function regions. A Vite static SPA's local dev server does not itself establish an `/api` runtime; local parity, routing/rewrite behavior, region, cancellation config, plan limits, and deployment configuration remain to be verified. |

## Runtime options for review

1. **Root `api/*.js` Vercel Node Functions** — least structural change for the existing Vite SPA and supported by Vercel documentation. Risks: local dev parity, API/SPA route behavior, deployment limits/region, cancellation/streaming configuration, and DEC-010 approval.
2. **Vite server plugin/runtime such as Nitro** — can co-locate server routes with Vite, but introduces dependencies and build/configuration changes not present in the checkout. Requires a separate compatibility and deployment review; not selected.
3. **Separate Node service** — creates a clean server boundary but introduces a second runtime/deployment and same-origin/CORS concerns. Requires DEC-010 and is not selected.

Vercel Node Functions are retained as an option for comparison, not as an approved architecture. The recommendation to keep runtime modules outside the Vite client graph is a security boundary; it does not decide the hosting product.

## Proposed compatibility baseline

- Use JavaScript ESM and a provider adapter behind the LangChain chat-model interface. Candidate packages are `@langchain/langgraph`, `@langchain/core`, `@langchain/deepseek`, and `langchain`/`zod` for schema-declared tools; none are installed by this planning task.
- Use LangGraph for explicit state and transition control, LangChain `tool()`/schema abstractions for model-facing tool declarations, and a separate local allowlisted executor for authorization and execution. Any Zod schema is an input contract aid, not the sole authorization check. Do not delegate capability authorization to model prompts or provider-side strict mode.
- Normalize DeepSeek responses to provider-neutral fields: content, tool proposals, finish reason, usage when present, and provider error category. Reject unsupported response combinations and validate each JSON argument locally.
- Keep all provider calls disabled in the production path until DEC-006 data-sharing policy and DEC-011 model/API decisions are approved. Planning uses deterministic doubles only; no live provider call or private prompt is sent.
- Keep all private reads and privileged actions disabled until the DEC-001 access-control gate is approved, implemented, and verified. A supplied conversation ID, passkey state, public Supabase key, or `service_role` credential is not authorization.
- The initial turn is synchronous as an existing SPEC assumption. Streaming is an unresolved public contract and must be reviewed with the eventual chat/API consumer before implementation. Persisted conversation and checkpoints are out of scope here; no retention policy is selected.

## Open decisions and dependencies

- **DEC-001**: approved passkey interpretation; protected data/tool execution stays unavailable until a suitable server access gate exists. This SPEC selects no identity/session mechanism.
- **DEC-005**: retention, deletion, export, and sharing policy for any persisted graph state or execution ledger.
- **DEC-006**: provider data fields, redaction, opt-out, retention/location; blocks real FlowZenit content sent to DeepSeek and external tracing.
- **DEC-010**: runtime, region, Vercel plan/duration, background work, and queue strategy.
- **DEC-011**: exact DeepSeek model/API mode and version.
- **DEC-012**: abuse/usage bounds; no financial budget is approved.
- **SPEC-003**: durable conversation/checkpoint persistence and replay storage. SPEC-002 defines only the port and fails closed for capabilities that need durable state until an implementation is supplied.
- **SPEC-005/006/007**: policy and typed write capabilities are downstream. This runtime starts with a deny-by-default registry and no enabled mutation tools.
- **Still needing explicit resolution**: maximum graph/model/tool steps, provider/tool timeout values, retry counts/backoff, streaming behavior, fallback behavior, and model/provider package versions.

## Official primary references

- LangGraph.js workflow/state/checkpointer concepts: [Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph), [Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence).
- LangChain.js DeepSeek adapter and feature status: [ChatDeepSeek integration](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek), [API reference](https://reference.langchain.com/javascript/langchain-deepseek/ChatDeepSeek).
- DeepSeek tool calls, strict-mode limits, and reasoning/tool protocol: [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/), [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/), [Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/).
- Vite integration and root `api/` route support: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite).
- Node runtime, duration, cancellation, and streaming options: [Vercel runtimes](https://vercel.com/docs/functions/runtimes), [Function duration](https://vercel.com/docs/functions/configuring-functions/duration), [Functions API reference](https://vercel.com/docs/functions/functions-api-reference), [Streaming](https://vercel.com/docs/functions/streaming-functions).
