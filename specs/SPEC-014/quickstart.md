# SPEC-014 CI and Release Validation Quickstart

Planning guide for future authorized implementation. No workflow, environment, migration, test, or deployment was run or configured in this task.

## Prerequisites

- Approved implementation SPEC/batch where applicable and a named CI provider.
- SPEC-013 evidence schema and positive test-target guard.
- Synthetic-only test inputs; no production credentials in ordinary CI.
- DEC-010 resolution before selecting runtime, region, plan, function duration, worker/queue, or staging mapping.
- DEC-001 verified before readiness can include private agent capabilities.
- Migration review and a manual publication owner for any schema change.

## Existing local validation commands

Future CI may start with the project's current commands:

```powershell
npm run lint
npm run build
npm test
```

Use additional SPEC-required security, evaluation, Playwright and isolated database commands after their dependencies exist. `npm run test:sdd-db` only tests the SDD control plane and must not substitute for product RLS/migration tests.

## Candidate CI job order

1. Checkout source and install using lockfile in a clean worker.
2. Run lint, build, and deterministic unit/contract tests without provider credentials or database access.
3. Scan source/assets/source maps/logs/artifacts with synthetic secret sentinels.
4. Run applicable SPEC-013 synthetic security/RAG/E2E gates.
5. Run DB/migration tests only in a local disposable or positively verified non-production target.
6. Generate a readiness report with actual gate results and missing/blocked states.
7. End with no deploy, promote, merge, commit, push, or production migration action.

This describes a validation pipeline only. GitHub Actions is a candidate host, not selected.

## Manual review scenarios

- Inject an intentional lint/test/build failure and verify the required gate fails with safe evidence.
- Mark a required E2E/DB check unavailable and verify aggregate readiness is not complete.
- Inject a synthetic server-secret sentinel into a Vite build fixture and verify scan failure without printing the value.
- Point a database test at a missing, mismatched, or production-class target; verify the SPEC-013 guard stops before any side effect.
- Review a synthetic migration packet with additive and irreversible examples; verify compatibility and recovery fields are present.
- Review an agent release while DEC-001 is unmet; verify private/privileged capability readiness is blocked.
- Verify the candidate workflow cannot invoke deployment/migration/publishing commands and does not receive corresponding credentials.

## Manual release/rollback review

If separately approved by the user in the future, the human release owner checks the readiness packet, confirms Vercel and Supabase environment identity, verifies any Vercel Git auto-deployment behavior, and performs only the expressly authorized publication operation. Recovery review treats Vercel deployment rollback, environment secret changes, and database migration recovery as separate steps. No command in this quickstart performs them.
