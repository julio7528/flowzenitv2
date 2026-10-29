# Research: SPEC-013 Test and Evaluation Platform

**Status**: Draft research. Findings are from read-only repository inspection and official primary documentation checked 2026-10-28. No tests, builds, database operations, dependency installs, or provider calls were performed.

## Repository findings

- `package.json` currently defines `npm test` as Node's built-in test runner, `npm run lint` as Oxlint, `npm run build` as Vite build, and `npm run test:sdd-db` as a local Supabase SQL smoke test. Current test files are `tests/dailyTimeline.test.js`, `tests/sddctl.test.js`, and `supabase/tests/sdd_governance_smoke.sql`.
- The SQL smoke is for the SDD control plane. It is not a FlowZenit product RLS test and must not be reported as one.
- There is no Playwright package/command, dedicated test-target identity guard, product RLS suite, evaluation runner, provider-mock framework, or coverage threshold in the inspected project configuration.
- Vite explicitly exposes only the `VITE_` environment prefix to browser code. Keep server/provider keys outside that prefix and add bundle/sentinel checks as implementation tasks.
- The existing product migrations include broad anonymous access. That state is not a safe agent authorization boundary; isolated DB tests must characterize it and the server access gate must fail closed until DEC-001 is satisfied.
- Related Draft contracts already define deterministic model/tool/clock doubles (SPEC-002), synthetic history/checkpoint cases (SPEC-003), structured domain outputs (SPEC-004), injection/confirmation fixtures (SPEC-005), fixed-clock temporal tests (SPEC-007), embedding/outbox failure cases (SPEC-008), retrieval metrics and dataset shape (SPEC-009), audit/trace allowlists (SPEC-010), and chat source usability (SPEC-012). SPEC-013 standardizes the harness and evidence, not the individual domain contracts.

## Decisions and rationale

### Keep ordinary tests offline and deterministic

- **Decision**: Default suites use local doubles and an outbound-network deny adapter; no provider credential is required.
- **Rationale**: This makes routine test runs reproducible and prevents accidental disclosure or cost.
- **Alternative considered**: Run every test against live models/services. Rejected because it introduces non-determinism, external data transfer, and provider dependency into standard gates.

### Isolate DB tests with positive target identity

- **Decision**: Require a test-mode marker and positively verified local/dedicated non-production target before creating a database client or running fixture writes. Missing or conflicting identity exits before any side effect.
- **Rationale**: A label such as `test` or a URL hostname alone can be misconfigured. The guard needs independent expected-target evidence and exact cleanup ownership.
- **Alternative considered**: Reuse the configured project and clean it afterward. Rejected because shared or production rows could be damaged and product data is not test data.

### Keep the harness independent from later feature implementations

- **Decision**: SPEC-013 retains its roadmap prerequisite on SPEC-001 and runs against versioned synthetic contracts before later features exist. Integration suites are enabled as owning SPECs supply approved contracts.
- **Rationale**: Adding dependencies on every feature it tests would create an implementation-order cycle and contradict the roadmap's foundation-first path.
- **Alternative considered**: Make SPEC-013 depend on SPEC-002 through SPEC-012. Rejected because it would make the shared test harness unavailable until after all features it is meant to support.

### Reuse existing evaluator vocabulary

- **Decision**: SPEC-009 owns relevance case semantics/metrics; SPEC-013 owns dataset execution and evidence envelopes. SPEC-012 owns the 90% outcome, with its protocol proposed here.
- **Rationale**: This avoids duplicating RAG metric definitions while giving safety, retrieval, grounding, and usability evaluations one reproducible evidence envelope.
- **Alternative considered**: Create a second retrieval metric contract in SPEC-013. Rejected because that would create two competing acceptance sources.

### Handle flaky E2E results transparently

- **Decision**: Preserve first-attempt failure and report a retried pass as flaky/diagnostic, not an unqualified pass.
- **Rationale**: Playwright distinguishes passed, flaky, and failed tests and can capture traces/screenshots/videos. These artifacts can leak page content, so FlowZenit should use synthetic data and safe artifact retention only.
- **Alternative considered**: Accept any retried success as pass. Rejected because it hides reproducibility and can mask a real access/security failure.

## Official documentation reviewed

- Playwright Test fixtures isolate test setup/state by test; see [Playwright fixtures](https://playwright.dev/docs/test-fixtures).
- Playwright supports trace/screenshot/video capture under configured modes; FlowZenit must restrict artifacts to synthetic data and approved retention; see [Playwright test use options](https://playwright.dev/docs/test-use-options).
- Playwright records retry outcomes as passed, flaky, or failed; this supports retaining the initial result instead of hiding flakiness; see [Playwright retries](https://playwright.dev/docs/test-retries).
- Supabase documents database testing with pgTAP via `supabase test db` and transaction rollback in examples; see [Supabase database testing](https://supabase.com/docs/guides/database/testing) and [Supabase testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting).

## Proposed SPEC-012 SC-001 protocol (not approved)

Propose a fixed, versioned set of 100 synthetic pt-BR positive read-only scenarios, provisionally divided into five strata of 20: exact status/date/time, hierarchy lookup, daily/weekly planning, recurrence/relative-time, and semantic-name/synonym lookup. Every case has fabricated domain records, a single pre-labelled source reference, and a deterministic expected answer/evidence set. Keep ambiguity, no-result, stale, and partial cases as separate negative/abstention suites rather than counting them in the positive source-identification denominator.

Score one success per scenario only when the expected answer is correct, the matching source reference is visible and identifiable without hints, and no unsupported fact appears. Report numerator, denominator, per-stratum result, fixture IDs, dataset version and digest. If the cases are treated as a sample from a defined task distribution, report a two-sided 95% Wilson binomial interval; because the dataset is fixed and synthetic, label the interval descriptive unless the sampling frame and independence assumptions are justified. A participant-clustered method would be needed if repeated human participants are recruited.

The term “synthetic users” needs review: scripted interaction cases can verify source display and workflow completion, but not human comprehension. If SC-001 means unaided human usability, run a separate volunteer study on synthetic records and obtain approval for the participant population, sample size, protocol, consent and scoring. The proposed `n=100`, five-stratum mix, outcome definition, interval method, and any release threshold remain proposals; this does not change SPEC-012's 90% criterion.

## Open decisions and unresolved research boundaries

| Item | Status | Planning impact |
| --- | --- | --- |
| Playwright package/version and trace artifact handling | Pending implementation dependency | E2E tasks can be specified, but package installation and CI integration await approval. |
| Database target marker and accepted non-production identity evidence | Proposal; implementation detail needs review | DB tests refuse unknown/production/mismatched targets. Do not choose a remote project or connection now. |
| Dataset owners, review process, and release/version policy | Proposed process | No real/private prompt or transcript can enter the dataset. |
| RAG/grounding pass thresholds, k, minimum gain, abstention | Pending; SPEC-009 | SPEC-013 reports metrics, does not choose pass values. |
| SPEC-012 SC-001 meaning/sample/protocol | Pending review | Use proposal above; do not assert usability or release readiness until clarified. |
| Live provider and LangSmith evaluation permissions | DEC-006 pending | Default adapter remains fake/local; no live call. |
| Metric artifact retention | Policy not specified | Store sanitized evidence only and obtain retention review before long-lived CI artifacts. |
