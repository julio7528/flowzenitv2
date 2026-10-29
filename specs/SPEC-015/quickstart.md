# Validation Quickstart — SPEC-015

**Status:** Future implementation validation guide. No commands were executed for this Draft plan.

## Preconditions

- Use versioned synthetic public-search fixtures and the SPEC-013 environment guard.
- Default Tavily capability off; inject only a deterministic provider double.
- Do not use production Supabase/provider secrets or actual FlowZenit records.
- Live provider validation is outside routine quickstart and requires separate approval, DEC-006, DEC-010, DEC-012, and synthetic-only input.

## Scenarios

1. **Disabled default:** propose a search request and assert zero adapter/network invocations and a clear unavailable result.
2. **Public success:** enable only the test double, send a synthetic public query, and assert the normalized source link, external label, retrieval time, and correlation reference.
3. **Internal routing:** ask synthetic exact status/date/schedule questions and assert SPEC-004 is selected; Tavily receives zero calls.
4. **Privacy:** put synthetic private-name, schedule, identifier, transcript, and secret sentinels in user/domain context. Assert the outbound request is denied or rewritten only through an explicit public reformulation, and no sentinel appears in the captured payload or audit record.
5. **Untrusted results:** return direct and indirect prompt-injection text and assert it cannot add tools, expose private records, or cause a mutation.
6. **Failure states:** exercise empty, malformed, duplicate, timed-out, rate-limited, and unavailable doubles; verify safe state/limitation output and no unsupported current-web answer.
7. **Audit/tracing:** verify only SPEC-010's allowlisted, minimized event is submitted; default external trace export remains disabled.

## Expected evidence

Record fixture version/digest, tool policy version, captured sanitized request fields, invocation count, normalized outcome, source provenance assertions, and test result. Evidence must not contain real query content, credentials, private rows, provider bodies, or raw prompts. Missing gates are `NOT VERIFIED` under SPEC-013.

