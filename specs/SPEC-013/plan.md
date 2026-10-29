# Implementation Plan: Agent Test and Evaluation Platform

**SPEC ID**: `SPEC-013` | **Version**: `1` | **Manifest hash**: N/A (no batch created)

**Branch**: `main` preserved | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Status**: Draft planning proposal. No suite, dependency, quality threshold, SPEC, or batch is approved by this plan.

## Summary

Create reusable test support for FlowZenit agent work while preserving tests owned by each feature SPEC. Keep ordinary unit/contract/evaluation runs deterministic and offline, provide typed doubles for model/tool/clock/embedding/search/tracing ports, and require a positively verified non-production target before any database test can create or alter data. Version synthetic datasets and record only safe, reproducible gate evidence. Product private-data and privileged-operation tests must prove fail-closed behavior while DEC-001 is unmet. RAG and chat quality metrics are reported against synthetic fixtures; acceptance thresholds and real-provider evaluations remain pending their decisions.

## Technical Context

**Language/Version**: JavaScript ES modules. The project currently uses Node's built-in `node:test`; the Node runtime version is not pinned in `package.json` or a version file found during this read-only review.

**Primary Dependencies**: Existing `node:test`, Oxlint, Vite, Supabase CLI/local stack. Playwright Test is requested by the SPEC but is not declared in `package.json`; adding its package/version is a future dependency decision. No evaluation, provider-mocking, or coverage package is currently configured.

**Storage**: Versioned synthetic fixtures in the repository; temporary output for local runs; optional CI evidence artifact containing allowlisted metadata only. Database integration tests use a local disposable database or a dedicated positively identified non-production project. Never use production data or modify the current project during ordinary runs.

**Testing**: Existing commands are `npm test`, `npm run lint`, `npm run build`, and `npm run test:sdd-db`. The last command exercises the SDD governance database smoke test only; it does not prove product RLS. Add a separate test/evaluation command registry only after tool selection is reviewed.

**Target Platform**: Developer machines and isolated CI workers; a local Supabase stack or explicitly configured non-production database for DB/RLS suites; browser E2E after Playwright is approved and added.

**Project Type**: Existing single-project React/Vite application plus Node test support and Supabase SQL test assets.

**Performance Goals**: No duration/throughput threshold is approved. Record suite duration and dataset size so later limits can be reviewed; do not skip or soften a gate to meet a guessed time budget.

**Constraints**: Synthetic fixtures by default; zero live provider/network calls in ordinary runs; never serialize credentials, private prompts, transcripts, production rows, or raw provider bodies into fixtures/reports. Access-gate tests must demonstrate zero private reads/side effects while DEC-001 is unmet. No fixture needs owner UUIDs, organizations, or tenant columns.

**Scale/Scope**: Shared harness complements feature-owned tests. It does not consolidate all gates into one suite, implement product authorization, enable provider calls, or choose RAG/grounding acceptance thresholds.

## Constitution Check

| Gate | Result | Evidence / constraint |
| --- | --- | --- |
| Preserve existing product behavior | PASS | Existing `node:test`, lint/build, domain tests and SDD database smoke remain intact; new suites are additive. |
| User-controlled scope | PASS | Documentation only; no dependencies, tests, databases, CI, or runtime changed. |
| Security and data protection | PASS WITH BLOCKERS | Private and privileged routes must fail closed until DEC-001; live provider tests require explicit opt-in and DEC-006. Isolated test environment is not product multi-tenancy. |
| Tests accompany design | PASS | Unit, contract, integration, RLS, security, E2E, resilience, and agent evaluation methods are specified; none are claimed to have run. |
| Durable and auditable execution | PASS | Evidence is versioned, concise, and secret-free. The product test report is separate from the `sdd.*` execution ledger. |
| Bounded correction | N/A | Applies to a later approved SDD execution batch. |
| Small, reviewable changes | PASS | Proposed paths are confined to test support, fixtures, reports, and tests. |
| Manual publication | PASS | No commit, push, merge, deploy, reset, or discard. |

