# Contract: Optional LangSmith Trace Export — SPEC-010

**Status**: Proposed adapter. Production trace export is disabled until DEC-006 is resolved.

## Adapter

~~~text
TraceExporter.export(sanitizedTrace)
  -> sent(vendorRunRef?)
   | skipped_by_policy
   | disabled
   | failed(safeCategory)
   | redaction_failed
~~~

sanitizedTrace is a narrow DTO containing only approved node/tool/provider identifiers, internal correlation references, timing, retries, safe outcomes and provider-returned usage. It does not contain graph state or prompt/tool content by default.

## Export rules

- The default is disabled. Enabling production tracing requires DEC-006's field/region/retention/opt-out decision and a verified redaction test.
- Apply the application's allowlist and redaction before any callback or SDK receives an event. SDK-level hiding/anonymization is a secondary control, not the policy boundary.
- No API key, workspace identifier, endpoint secret, environment object, provider response body, conversation text or tool result is exported.
- Correlation metadata uses server-generated IDs only. Client hints, conversation IDs as identity, owner IDs, and target record text are excluded.
- Trace sampling is independent of audit completeness. Critical audit events are not sampled.
- On external exporter outage, record a safe telemetry-degraded state if possible; do not block or authorize a domain operation based on trace delivery.
- In serverless hosting, callback flush behavior must be tested against the runtime selected under DEC-010. No runtime or background queue is selected by this contract.
- Provider/model labels are bounded identifiers. Token values are exact only if returned by the model adapter; otherwise unavailable.

## Privacy limitation

LangSmith's official docs describe conditional tracing, input/output hiding, metadata transformation, and anonymizers. These controls can supplement the local boundary, but production export still waits on the approved data-processing policy and application-side redaction.
