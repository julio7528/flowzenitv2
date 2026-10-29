# Implementation Plan: LangGraph Runtime and DeepSeek Model Integration

**SPEC ID**: SPEC-002 | **Version**: 2 | **State**: Draft<br>
**Date**: 2026-10-29<br>
**Specification**: spec.md<br>
**Dependencies**: SPEC-001@2 and SPEC-004@2 are supervisor-recorded COMPLETED prerequisites.

## Summary

Implement a bounded, server-side, single-turn graph using JavaScript ESM, LangGraph StateGraph, LangChain model/tool contracts, and DeepSeek Chat Completions. Keep the React/Vite client unchanged. Add root route api/agent/turn.js as a Vercel Node Function, with a synchronous JSON contract and a hard default-deny access gate. Since DEC-001 remains closed, the production route returns CAPABILITY_DISABLED before calling a model, Supabase, or any tool. Positive graph and tool paths are exercised only through injected synthetic test capabilities.

The model configuration for this SPEC is deepseek-flash through the OpenAI-compatible Chat Completions API with thinking disabled. Prefer ChatDeepSeek. T013 must prove the exact model, tool-call, output-token, timeout, cancellation, and response-normalization behavior using a mocked HTTP transport. If the integration package cannot meet a required contract, a minimal server-only fetch adapter may implement the same provider-neutral interface. No fallback provider is selected.

## Technical baseline and decisions

- Local runtime observed during planning: Node v24.13.0; package type is ESM.
- Vercel currently supports Node 24.x and discovers root api/ functions. Set package.json engines.node to 24.x and configure only api/agent/turn.js for maxDuration 45 and supportsCancellation true. Do not set a region. The current checkout has no api directory, vercel.json, or linked .vercel project. No deployment or account-specific validation occurs in this SPEC.
- The user-approved overall turn deadline is 45 seconds. The function maximum duration matches it. Vercel plan, region, and production environment remain unverified until a future deployment review.
- Pin the compatible package set observed from the npm registry on 2026-10-29:
  - @langchain/langgraph 1.5.3, peer @langchain/core ^1.1.48 and zod ^3.25.32 or ^4.2.0.
  - @langchain/core 1.3.1, Node >=20.
  - @langchain/deepseek 1.1.21, peer @langchain/core ^1.0.0, Node >=20.
  - zod 4.6.7.
- Do not install the langchain umbrella package unless an implementation import proves it is needed. StateGraph is provided by @langchain/langgraph, ChatDeepSeek by @langchain/deepseek, and the tool helper by @langchain/core/tools. The required imports and peer compatibility must be confirmed by T001 and runtime tests.
- ChatDeepSeek is documented by LangChain as beta. Use the exact pinned version and test the real class against a mocked DeepSeek response. Do not rely on provider-side strict mode for local validation.
- DEC-006 remains globally unresolved. This SPEC permits only public or synthetic content for one optional smoke request; the HTTP route never forwards real user text to the provider.
- DEC-001 remains closed. The API route is implemented fail-closed and is not user-facing or deployed.
- DEC-005/SPEC-003 remain owners of persistent checkpoint, conversation, retention, and ledger storage. This SPEC supplies ports and deterministic in-memory test doubles only. No writes are registered.

## Architecture

    Browser or caller
      -> POST /api/agent/turn
      -> method/content-type and bounded request handling
      -> server-created capability decision (default deny)
      -> denied response while DEC-001 is closed; no model, Supabase, or tool calls

    Deterministic integration tests
      -> real LangGraph StateGraph
      -> injected model double and server-owned synthetic capability
      -> injected SPEC-004 contract handlers
      -> response composition and a single terminal outcome

The production handler accepts only the defined JSON DTO and never treats conversationId, passkey state, caller headers, model output, or public Supabase credentials as authorization. There is no test bypass header, environment switch, or client-controlled capability. Test-only injection is available through internal constructors, not through the HTTP contract.

The actual graph has explicit bounded nodes for request validation, trusted turn initialization, access/disclosure decision, context preparation, model invocation, result normalization, proposal validation, policy authorization, tool execution, response composition, and finish. A model result may loop through tools and a final model invocation only while every per-turn limit and deadline remains. The graph tests use the real StateGraph implementation rather than a mocked graph API.

