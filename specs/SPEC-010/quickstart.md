# Quickstart: Validate SPEC-010 Observability

**Planning artifact only.** No command below was run in this documentation turn. Future implementation must use synthetic data, adapter doubles, and an isolated local database. Do not set LangSmith credentials or send real FlowZenit data.

## Preconditions for future implementation

1. SPEC-010 must be included in an exact user-approved SDD batch before implementation.
2. DEC-001's access-control gate must be approved, implemented, and verified before any private endpoint, query, or mutation is enabled.
3. DEC-005 must define retention/deletion for persistent audit; DEC-006 must define provider fields and processing before production trace export.
4. Resolve audit-store failure/atomicity behavior before enabling any mutation.
5. DEC-010 must settle runtime/region and callback flush or durable delivery behavior where relevant.
6. Use only synthetic IDs, sentinel secrets, graph fixtures, provider doubles, and isolated local PostgreSQL.

## Future validation sequence

1. Create a synthetic graph fixture with API, node, model, retrieval, tool, guardrail and terminal spans. Assert requestId, turnId, correlationId, graphRunId and toolInvocationId relationships.
2. Inject a unique credential sentinel into every forbidden field. Run the local redactor, inspect the audit-store fixture and trace-export fixture, and assert that neither contains the sentinel.
3. Disable the LangSmith adapter and simulate timeout/quota failure. Confirm external trace failure changes only telemetry state and never skips guardrail or access checks.
4. Append allow, deny, suspicious-signal, confirmed-evidence fixture, mutation outcome and provider failure audit events with deterministic sourceEventRef values. Replay each and verify one logical event per source reference.
5. Simulate a durable audit commit acknowledgement, rejection, timeout and ambiguous commit. Verify the adapter never claims an unacknowledged event was persisted and mutation behavior remains disabled until the policy is approved.
6. Verify token usage from a provider double is exact only when explicitly present; missing usage is unavailable.
7. Query audit fixtures by bounded time window/correlation reference through an isolated repository. With the access gate unset, assert zero private repository calls.
8. Verify no production agent telemetry touches the sdd schema and no provider credentials enter browser assets.

## Expected future evidence

- npm test covers the unit and contract fixtures.
- npm run lint and npm run build complete without violations or server secret exposure.
- Local isolated database tests cover append idempotency and bounded reads.
- Security tests record zero secret sentinels in stored/exported/rendered data and zero private reads while the gate is closed.
- No real LangSmith, DeepSeek, Gemini, remote Supabase, or production data is used for this validation.

## References

- [LangSmith LangGraph tracing](https://docs.langchain.com/langsmith/trace-with-langgraph)
- [LangSmith trace privacy controls](https://docs.langchain.com/langsmith/mask-inputs-outputs)
- [LangGraph JavaScript persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
