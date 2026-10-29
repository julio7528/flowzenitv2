# Implementation Plan: CI/CD, Environments, and Release Preparation

**SPEC ID**: `SPEC-014` | **Version**: `1` | **Manifest hash**: N/A (no batch created)

**Branch**: `main` preserved | **Date**: 2026-10-28 | **Spec**: [spec.md](./spec.md)

**Status**: Draft planning proposal. No CI provider, Vercel plan/region/runtime, environment values, migration, deployment, release, or batch is approved here.

## Summary

Prepare reproducible CI validation, environment boundaries, migration review, release readiness, smoke evidence, and manual rollback guidance while keeping publication under the user's control. The checkout currently has Vite, lint/test/build scripts, Supabase CLI configuration and a GitHub remote, but no CI workflow or confirmed server runtime. A GitHub Actions quality-only workflow is a candidate based on the remote, not an approved choice. Vercel Functions remain conditional on DEC-010; Vercel's environment and duration behavior depends on project plan/configuration. No workflow in this SPEC may commit, push, merge, deploy, promote, or apply production migrations.

## Technical Context

**Language/Version**: Existing JavaScript ES modules, Node-based tests, Vite build. CI runner Node version is not pinned in `package.json`; select/pin it only during implementation review.

**Primary Dependencies**: Existing `npm run lint`, `npm run build`, `npm test`, Supabase CLI. GitHub Actions is a candidate workflow host because `origin` points to GitHub; no workflow is present. Vercel environments/functions and Supabase migrations are integration targets, not changed by this planning task.

**Storage**: GitHub/Vercel CI artifacts should contain only allowlisted synthetic evidence. Local non-production Supabase is used for DB tests after SPEC-013 target identity verification. Production DB/provider credentials must not be available to ordinary CI jobs.

**Testing**: Existing lint/build/Node test commands plus SPEC-013's deterministic, security, E2E, and isolated database suites. Migration tests and smoke checks must use a disposable local or dedicated non-production target. Production smoke tests, if later approved, must be read-only/allowlisted and cannot imply private agent access.

**Target Platform**: Candidate GitHub Actions for CI-only validation; current Vercel delivery for future preview/manual production release; Supabase CLI/local PostgreSQL for migrations and tests. Provider, plan, region, custom staging support, and Functions runtime remain unselected.

**Project Type**: React/Vite static frontend with a planned but not-yet-configured server/API boundary and Supabase/PostgreSQL.

**Performance Goals**: No CI duration, function timeout, queue delay, or smoke latency target is approved. Record measurements before proposing a threshold; do not set `maxDuration` or other runtime values under this Draft.

**Constraints**: CI produces readiness evidence only. The Git provider workflow must have no publish credentials or deploy/migration steps. Vercel Git integration may independently auto-create/promote deployments on pushes or merges; manual publication requires reviewing/disabling that behavior or selecting a manual promotion process before release. Vite `VITE_` values are public. Secrets stay server-side and scoped by environment. Preserve current production data and behavior.

**Scale/Scope**: Development, test, preview/staging, and production profiles are logical roles. Vercel supports Local/Preview/Production defaults; Custom Environments depend on plan eligibility. This plan does not assert that the current account has a staging environment or any specific plan.

## Constitution Check

| Gate | Result | Evidence / constraint |
| --- | --- | --- |
| Preserve existing product behavior | PASS | Existing Vite/Supabase/Vercel usage and migrations are preserved; all migration and release operations remain manual. |
| User-controlled scope | PASS | No CI/provider/platform setting, production variable, migration, or deployment is changed here. |
| Security and data protection | PASS WITH BLOCKERS | No production credentials in CI; environment identity uses SPEC-013; server-only values stay outside `VITE_`; DEC-001 blocks private agent readiness. |
| Tests accompany design | PASS | CI gate, secret, migration, target guard, smoke and release-report tests are planned; none were run. |
| Durable and auditable execution | PASS | CI and release evidence is safe/allowlisted and does not replace the Supabase `sdd.*` execution ledger. |
| Bounded correction | N/A | Applies to a future exact approved SDD batch. |
| Small, reviewable changes | PASS | CI wrapper, environment contracts, migration evidence and release packet are distinct; no app behavior is included. |
| Manual publication | PASS | No commit, push, merge, deploy, promotion, or production migration is automated by the proposed workflow. |

## Dependencies and Contracts