## Runtime limits

| Limit | Enforced maximum | Rule |
| --- | ---: | --- |
| Graph steps | 12 per turn | Count each node transition, including failed and denied proposals |
| Model invocations | 3 per turn | Retries count as invocations |
| Tool invocations | 4 per turn | Include every attempted tool call |
| Additional retry | 1 | Transient provider errors or verified idempotent reads only |
| Model timeout | 15 seconds per call | Abort the underlying request and reject late results |
| Tool timeout | 5 seconds per call | Propagate AbortSignal and stop starting work after cancellation |
| Total deadline | 45 seconds | Includes graph work, waits, retries, and I/O |
| Request body | 8 KiB | Reject larger bodies before graph invocation |
| JSON response | 16 KiB | Bounded serialization; no silent truncation of required status metadata |
| Model output | 2,048 tokens | Set max_tokens when supported; keep server value fixed |

The implementation may lower a value if the tested platform or dependency imposes a stricter limit. It may not raise these values or let a request override them. Use one deterministic 250 ms retry delay, subject to the remaining total deadline. Do not enable a library's hidden automatic retry if that could exceed the invocation count.

## Provider and dependency boundary

The server-only model configuration fixes model deepseek-flash, API mode Chat Completions, and thinking disabled. Request values cannot select model, endpoint, temperature, tools, token limit, or provider. DEEPSEEK_API_KEY is read only in the server process. LANGSMITH_TRACING is forced off for this runtime. Adapter outputs are allowlisted; reasoning_content, raw bodies, raw headers, and provider exceptions are not returned, logged, or persisted.

T010/T013 use a mocked fetch transport to prove the ChatDeepSeek instance submits the approved model, non-thinking setting, tool schema, max token value, timeout, and cancellation signal and normalizes content, tool calls, usage, finish reason, and errors. A single real synthetic smoke call is optional and must be skipped when no valid server-only credential exists. It may not send user messages, FlowZenit records, prompts from files, secrets, or traces.

## Typed SPEC-004 integration

The registry defines only the six existing read operations: getHierarchy, getItemById, searchItems, getDailySchedule, getWeeklyAllocation, and getRoutineTemplates. Each tool has a versioned name and Zod input schema, then delegates to the owning SPEC-004 service. It does not import the Supabase client or duplicate SQL/query logic.

The executor separately validates arguments and rechecks the access capability, policy, tool budget, deadline, and cancellation immediately before the handler. The production policy is deny-by-default. The route cannot activate read tools while DEC-001 is closed. Positive integration tests use isolated synthetic implementations of these six contracts.

Preserve the full semantics of SPEC-004 results:
- Keep UNSUPPORTED_ENTITY explicit and do not invent a commitment/calendar record or ID.
- Preserve requiresNarrowing, its reason, candidate IDs, and hierarchy context; do not select an ambiguous candidate.
- Preserve the opaque AES-256-GCM cursor continuation token unchanged; do not decode or reconstruct it. Preserve truncation metadata and never claim a truncated page is complete.
- Keep bigint identifiers as strings.
- Configure the owning SPEC-004 service with a server-only HIERARCHY_CURSOR_SECRET Uint8Array of at least 32 bytes, shared across instances. Never use a hard-coded fallback or VITE_ value. Missing configuration denies hierarchy cursor operations. Rotation invalidates existing cursors.

## HTTP and Vercel integration

Implement api/agent/turn.js as a root Vercel Node Function using Node 24 ESM. The public contract is POST /api/agent/turn with JSON request and response. The route returns a safe 403 CAPABILITY_DISABLED response while the server access gate is absent or closed, before a provider, Supabase, or tool handler can run. It does not trigger DeepSeek spend for anonymous requests. There is no deployment, region selection, client UI, streaming, or background work in this SPEC.

The HTTP contract fixes validation statuses to 405 for unsupported methods, 415 for unsupported content types, 400 for malformed JSON or invalid DTOs, and 413 for bodies over 8 KiB. Valid turn terminal outcomes map to 200 for completed/needs-clarification/refused/cancelled, 403 for denied, 504 for timed-out, and 500 for failed. A disconnected caller receives no response, while cancellation still stops graph work.

