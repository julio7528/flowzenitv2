# Contract: Provider Health and Usage — SPEC-010

**Status**: Proposed read model for SPEC-011; not a live health-check authorization.

~~~text
ProviderHealth = {
  component: "deepseek" | "gemini" | "supabase" | "langsmith",
  state: "healthy" | "degraded" | "unavailable" | "not_configured" | "unknown",
  checkedAt?,
  freshness: "fresh" | "stale" | "unknown",
  durationMs?,
  reasonCategory?
}
Usage = {
  inputTokens?: { value, source: "provider" },
  outputTokens?: { value, source: "provider" },
  availability: "available" | "unavailable"
}
~~~

- A health probe is a time-bound observation and must not be presented as a guarantee of the next request.
- No probe sends private FlowZenit content. Any probe needing a real provider call needs the applicable provider/data gate and DEC-012 limits.
- Never expose key presence values in a way that reveals secrets, full endpoint URLs, raw error response, or request content.
- The absence of a health observation is unknown, not healthy or zero.
- This model reports token usage and does not enforce a budget. DEC-012 owns operational limits.