- **Prerequisite SPECs**: SPEC-001 (secure server boundary/secret handling) and SPEC-013 (test-target guard, synthetic fixtures, evidence records) as declared in roadmap. Product API/runtime configuration remains conditional on SPEC-002 and DEC-010. SPECs that change DB/schema must provide their own migration plans and tests.
- **API/data contracts**: This SPEC owns environment profile, secret exposure classification, quality-gate result, migration-readiness report, release-readiness packet, and manual smoke checklist. It consumes SPEC-013 evidence and target guard, SPEC-001 access-gate evidence, SPEC-010 operational/audit references, and each feature SPEC's acceptance criteria. It does not define runtime/API contracts.
- **Security boundary**: CI jobs use synthetic inputs and local doubles by default. No production database/provider credentials are injected into standard checks. A Vercel runtime, if later selected, receives server-only secrets scoped to the approved environment. Presence of a key does not enable an agent capability; feature gate and DEC-001/006/010 still apply.
- **Database changes**: None now. Future migrations remain ordered source files, tested locally, reviewed for forward compatibility/data preservation, and manually applied by the user only after exact release approval. No CI job runs `db push` against production. Destructive/irreversible changes require a forward-recovery or compensating plan; database rollback is not presumed equivalent to code rollback.
- **Out-of-scope files/systems**: No `vercel.json`, `.github/workflows`, Vercel settings, GitHub secrets, Supabase config/schema/migrations, package versions, or deployment target are changed by this plan. Proposed paths remain future implementation artifacts.

## Architecture Proposal

1. **CI-only workflow**: Candidate workflow triggers on pull requests and manually dispatched validation. It runs lint, build, unit/contract/security, required SPEC-specific E2E/evaluation, and isolated DB gates. Missing or skipped required gate reports `NOT VERIFIED` and cannot return complete readiness. No deploy, migration, merge, push, commit, Vercel CLI, production token, or branch-promotion step is present.
2. **CI host selection**: GitHub Actions is a candidate because the local `origin` is a GitHub URL. The provider, required branch checks, artifact store, and manual trigger permissions remain implementation choices for review; do not create a workflow before approval.
3. **Profiles**: Define `local-development`, `ci-test`, `preview/staging`, and `production` profiles as policy records. Map them to Vercel Local/Preview/Production only after project review. A separate `staging` custom environment may depend on account plan/configuration. Test DB must be distinct from production and positively verified via SPEC-013.
4. **Secrets**: Public `VITE_*` configuration is limited to intentionally browser-visible values. Supabase Secret/service-role, DeepSeek, Gemini, LangSmith, Tavily, CI artifact, and future deploy credentials are server/CI secrets with environment-level scope and least privilege. Ordinary tests use no secrets; provider smoke credentials are isolated, opt-in, synthetic-only, and gated by DEC-006. No secret values appear in logs, artifacts or source maps.
5. **Migration lifecycle**: For each migration, record source/target schema version, additive/expand step, compatibility window, backfill/read/write behavior, failure/recovery, and rollback or forward-compensation. Test ordered migrations on local disposable Postgres with synthetic data and current schema state. Manual production application remains separate from CI; no migration is run now.
6. **Release packet**: Create a report containing exact SPEC/version, approved manifest reference if applicable, gate evidence IDs, migration inventory/compatibility, secret scan result, smoke results, rollback limits, unresolved decisions, and access-gate state. `ready_for_manual_review` is not permission to publish. `blocked` or `not_verified` is the result for missing gates, pending required decisions, incompatible schema, or unmet DEC-001.
7. **Vercel/Functions option**: If DEC-010 selects Vercel Node Functions, record the chosen plan, runtime, region, duration, async worker design, environment mappings, and cost implications. Vercel max-duration/region values vary by runtime/settings/plan and are not selected here. Avoid assuming streaming or long-running work fits current defaults.
8. **Deployment and rollback**: No deploy command is executed by CI. Before release, verify Vercel Git auto-deploy/auto-promotion behavior so a manual push/merge cannot unexpectedly publish. A human-approved manual deploy/promotion is a separate action. Vercel deployment rollback restores a prior deployment but does not roll back database schema; environment variables may not be rebuilt with the rollback, so smoke and compatibility review must verify both code and configuration.
9. **Smoke and observability**: Pre-release smoke uses synthetic/health-only checks and no private data while DEC-001 is unmet. Post-release checks, if separately approved, report safe status, revision, correlation reference and dependency category; no prompts, secrets or production rows. SPEC-010 remains operational telemetry source and SPEC-011 its owner-facing view.

