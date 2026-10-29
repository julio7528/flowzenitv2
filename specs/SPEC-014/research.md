# Research: SPEC-014 Environments and Release Preparation

**Status**: Draft research from read-only checkout review and official product documentation checked 2026-10-28. No Vercel/GitHub settings, environment values, Supabase project, tests, migrations or deployment were accessed or changed.

## Repository findings

- `package.json` has `dev`, `build`, `lint`, `test`, `test:sdd-db`, `sdd`, and `preview`. There is no declared CI script or release/deploy script.
- The Git remote points to GitHub, but the checkout has no `.github/workflows/` directory. GitHub Actions is therefore a candidate, not an existing configured CI provider.
- `vite.config.js` sets `envPrefix: 'VITE_'`, which marks browser-exposed variables. Do not place server keys under that prefix.
- The Supabase CLI local config enables migrations and describes a local Postgres 17 development stack. It does not establish the remote production schema/version or justify running migrations remotely.
- No `vercel.json`, `.vercel` project binding or Vercel Functions/API code exists. The checkout's Vercel delivery does not establish plan, region, environment settings, automatic promotion behavior or agent runtime.
- The existing `npm run test:sdd-db` is an SDD control-plane smoke command; it is not product RLS or migration compatibility evidence.
- No CI job, production secret scope, deployment protection setting, manual promotion policy or rollback runbook is present in the checked files.

## Decisions and rationale

### Keep CI validation separate from publishing

- **Decision**: CI runs required checks and generates evidence only. Its credentials and job permissions exclude commit/push/merge/deploy/migration operations.
- **Rationale**: User retains all publication actions, and passing checks are not publication authorization.
- **Alternative considered**: Build-and-deploy workflow on a passing main branch. Rejected because it contradicts the manual release rule.

### Treat GitHub Actions as a candidate, not a selected platform

- **Decision**: Design provider-neutral gate commands and an optional GitHub Actions wrapper after review.
- **Rationale**: A GitHub remote exists, but no CI workflow or branch-check setup is configured in the checkout.
- **Alternative considered**: Assume GitHub Actions is approved from the remote URL. Deferred because repository hosting does not authorize a workflow or its secrets/permissions.

### Keep environment profiles distinct from product tenancy

- **Decision**: Local, test, preview/staging and production are deployment/test profiles. Test identity guard uses SPEC-013 and no product tenant/user fields.
- **Rationale**: Environment isolation protects data and credentials; it does not introduce multi-tenant product behavior.
- **Alternative considered**: Treat Vercel Preview or a custom environment as the only staging path. Deferred because project plan/configuration is unknown.

### Separate application rollback from schema recovery

- **Decision**: Release packet records code rollback, schema compatibility, and forward/compensating recovery separately.
- **Rationale**: Reverting a Vercel deployment does not reverse an applied database migration. Vercel rollback can also restore an earlier deployment without rebuilding environment variables.
- **Alternative considered**: Promise one-click rollback of app and DB together. Rejected because the systems have independent state transitions and a destructive migration may not have a safe down migration.

## Official documentation reviewed

- Vercel documents Local, Preview, and Production environments; custom environments such as staging have plan requirements. See [Vercel environments](https://vercel.com/docs/deployments/environments).
- Vercel environment variables can be scoped by environment, and changes apply to new deployments; this makes secret rotation/config changes part of release verification. See [Vercel environment variables](https://vercel.com/docs/environment-variables).
- Vercel Function maximum duration varies by runtime, configuration, fluid-compute state, and plan; it can terminate an invocation that exceeds the configured maximum. No value is selected here. See [Vercel Function duration](https://vercel.com/docs/functions/configuring-functions/duration) and [Vercel Fluid Compute](https://vercel.com/docs/fluid-compute).
- Vercel instant rollback switches to a prior deployment and does not rebuild the deployment; environment variable updates are not applied to that prior build. See [Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment) and [Instant Rollback](https://vercel.com/docs/instant-rollback).
- Supabase documents versioned local migrations and local testing before sharing/applying them. See [Supabase database migrations](https://supabase.com/docs/guides/local-development/database-migrations).

## Open decisions and planning impacts

| Item | Status | Planning impact |
| --- | --- | --- |
| GitHub Actions versus another CI host | Not approved | Gate scripts can be designed; provider-specific workflow and secrets permissions wait. |
| Vercel deployment linkage/auto-promotion | Not inspected/approved | Before publication, verify settings so a manual Git action cannot unexpectedly cause production deployment. |
| Vercel plan and custom staging availability | DEC-010 / account state pending | Do not claim a dedicated staging environment exists. |
| Server runtime, region, duration, async queue | DEC-010 pending | No Function config, max duration, region, or worker is selected. |
| Environment-specific Supabase targets | Not verified | Do not use current remote credentials; tests rely on SPEC-013 target guard and local/dedicated test target. |
| Secret names/owners/rotation and access rights | To be reviewed at implementation | This plan defines classes/scopes, not actual secret values or permissions. |
| Migration rollback/forward-recovery | Per migration, not a global default | A release candidate with irreversible data change needs an explicit compensating/recovery plan. |
| Provider smoke and usage limits | DEC-006/DEC-012 pending | Ordinary CI uses doubles only; opt-in live calls remain disabled. |