## Dependencies and Contracts

- **Prerequisite SPECs**: SPEC-001 is the only hard roadmap prerequisite. The platform must be usable with synthetic contract fixtures before SPEC-002 through SPEC-012 are implemented; each feature SPEC remains owner of its tests. Later integration suites consume those SPECs' approved contracts without creating a reverse dependency or cycle.
- **API/data contracts**: Reuse SPEC-002 model/tool/runtime ports; SPEC-003 history/checkpoint lifecycle; SPEC-004 domain query DTOs; SPEC-005 guardrail/confirmation contracts; SPEC-007 temporal resolver; SPEC-008 index/outbox; SPEC-009 evaluation case and metric names; SPEC-010 audit/trace allowlists; and SPEC-012 chat acceptance cases. SPEC-013 owns dataset manifests, test-target identity guard, evaluation result summaries, and safe evidence shape only.
- **Security boundary**: Standard suites install network-deny/provider doubles and require zero provider calls. Database target guard must positively identify a local/explicitly approved non-production target before any mutation; missing, ambiguous, production, or mismatched identity aborts before connecting/writing. Tests must not treat the existing passkey, anon grants, or test fixture scope as server authorization. RLS tests characterize actual database grants in an isolated target; no assumption is made that current product grants are secure.
- **Database changes**: No migration is owned by this SPEC. SQL tests may create fixture records only inside the isolated target and must use rollback or exact run-scoped IDs; broad truncate/wildcard cleanup is prohibited. Any future test-only schema extension needs explicit SPEC scope and review.
- **Out-of-scope files/systems**: Do not change product code, migration source, real Supabase data, provider credentials, Vercel settings, or SDD operational tables. The local SDD smoke suite remains separate from product RLS and test evidence.

## Architecture Proposal

1. **Layered suites**: Keep pure unit tests on `node:test`; contract tests validate JSON/DTO/state transitions; isolated database tests validate RLS, constraints, and transaction behavior; browser E2E covers routes/accessibility; evaluation suites compute retrieval/grounding/safety metrics. Feature-specific suites stay beside their owning SPEC's implementation paths.
2. **Deterministic ports**: Provide in-memory doubles for model, tool registry/executor, clock, embedding, lexical/vector search, graph checkpoint, audit/tracing, external web search, and network. Each double exposes call counts and sanitized inputs so tests can assert no unauthorized call or side effect.
3. **Network and secret controls**: Default all outbound HTTP/provider adapters to deny. A test explicitly supplies a fake adapter. Scan test output, generated evidence and browser bundles for known synthetic secret sentinels and forbidden data patterns; never scan by logging actual secrets.
4. **Synthetic datasets**: Store versioned fixtures under a test-only tree with a manifest, schema version, synthetic provenance, language, category labels, expected routes/sources, and expected safety/grounding outcome. Every fixture must be authored from fabricated values. Dataset updates require a version change and review of added/removed cases.
5. **Database target guard**: Before creating a DB client or opening a destructive connection, check explicit test mode, an expected environment marker, non-production project/database identity, and allowed host/project reference. Any missing or conflicting evidence exits before DB side effects. Never infer “non-production” solely from an environment name.
6. **Evaluation runner**: Read a pinned fixture version, run a named deterministic adapter, compare against labels, and emit aggregate counts/metrics plus a digest of fixture IDs. Do not store raw prompt/answer payloads in routine evidence. SPEC-009 owns the detailed relevance labels/metrics; SPEC-013 standardizes execution and evidence.
7. **RAG and grounding**: Compare lexical-only, vector-only, hybrid, and SPEC-004 structured query baselines on the same synthetic cases. Report Recall@k, MRR, nDCG@k where labels support it, exact-query routing, citation support, freshness/abstention, and unsupported-claim failures. Keep `k`, minimum gain, abstention and citation thresholds pending user approval; no vector result can authorize a private read.
8. **LangGraph/LangSmith**: Exercise graph routing and failure paths locally with deterministic model/tool doubles. Validate LangSmith exporter mapping with a fake sink and redaction assertions. Any live LangSmith evaluation is opt-in only, uses synthetic content and server-side credentials, records model/dataset version, and remains blocked by DEC-006 until that decision is approved.
9. **Browser E2E**: Playwright is a proposed runner, not installed or approved. After dependency approval, configure isolated browser contexts and synthetic server fixtures; cover 1440/820/390 widths, keyboard/focus/live-region behavior, closed access gate, and chat scenarios. Preserve first-attempt failures; retries may diagnose flakiness but must not convert an initial failure into an unqualified pass.
10. **Evidence**: Emit an allowlisted record with SPEC/criterion, command, exit code, commit/revision, environment identity category, dataset/fixture version and digest, suite, result, duration, counts, metrics and failure category. CI artifact retention policy remains a review item; no prompts, transcripts, secrets, provider response bodies or production values are stored.

