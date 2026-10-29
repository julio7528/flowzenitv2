# Synthetic Dataset Manifest Contract: SPEC-013

**Status**: Draft proposal for test data; not a product API or database schema.

## Manifest

```json
{
  "schemaVersion": 1,
  "datasetId": "agent-readonly-ptbr",
  "version": "0.1.0",
  "syntheticOnly": true,
  "language": "pt-BR",
  "sourceSpec": { "id": "SPEC-004", "version": 1 },
  "caseRefs": [
    { "caseId": "read-status-001", "path": "cases/read-status-001.json", "digest": "sha256:<digest>" }
  ],
  "reviewState": "draft"
}
```

The sample is illustrative. Dataset version scheme, file format, reviewer workflow, and digest algorithm are proposals. A fixture must be synthetic by construction; `syntheticOnly` is a guard, not proof that a prompt is synthetic.

## Required case semantics

- Stable `caseId`, controlled category, locale, synthetic request/records, expected route/outcome, expected evidence/source references, and side-effect expectation.
- RAG cases reuse SPEC-009's query class, entity type, relevant source refs, expected citation support, and security fixture semantics.
- Temporal cases use SPEC-007 fixed reference instants and `America/Cuiaba`; record the tzdb/ICU version if the implementation exposes it.
- Security cases include direct/indirect injection, private-data sentinel leakage, disabled access, untrusted retrieved content, malformed tool arguments, replay and no-side-effect expectations.
- No production transcript, real record ID, secret, provider response body, cookie, or identity principal enters the dataset.

## Versioning and review

- Any changed case meaning, expected route/source, label, or synthetic record increments `version` and updates the manifest digest.
- Retired datasets remain identifiable by version but cannot silently replace a baseline.
- New cases require source SPEC, category, and expected outcome; missing labels make the evaluation `not_verified`.
- Dataset updates are reviewed as documentation/test-data changes. This SPEC does not define CI artifact retention or approve a threshold.
