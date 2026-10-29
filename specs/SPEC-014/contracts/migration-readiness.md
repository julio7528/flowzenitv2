# Migration Readiness Contract: SPEC-014

**Status**: Draft review contract. No migration is created/applied by this SPEC.

## Review record

```text
MigrationReview = {
  migrationRef,
  sourceRevision,
  fromSchemaRef,
  toSchemaRef,
  changeClass,
  compatibilityWindow,
  dataPreservationEvidence,
  syntheticTestEvidence,
  failureBehavior,
  rollbackOrCompensation,
  manualApplication: true,
  reviewState: "ready_for_manual_review" | "blocked" | "not_verified"
}
```

## Required checks

1. Confirm the migration belongs to the exact approved SPEC version and has an ordered filename/digest.
2. Apply/test on local disposable Postgres or a separately verified non-production target; never connect to production from CI.
3. Test schema constraints, RLS/grants, backfill, concurrency and compatibility against synthetic fixtures as required by the owning SPEC.
4. Explain old-client/new-schema and new-client/old-schema behavior during any compatibility window.
5. Identify irreversible operations, backup/recovery assumptions, compensating forward migration and data-preservation evidence. A nominal `down` file is not enough unless reversal is proven safe.
6. Keep production application as an explicit manual operation outside CI and outside this documentation scope.

## Rollback boundary

Vercel code rollback, environment-variable rollback/rotation, and PostgreSQL schema/data recovery are separate operations. The release packet must name each mechanism and its limitations. If the migration has no safe rollback, describe a tested forward fix/compensating strategy and mark any unsupported restoration claim as blocked.