## Proposed SPEC-012 SC-001 Evaluation Protocol

This is a proposal for review, not a change to the 90% criterion or an approved release threshold.

- Freeze a versioned dataset of **100 synthetic read-only scenarios**, tentatively 20 each across exact status/date/time, hierarchy lookup, daily/weekly planning, recurrence/relative-time, and semantic-name/synonym query classes. Each positive case has fabricated domain records and a pre-labelled expected source reference. Ambiguous, no-result, stale, and partial cases live in separate safety/abstention strata and do not enter the positive source-identification denominator.
- Define one binary success per scenario: the expected read-only result is produced, the correct source reference is visible and identifiable without a hint, and no unsupported factual claim is present. Report numerator/denominator overall and by stratum, plus the dataset version/digest and failed case IDs (IDs only in routine output).
- If the 100 cases are treated as a sample from an intended task distribution, report a two-sided **95% Wilson interval** around the observed proportion. Because a fixed synthetic benchmark does not establish population representativeness by itself, label this interval descriptive; use a stratified bootstrap only if a sampling frame and repeated/clustered observations are justified and approved.
- The phrase “synthetic users” is ambiguous: scripted scenarios can verify visible source-reference correctness, but cannot establish human comprehension. If SC-001 intends unaided human usability, use a separate study with volunteers working only against synthetic data, predefine tasks and scoring, report participant/task denominators and a participant-clustered interval, and seek approval for recruitment/sample design.
- Keep the proposed `n=100`, category mix, success definition, interval method, and any pass threshold pending user review. Do not mark an unrun study as passed.

## Execution and Recovery Plan

- **Sequential phases**: (1) synthetic fixture/version contract and test-target guard; (2) deterministic unit/contract suites; (3) security, model/retrieval, and grounding evaluations; (4) isolated persistence/RLS/recovery suites; (5) Playwright E2E and evidence reporting after tooling approval.
- **Parallel tasks**: Fixture schema, provider doubles, and test-target guard can be authored in separate paths. RAG evaluator and grounding evaluator can work independently after the shared case/evidence contract stabilizes. Database tests are serialized per isolated DB to avoid schema/cleanup races.
- **Agent assignments**: No implementation agent is assigned by this plan. Under a later approved batch, use separate disjoint test-support paths; database mutation tests run serially against isolated targets.
- **Failure fingerprints**: Stable category plus suite, fixture ID, expected/actual contract field, and sanitized exception class. Never use prompt text, database rows, credentials, raw model output, or provider body as a fingerprint.
- **Checkpoint/recovery data**: Dataset version/digest, test command, environment category, suite state, case IDs, counts, metrics, and sanitized failure category. Do not persist open DB credentials, transcripts, raw prompts, or live provider content.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Existing `npm run lint` in implementation | Test and fixture code introduces no lint issues. |
| Build/type check | Yes | Existing `npm run build` in implementation | Test-only dependencies are absent from the browser production bundle. |
| Unit/contract/integration | Yes | Existing `npm test` plus approved focused suites | Deterministic behavior, tool contracts, state transitions, idempotency and no-provider-call evidence. |
| Database/RLS | Yes, when a database feature is in scope | Local `supabase test db`/pgTAP or a dedicated positively verified non-production target | Guard rejects production/unknown targets before side effects; RLS/grant outcomes and fixture cleanup are recorded. Existing `npm run test:sdd-db` is not a product RLS test. |
| E2E/accessibility/security/evaluation | Yes, proportionate to SPEC | Playwright after dependency approval; deterministic graph/evaluation runner | Viewport and keyboard evidence, injection/no-leak/no-side-effect assertions, grounded retrieval metrics and dataset version. |

