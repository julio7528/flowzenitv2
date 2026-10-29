# Contract: Dashboard View Model — SPEC-011

**Status**: Presentation contract for Draft review; display projection only.

## Execution row

~~~text
ExecutionRow = {
  displayTime,          // America/Cuiaba, formatted from source instant
  durationLabel,        // measured value or "Indisponível"
  outcomeLabel,         // allowlisted state
  correlationLabel,     // visible only when read access is enabled
  auditEventRef?,       // transient same-origin detail selector, not a credential
  traceStateLabel,
  auditStateLabel,
  freshnessLabel
}
~~~

## Detail timeline

Each ordered item shows node/tool/provider kind, registered name/version, start/elapsed time if available, outcome, retry count and a safe error category. Tool args, tool results, prompt text, retrieved content, SQL, hidden reasoning and raw provider errors are never rendered.

## Semantic state labels

| Source value | UI meaning |
| --- | --- |
| healthy | Last health observation succeeded at checkedAt |
| degraded | Last observation recorded partial/error state |
| unavailable | Source could not be queried |
| not_configured/disabled | Capability or feed is not enabled |
| not_approved/awaiting_quality_evidence | Vector-RAG production activation is not established by index presence |
| stale/delayed | Data exists but is older/delayed relative to its source policy |
| unknown | No reliable observation is available |
| suspicious_signal | Signal under review; not a confirmed attack |
| confirmed_attack | Source already carries an approved evidence classification; the UI does not infer it |
| metric missing | Unavailable/not run; never numeric zero or pass |

## Responsive behavior

At desktop, tablet and mobile widths, summary cards can reflow and detail tables can become stacked labelled rows. No document-level horizontal overflow is allowed. Any internally scrollable trace region must be keyboard reachable, have an accessible label, and expose order without color dependence.
