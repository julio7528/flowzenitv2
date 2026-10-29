# Test Environment Identity Guard: SPEC-013

**Status**: Draft safety contract. It does not select a remote project or authorize database access.

## Preflight inputs

```text
TestEnvironmentRequest = {
  mode: "unit" | "contract" | "integration" | "db" | "e2e" | "provider_opt_in",
  testModeEnabled: boolean,
  targetClass: "local" | "dedicated_nonproduction" | "browser_fixture" | "none",
  expectedProjectRef?: string,
  observedProjectRef?: string,
  isProduction?: boolean,
  destructiveFixtureWrites?: boolean
}
```

The request is process configuration, not product identity. Do not persist or print connection strings, service keys, environment variable values, or full DSNs.

## Guard result

```text
TestEnvironmentResult =
  | { state: "verified", targetClass, safeTargetRef? }
  | { state: "denied", reason: "not_test_mode" | "production_target" | "identity_missing"
      | "identity_mismatch" | "destructive_target_unknown" }
```

## Required order

1. Before constructing a database client or running fixture writes, require explicit test mode and a known target class.
2. A local target must match an explicitly configured local marker and expected host/port policy. A remote target must be dedicated non-production and must match an explicitly supplied expected project reference against independently observed identity evidence.
3. Missing, ambiguous, conflicting, or production evidence denies the suite. Do not infer safety from `NODE_ENV`, a branch name, URL substring, or a human-readable environment label alone.
4. Provider network remains denied in `unit`, `contract`, and ordinary `integration` modes. A separate explicit opt-in mode requires synthetic-only input, server-side credentials, a provider/model version record, and DEC-006 approval.
5. Fixture cleanup uses transaction rollback or exact run-scoped fixture IDs. Broad `TRUNCATE`, wildcard deletes, and cleanup by shared table name are prohibited.

## Non-tenancy boundary

The target guard isolates test environments to prevent damage; it does not create application tenants, organizations, owners, or row-level multi-user identity fixtures. Product authorization is tested against DEC-001's single-owner gate and the current actual grant/RLS state.