No command or test was run as part of this documentation task.

## Decisions and Risks

- **DEC-001 APPROVED** but its adequate server access control is not yet implemented/verified; all protected API tests must pass closed-gate behavior and make zero private reads/side effects until then.
- **DEC-005 PENDING**: product memory/checkpoint/audit retention and deletion. Synthetic test evidence must not contain private artifacts; CI evidence retention requires an explicit safe policy.
- **DEC-006 PENDING**: real provider tests and external LangSmith evaluations remain disabled until exact data disclosure is approved.
- **DEC-007 PENDING**: vector corpus/chunk value; synthetic relevance results cannot alone approve real corpus indexing.
- **DEC-009 PENDING**: security fixtures may test a synthetic confirmation matrix, but its results do not approve real confirmation policy.
- **DEC-010 PENDING**: provider/runtime/worker execution and any live E2E host remain unselected.
- **DEC-011 PENDING**: exact model/embedding versions remain fixtures/config inputs, not approved production selections.
- **DEC-012 PENDING**: call budgets, numeric rate/retry/time limits, and abuse thresholds are not selected here.
- **SPEC-012 SC-001**: sample composition, meaning of “synthetic users,” denominator and CI method are proposed above and need review before the metric becomes a release gate.
- **Playwright dependency**: the user requested E2E coverage, but no Playwright package or script exists. Its package/version and artifact handling must be settled before implementation.
- **RLS baseline**: repository migrations currently include broad anon access. Test the current baseline in isolation and require fail-closed agent APIs; do not label existing grants as secure or use them for private agent tests.
- **Flakiness and artifact leakage**: retries can obscure first-run failures; trace/screenshot artifacts can contain sensitive UI. Retain synthetic-only artifacts, report retry/flaky state separately, and never include real user content.

## Project Structure

### Documentation (this feature)

```text
specs/SPEC-013/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dataset-manifest.md
│   ├── test-environment-guard.md
│   ├── evaluation-run.md
│   ├── evidence-record.md
│   └── spec012-usability-protocol.md
└── tasks.md
```

### Proposed future test support (not created by this plan)

```text
tests/
├── fixtures/agent/<dataset>/<version>/
├── support/
│   ├── providerDoubles.js
│   ├── networkGuard.js
│   ├── testEnvGuard.js
│   └── secretSentinel.js
├── contract/
├── integration/
├── security/
├── evaluations/
├── e2e/                         # Playwright after dependency approval
└── results/                     # sanitized output, excluded from source control

supabase/tests/product/           # isolated product DB/RLS tests only
scripts/quality/                  # report runner and criterion/evidence mapping
```

**Structure Decision**: Add test helpers under `tests/` and DB tests under a product-specific subdirectory rather than reusing `sdd.*` test assets. Dataset and evidence contracts are platform-wide; capability implementations and tests remain owned by their feature SPECs.

## Complexity Tracking

No constitution exception is proposed. Separate environment verification and evaluator adapters are required to prevent test code from accidentally turning client-side passkey state or production database access into a test authorization mechanism.
