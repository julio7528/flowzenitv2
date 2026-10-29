# Research: SPEC-002 runtime and DeepSeek integration

**SPEC**: SPEC-002@2<br>
**Date checked**: 2026-10-29<br>
**State**: Planning evidence for a scoped Draft. No provider call, deployment, or global decision change is authorized by this document.

## Repository and supervisor baseline

- GitHub main and the local checkout both point to 7de0650bce600805efe4b712cd0aab7d1b24b2ea; the working tree was clean before the SPEC-002 document revision.
- The local app is React/Vite and JavaScript ESM. package.json declares type module and the observed Node runtime is v24.13.0. No api directory, vercel.json, Vercel project link, LangGraph, LangChain, or DeepSeek package existed at inspection time.
- The client uses VITE_ environment variables. The existing passkey and sessionStorage value do not authenticate requests at the server.
- SDD status confirms SPEC-001@2 COMPLETED and SPEC-004@2 COMPLETED, each in its original completed batch/run. Global SDD status lists no active or paused batch and no active lease.
- A read-only query of sdd.spec_versions returned no SPEC-002 row. Therefore no v1 SDD snapshot exists to replace. Version 1 is preserved at the consulted GitHub commit; this document revision is version 2.
- The SDD supervisor rejects approval execution through the runner credential. Registration, candidate batch creation, validation, and prepare-approval are separate steps; exact administrator approval remains bound to the final batch UUID and manifest hash.

## DeepSeek API findings

The official Models & Pricing page lists deepseek-flash as the public model name and identifies the current served version as DeepSeek-V4.1-Flash-1017. It lists tool calls, Chat Completions, both thinking modes, and a maximum output far above this SPEC's 2,048-token cap. The page says the model name deepseek-flash should be used; legacy version names are not needed.

The Chat Completions API documents the model field, thinking mode, max_tokens, tool definitions, usage, finish reasons, and tool_calls. It says tool-call arguments may be malformed or contain hallucinated fields and must be validated locally. Thinking can be disabled. The Tool Calls guide shows deepseek-flash with thinking disabled and explains that the model proposes function calls; the application supplies the handlers. Strict mode is beta and does not replace local authorization.

This SPEC therefore fixes deepseek-flash and non-thinking mode for its adapter contract, but still validates the exact request emitted by the pinned LangChain package with a mocked transport. No user message, real FlowZenit content, private row, or stored prompt is eligible for provider input. One optional live smoke may use only a synthetic/public prompt and is skipped without a server-only key.

Official sources:

- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [DeepSeek Chat Completions API](https://api-docs.deepseek.com/api/create-chat-completion/)
- [DeepSeek Tool Calls](https://api-docs.deepseek.com/guides/tool_calls/)
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)

## LangChain and package compatibility

LangChain's current JavaScript documentation identifies ChatDeepSeek in @langchain/deepseek, documents tool calling and token-usage metadata, and labels the integration beta. The official reference describes the tool helper in @langchain/core/tools, so the umbrella langchain package is not required by the selected imports.

Npm registry metadata queried on 2026-10-29 returned:

| Package | Version | Peer/runtime evidence |
| --- | ---: | --- |
| @langchain/langgraph | 1.5.3 | Node >=18; @langchain/core ^1.1.48; Zod ^3.25.32 or ^4.2.0 |
| @langchain/core | 1.3.1 | Node >=20 |
| @langchain/deepseek | 1.1.21 | Node >=20; @langchain/core ^1.0.0 |
| zod | 4.6.7 | Accepted by the LangGraph peer range |

These ranges are mutually compatible with Node 24.13.0. Pin exact versions and verify the lockfile during T001. Adapter compatibility, timeout/cancellation behavior, and provider request fields remain runtime test obligations, not assumptions from package metadata.

Official sources:

- [LangChain ChatDeepSeek JavaScript integration](https://docs.langchain.com/oss/javascript/integrations/chat/deepseek/)
- [LangChain tool helper in @langchain/core](https://reference.langchain.com/javascript/langchain-core/tools/tool)
- [LangChain @langchain/core tools module](https://reference.langchain.com/javascript/langchain-core/tools)

## Vercel and Node findings

Official Vercel documentation states that a root api directory is supported for Vite projects and that Node Functions are built from functions placed there. The Node runtime documentation lists Node 24.x as the current default. Vercel configuration supports per-function maxDuration and supportsCancellation. The approved 45-second function duration is below current documented maximums, including the 60-second Hobby maximum when Fluid Compute is disabled.

The local checkout has no Vercel config or project link. Therefore the code and function settings can be validated locally, but the actual account plan, region, project settings, and production routing remain NOT VERIFIED until a future deployment review. No deployment is part of this SPEC.

Official sources:

- [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Supported Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel function configuration](https://vercel.com/docs/project-configuration/vercel-json)

## Supabase and data boundary

The SDD operational database is separate from the product data path. The new SPEC-002 runtime adds no migration, table, product grant, RLS policy, service-role client, or database write. It delegates to the six existing SPEC-004 typed read contracts; positive test paths inject synthetic handlers and make no product database calls. The production route denies before creating or invoking those handlers while DEC-001 is closed.

The Supabase changelog index was fetched on 2026-10-29 as required by the Supabase workflow. Recent breaking entries concerned CBC TLS cipher support and PostgreSQL minor-release extension/operator changes; neither changes the existing SDD registration RPC used here. No schema change is proposed in this SPEC.

## Integration and remaining boundaries

- DEC-001 remains closed. The production endpoint cannot invoke private reads or model calls.
- DEC-006 is not globally resolved. It allows only public/synthetic content in the optional smoke; external traces remain off.
- DEC-005/SPEC-003 still owns persistent checkpoints, history, replay storage, and retention. This SPEC defines ports and fakes only.
- DEC-010 selects the route and runtime for this SPEC, but not production region or deployment.
- DEC-011 selects the SPEC-scoped model/API/mode. It does not change decisions for other SPECs.
- DEC-012 selects numeric runtime limits for this SPEC, not a global cost budget.
- SPEC-005, DEC-009, SPEC-006, and SPEC-007 remain prerequisites for future mutation capabilities.
- `server/domain/read/pagination.js` implements hierarchy cursors with AES-256-GCM; `server/domain/read/hierarchy.js` binds them to the item and ordering, and `server/domain/read/index.js` injects the cursor key into the service. SPEC-002 treats cursor strings as opaque tokens and passes them through unchanged.
- HIERARCHY_CURSOR_SECRET must be a server-only Uint8Array of at least 32 bytes, shared across instances; key rotation invalidates cursors. It is never placed in an SDD snapshot or output.

No decision register outside SPEC-002 is changed by this planning revision.