## Execution and Recovery Plan

- **Sequential phases**: (1) gate/evidence model; (2) public/server environment and secret-boundary checks; (3) CI validation wrapper and test-target enforcement; (4) migration review/readiness packet; (5) manual smoke/rollback documentation and final conformance.
- **Parallel tasks**: Secret-sentinel tests and release-report schema can proceed in disjoint paths. CI provider workflow must wait until host choice. Migration validation and DB tests are serialized against one disposable schema.
- **Agent assignments**: No implementation agent is assigned. Future parallel tasks require disjoint files and no shared environment/database mutation.
- **Failure fingerprints**: Stable command/gate ID, environment profile, safe target category, migration version and error category. Never include secret values, production row content, environment dumps, or raw logs.
- **Checkpoint/recovery data**: Gate outcome, source revision, migration inventory/digest, environment class, secret-scan finding IDs, smoke status, and report version. No credentials, connection strings, transcripts or raw provider content.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Existing `npm run lint` in candidate CI | Exit code and tool version. |
| Build/type check | Yes | Existing `npm run build` plus output/source-map sentinel scan | Build result and zero secret sentinels. |
| Unit/integration | Yes | `npm test` and required SPEC suites | Exact exit code, suite results, skipped/unavailable status. |
| Database/RLS/contracts | When required | SPEC-013 target guard + local/dedicated non-prod migration and RLS tests | Verified target class, migration source version, allow/deny results and cleanup. |
| E2E/accessibility/security/evaluation | When required by included SPEC | Playwright after dependency approval, security scan, evaluation runner | Synthetic browser/provider environment, viewport/security evidence, retry state preserved. |
| Release readiness | Yes before manual review | Generate `release-readiness.md`/machine-readable report | No missing required gate; unresolved decision and DEC-001 state visible; no publish action run. |

No lint/build/test/DB/deploy command was executed for this plan.

## Decisions and Risks

- **DEC-001 APPROVED**: passkey remains client-only; private endpoints/operations stay blocked until a server access control is approved, implemented and verified. Release readiness for such capabilities stays blocked.
- **DEC-005/006 PENDING**: product data retention and provider disclosure govern logs/evidence and external calls. CI artifacts need a separate retention review if they might contain anything beyond synthetic metadata.
- **DEC-010 PENDING**: runtime, region, Vercel plan, function duration, background workers and queue model stay unselected.
- **DEC-011 PENDING**: model selection/configuration is not a release-platform decision and remains open.
- **DEC-012 PENDING**: provider usage/bounds remain open; this SPEC does not set budgets or rate limits.
- **CI provider**: repository remote suggests GitHub Actions, but no workflow/config exists and this is not approved.
- **Vercel auto-deploy risk**: CI exclusion alone does not prevent a Vercel Git integration from creating/promoting a deployment on a manual push/merge. Review project deployment settings before any future publication; no settings were read or changed.
- **Rollback asymmetry**: code rollback does not reverse DB migrations or necessarily update environment variables. Require migration compatibility/forward recovery and environment-specific smoke evidence.
- **Staging availability**: Vercel Local/Preview/Production are documented; custom staging support may depend on plan. Do not assume a distinct staging environment exists.
- **Database drift**: repository `supabase/config.toml` currently describes the local database and migrations, not a verified remote schema or environment. Do not compare/apply against a remote target without explicit future authorization.

## Project Structure

### Documentation (this feature)

```text
specs/SPEC-014/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── environment-profile.md
│   ├── secret-boundary.md
│   ├── quality-gate-report.md
│   ├── migration-readiness.md
│   └── release-readiness.md
└── tasks.md
```

### Proposed future files (not created by this plan)

```text
scripts/ci/qualityGates.js
scripts/ci/releaseReadiness.js
scripts/ci/secretSentinel.js
ci/quality-gate-contract.json
.github/workflows/quality.yml       # candidate only if GitHub Actions is approved
supabase/tests/product/             # owned by SPEC-013 / database SPECs
docs/release/                       # manual review packet and rollback playbook
```

**Structure Decision**: Keep gate orchestration separable from a provider-specific workflow. GitHub Actions is a candidate wrapper only; the provider workflow can be added after approval. Vercel and Supabase settings are managed outside this documentation plan.

## Complexity Tracking

No constitution exception is proposed. Separating CI readiness from Vercel publication and separating code rollback from database recovery is necessary to preserve user control and production data.
