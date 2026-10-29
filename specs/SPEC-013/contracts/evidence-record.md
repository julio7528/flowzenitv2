# Quality Gate Evidence Record: SPEC-013

**Status**: Draft evidence shape for future implementation reports and CI artifacts.

## Fields

```text
EvidenceRecord = {
  schemaVersion,
  specId,
  criterionId,
  commandName,
  exitCode,
  sourceRevision,
  suite,
  environmentClass,
  targetVerification,
  datasetId?,
  datasetVersion?,
  datasetDigest?,
  startedAt,
  durationMs,
  result: "passed" | "failed" | "flaky" | "blocked" | "not_verified",
  counts,
  metricSummaries?,
  failureCategories?,
  artifactRefs?
}
```

`exitCode` must be an actual process result; absence is `not_verified`. `artifactRefs` point to sanitized, synthetic-only artifacts and must not embed prompts, transcripts, database rows, raw provider responses, environment values, secrets, cookies, access tokens, or full stack traces. A retry that passes after an initial failure is `flaky` and preserves both attempt states.

## Reporting

Every implementation completion report maps each acceptance criterion to evidence or `NOT VERIFIED`. A missing command, fixture version, target identity, or result cannot be inferred as pass. Evidence artifact storage and deletion/retention policy need review; do not commit local raw Playwright traces or evaluation outputs.
