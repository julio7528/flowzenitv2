# Test and Evaluation Data Model: SPEC-013

**Status**: Draft test-platform contract. Entities below describe synthetic test/evidence data only; they do not define FlowZenit product tables or tenant/organization records.

## TestDatasetManifest

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | positive integer | Version of manifest shape; unknown required version fails. |
| `datasetId` | bounded stable identifier | Names one synthetic purpose, not a person or conversation. |
| `version` | immutable semver-like or date/revision label | Any semantic case/label change increments the dataset version. Exact scheme remains a proposal. |
| `syntheticOnly` | literal `true` | Missing/false rejects the dataset. |
| `language` | locale string | `pt-BR` for FlowZenit user-facing cases unless a future SPEC adds another locale. |
| `sourceSpec` | SPEC ID/version | Identifies the contract that owns the case semantics. |
| `caseRefs` | ordered array of case IDs and content digests | No free-form case/prompt payload is repeated in evidence. |
| `createdAt` | ISO instant | Metadata only; no user or production source timestamp. |
| `reviewState` | `draft \| reviewed \| retired` | A draft dataset cannot be a release gate. |

## EvaluationCase

| Field | Type | Rule |
| --- | --- | --- |
| `caseId` | bounded stable identifier | Unique within a dataset version; does not contain a real record ID. |
| `category` | controlled enum | Examples: `query`, `injection`, `authorization`, `retrieval`, `grounding`, `recovery`, `chat_usability`. |
| `syntheticRequest` | fabricated request text or structured input | Must not be copied from production conversations. Restricted to fixtures; routine reports identify the case ID only. |
| `syntheticRecords` | fabricated single-owner domain fixtures | Uses existing FlowZenit entity kinds and relations; no owner UUID, organization, tenant, or real ID. |
| `expectedRoute` | controlled route/tool outcome | Must match the owning SPEC contract (e.g. SPEC-004 structured fact or SPEC-009 semantic search). |
| `relevantSources` | fabricated source refs | Exact facts identify expected sources; references map only to fixture records. |
| `expectedOutcome` | controlled category plus allowlisted fields | May express answer, clarification, denial, no result, abstention, or safe failure. |
| `expectedSideEffects` | nonnegative expected count/category | Security cases generally expect zero when denied/gate-closed. |
| `labels` | controlled key/value set | Human-reviewed relevance/grounding/safety labels with reviewer role, not personal identity. |
| `caseDigest` | digest of canonical fixture content | Detects edits; not an authenticity or authorization mechanism. |

For SPEC-009 retrieval cases, reuse its `EvaluationCase` semantics and metrics rather than defining alternate relevance labels here.

## TestTargetIdentity

| Field | Type | Rule |
| --- | --- | --- |
| `runId` | random test-run identifier | Generated for one run; never a product conversation or SDD batch ID. |
| `mode` | `unit \| integration \| db \| e2e \| provider_opt_in` | Controls allowed adapters. Unknown modes fail. |
| `targetClass` | `local \| dedicated_nonproduction \| browser_fixture \| none` | `production`, unknown, or ambiguous class rejects before side effects. |
| `expectedProjectRef` | bounded non-secret marker or `null` | Required for a dedicated remote test DB and compared against positive target evidence. Do not log connection strings. |
| `observedProjectRef` | bounded marker or `null` | Captured in memory and reported only as a redacted/safe match category. |
| `testModeEnabled` | boolean | Must be true before any DB fixture write. |
| `verification` | `verified \| denied \| unknown` | Only `verified` allows the DB suite to proceed. |
| `reason` | safe enum | `not_test_mode`, `production_target`, `identity_missing`, `identity_mismatch`, `provider_network_disabled`, `verified`. |

Test target identity defines test safety only; it does not model multiple product owners, tenants, organizations, or row-level product roles.

## EvaluationRun

| Field | Type | Rule |
| --- | --- | --- |
| `runId` | test-run identifier | Joins suite results without joining product conversations. |
| `specId`, `criterionId` | SPEC and FR/SC reference | Each claimed gate maps to its owner criterion. |
| `revision` | source revision identifier | No secrets or private data. |
| `datasetId`, `datasetVersion`, `datasetDigest` | manifest reference | Required for dataset-backed evaluation. |
| `suite` | controlled suite name | Unit/contract/integration/db/security/e2e/evaluation/provider-opt-in. |
| `environment` | safe target class | Never includes secret environment values or full URLs. |
| `startedAt`, `durationMs` | instant and nonnegative integer | Values are operational metadata. |
| `result` | `passed \| failed \| flaky \| blocked \| not_verified` | A retry-pass after a first-attempt failure remains `flaky`. |
| `counts` | tested/passed/failed/skipped/retried integers | No negative values; required suite skips are failures/NOT VERIFIED. |
| `metrics` | allowlisted names and numeric result/interval | Threshold status is `unapproved`, `informational`, `pass`, or `fail`; a pending threshold cannot be `pass`. |
| `failureCategories` | safe enum array | No prompts, provider output, DB rows, stack traces, or raw test logs. |

## Safety invariants

- A dataset with non-synthetic provenance is rejected from normal local/CI evaluation.
- A `TestTargetIdentity` that is not `verified` stops before any side effect.
- A test suite without recorded required evidence is `not_verified`, never assumed passed.
- Raw output is retained only in a local synthetic debugging context if an approved policy allows it; shared/CI evidence contains the minimum allowlisted summary.
- The test/evaluation model has no tenant/owner columns and must not create multi-tenant assumptions in product DTOs.
