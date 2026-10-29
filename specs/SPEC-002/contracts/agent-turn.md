# Proposed HTTP turn contract — SPEC-002@2

**Status**: Internal contract for a Draft SPEC. The endpoint is not deployed or available to end users.

## Request

Operation: POST /api/agent/turn, same-origin HTTPS, synchronous JSON.

    {
      "conversationId": "opaque-grouping-value-or-null",
      "message": "user text"
    }

- Accept JSON only; reject unsupported methods, content types, invalid encoding, unknown fields, empty messages, and request bodies over 8 KiB.
- conversationId is only grouping metadata. It is not a user, principal, owner, credential, session, access token, or authority.
- Never accept owner ID, role, passkey result, session assertion, client-selected model, arbitrary tool name, SQL, table/column names, or query fragments.
- Generate requestId, turnId, and correlationId on the server.
- The route checks the server-created access decision before invoking the graph. While DEC-001 is closed or server authentication is absent, return CAPABILITY_DISABLED and make zero model, Supabase, and tool calls. No anonymous request may cause a DeepSeek API request.
- Positive route behavior is exercised only through injected internal test capabilities, not a request header, query parameter, or environment-controlled test bypass.

## Response

Candidate synchronous JSON success shape for an authorized future configuration:

    {
      "turnId": "server-generated-id",
      "conversationId": "opaque-grouping-value-or-null",
      "graphVersion": "versioned-graph-id",
      "outcome": "completed",
      "answer": {
        "text": "response text",
        "evidence": [],
        "inference": [],
        "missingEvidence": [],
        "uncompletedActions": []
      },
      "correlationId": "server-generated-id"
    }

The only outcomes are completed, needs-clarification, denied, refused, timed-out, cancelled, and failed. The response never contains raw graph state, prompts, hidden reasoning, provider bodies, credentials, SQL, stack traces, or private data. It preserves UNSUPPORTED_ENTITY, requiresNarrowing, candidate references, hierarchy context, opaque AES-256-GCM cursor values, and truncation metadata. Cursor values are passed through unchanged, and a truncated page is never described as complete.

Safe closed-gate error:

    {
      "error": {
        "code": "CAPABILITY_DISABLED",
        "message": "Capability unavailable"
      },
      "correlationId": "server-generated-id"
    }

The serialized response is limited to 16 KiB. If the complete safe contract cannot fit, return a bounded terminal error; do not silently discard evidence semantics.

## Tools and provider

The only registered typed read contracts are getHierarchy, getItemById, searchItems, getDailySchedule, getWeeklyAllocation, and getRoutineTemplates. Production execution remains denied while DEC-001 is closed. The route does not execute mutations or arbitrary queries.

Model calls are server-only and receive deepseek-flash via OpenAI-compatible Chat Completions with thinking disabled. This SPEC's production route does not forward real user input to DeepSeek. A direct optional smoke is limited to one synthetic/public prompt and is not a route test.

## Streaming and cancellation

The route returns buffered JSON; streaming and background execution are out of scope. Propagate the platform request signal into graph, model, and tool ports. vercel.json sets function-specific maxDuration to 45 seconds and supportsCancellation true. Production platform region and account settings remain unverified; there is no deployment in this SPEC.
