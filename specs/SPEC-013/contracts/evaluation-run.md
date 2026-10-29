# Evaluation Run Contract: SPEC-013

**Status**: Draft runner contract; no thresholds or provider are approved here.

## Inputs

```text
EvaluationRequest = {
  evaluationId,
  specId,
  criterionIds[],
  datasetId,
  datasetVersion,
  datasetDigest,
  adapter: "deterministic_double" | "isolated_db" | "playwright_fixture" | "provider_opt_in",
  environment: "local" | "ci" | "dedicated_nonproduction",
  thresholdProfile?: "informational" | "approved:<version>"
}
```

Unknown dataset, missing digest, unreviewed labels, unknown adapter, or pending threshold profile returns `not_verified`/`blocked` and executes no live provider call.

## Outputs

```text
EvaluationSummary = {
  runId,
  specId,
  criterionIds[],
  datasetId,
  datasetVersion,
  datasetDigest,
  result: "passed" | "failed" | "flaky" | "blocked" | "not_verified",
  attempted, passed, failed, skipped, retried,
  metrics: [{ name, value, interval?, thresholdState }],
  failureCategories[],
  durationMs
}
```

Raw case text and raw model/provider answers are not part of the summary. If a debugging artifact is needed, it must be synthetic, access-controlled, short-lived under an approved policy, and referenced rather than inlined.

## RAG and grounding metrics

Where SPEC-009 defines relevance labels, report its Recall@k, MRR, nDCG@k, exact-route, citation-support, freshness/abstention, and unsupported-claim metrics. Compare lexical-only, vector-only, hybrid, and structured-query baselines. `k`, minimum gain, acceptance floor, confidence/abstention threshold, and dataset representativeness remain pending; label them informational until approved.

## Result semantics

- `passed`: all required assertions passed under an approved threshold profile and no required case was skipped.
- `failed`: a required assertion or approved threshold failed.
- `flaky`: the first attempt failed and a later diagnostic retry passed; gate policy still treats the initial failure as unresolved until reviewed.
- `blocked`: environment/provider/security precondition denied execution.
- `not_verified`: required evidence, dataset, threshold, or dependency is unavailable.

Do not aggregate `blocked`, `flaky`, or `not_verified` into a successful score.