Add vercel.json with function-specific maxDuration 45 and supportsCancellation true. Do not add rewrites, domains, deployment commands, or a region. Tests invoke the handler directly with Web Request/Response objects and prove fail-closed behavior. Node syntax/import checks cover the server module; the Vite build and client-bundle scans prove separation.

## Model state and persistence ports

GraphState contains validated request data, server-generated identifiers, current graph version, bounded message history for the active turn, normalized provider result, pending proposal, safe tool references, response categories, and one terminal outcome. It excludes provider credentials, raw provider data, reasoning, private results, and client authority.

Define CheckpointPort and ExecutionLedger interfaces as ports. Tests use deterministic in-memory doubles. No production checkpoint implementation, conversation persistence, or mutation handler is created. A synthetic mutation may be used only to prove the fake ledger reserve/replay invariant. If a future handler is ever enabled without durable reserve and recorded outcome, it must be denied.

## Failure, retry, cancellation, and response behavior

- Invalid DTOs and invalid or unauthorized proposals produce a safe failed, needs-clarification, or denied outcome and zero unauthorized handler calls. They are not retried.
- Only transient provider failures and verified idempotent reads may receive one additional attempt, if the model/tool call count and total deadline permit it.
- Timeout and cancellation abort in-flight model/tool work where supported, stop future graph nodes, and produce timed-out or cancelled.
- Empty, mixed, unknown, malformed, or unsupported provider shapes follow the explicitly tested normalizer contract. Never present malformed arguments as valid.
- Tool dependency failure is not reported as empty data. Truncated tool output stays explicitly truncated.
- A completed fake-ledger result replays without repeating the synthetic effect.
- Safe logs contain only server correlation ID, graph version, node/tool name and version, category, bounded counts, and elapsed time. No prompt, message, tool input/result, private record, reasoning, token, raw exception, header, or environment object.

## File and task ownership

| Area | Paths | Owner boundary |
| --- | --- | --- |
| HTTP | api/agent/turn.js, vercel.json, server/agent/http/ | Route, safe transport errors, and function-specific limits only |
| Graph | server/agent/runtime/ | State, real StateGraph, limits, turn lifecycle, responses |
| Model | server/agent/model/ | Provider-neutral port, DeepSeek adapter, normalization |
| Tools | server/agent/tools/ | Registry, Zod schemas, default-deny policy, executor |
| Persistence ports | server/agent/persistence/ | Interfaces only; no durable storage |
| Server configuration | server/agent/config/ | Validated server-only model and cursor configuration; no secret defaults |
| Events | server/agent/observability/ | Safe allowlisted metadata only |
| Tests | tests/fixtures/agent/, tests/helpers/agent/, tests/unit/agent/, tests/contracts/agent/, tests/security/agent/ | Synthetic and deterministic; no product DB writes |

Do not place helpers in a root api path unless they are intended functions. Do not import server code from src or Vite client entry points.

## Test and quality plan

- Real StateGraph path tests cover answer-only, tool-only, refusal, malformed/unknown proposal, clarification, denial, dependency failure, timeout, cancellation, budget exhaustion, and terminal uniqueness.
- DeepSeek adapter tests use mocked fetch and a real ChatDeepSeek instance to validate request and response compatibility without a provider call.
- Six SPEC-004 integrations run against injected synthetic handlers, preserving special result metadata and opaque cursor pass-through while making zero product database requests.
- HTTP tests prove unauthenticated requests are denied with zero external calls.
- Replay tests use a fake checkpoint and ledger and prove no duplicate synthetic effect.
- Security tests inspect logs, responses, source imports, Vite output, source maps, and environment naming for server-only isolation.
- Required project checks are npm test, npm run lint, npm run build, focused Node tests, and bundle/static boundary verification. Live smoke and production deployment are not required gates.

## Remaining production conditions

DEC-001 remains closed, DEC-006 remains globally unresolved, no provider key or user data is required, no durable persistence is active, no mutation tool exists, and the endpoint is not deployed. Region and actual Vercel project settings remain unverified. These conditions are recorded as disabled or NOT VERIFIED and do not turn synthetic runtime tests into failures.
