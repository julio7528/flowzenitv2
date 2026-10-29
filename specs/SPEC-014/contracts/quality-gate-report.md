# CI Quality Gate Report Contract: SPEC-014

**Status**: Draft validation-report contract. A passing report is not a deployment authorization.

## Gate state

```text
GateState = "passed" | "failed" | "skipped" | "not_verified" | "blocked"
```

- A required gate is complete only with an actual command/result and evidence reference.
- `skipped`, timeout, missing runner/dependency, wrong DB target, or absent evidence is not a pass.
- A passing retry after a first failure is reported as flaky per SPEC-013; CI policy cannot erase the initial failure.
- The report contains SPEC/version, criterion, source revision, command label, actual exit code, environment class, dataset/fixture version, duration, result and safe evidence reference.
- Secrets, transcripts, private rows, raw provider payloads and unrestricted logs never appear in report fields.

## CI actions denied

The quality workflow contains no deployment, promotion, migration apply, commit, push, merge, release-tag, Vercel production token, or Supabase production secret. It returns readiness evidence only.

## Required gates

The set of checks is derived from the exact SPEC versions and their required criteria. A report must enumerate required gates before execution, record each result, and return `not_verified`/`blocked` for unavailable decisions or tools. Do not downgrade required gates to warnings to get a green aggregate.
