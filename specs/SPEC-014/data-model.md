# Environment and Release Evidence Model: SPEC-014

**Status**: Draft planning model for CI/release metadata. This is not Vercel/GitHub configuration, secret storage, a database schema, or release authorization.

## EnvironmentProfile

| Field | Type | Rule |
| --- | --- | --- |
| `profileId` | `local-development \| ci-test \| preview \| staging \| production` | Logical profile. Availability/mapping is not assumed. |
| `platform` | `local \| ci-provider \| vercel \| supabase-local \| other-approved` | Provider choice remains pending where applicable. |
| `targetClass` | `local \| isolated_test \| preview \| production \| unknown` | `unknown` cannot run DB writes or readiness-sensitive checks. |
| `publicVariableNames` | allowlisted name array | Values are intentionally browser-visible; only names with an approved public classification may use Vite's prefix. |
| `serverSecretClasses` | enum array | Supabase server key, model/search provider key, tracing key, CI artifact/deploy credential. Values never appear in this model. |
| `providerCallsEnabled` | boolean | False by default; true requires explicit policy and DEC-006. |
| `databaseTargetRef` | safe opaque reference or `null` | A test target must match SPEC-013 positive identity guard; never store DSNs. |
| `accessGateState` | `closed \| verified \| unknown` | Private agent readiness requires verified SPEC-001 gate. |

## QualityGateResult

| Field | Type | Rule |
| --- | --- | --- |
| `gateId` | stable identifier | Links to a required check in the approved SPEC manifest. |
| `specId`, `specVersion`, `criterionId` | identifiers | Exact scope/version; no extra SPEC is inferred. |
| `commandName` | safe command label | Record command and actual exit code; do not log environment values. |
| `state` | `passed \| failed \| skipped \| not_verified \| blocked` | Missing/timeout/skipped required gate is not a pass. |
| `exitCode` | integer or `null` | Must be actual process result; null maps to not verified. |
| `evidenceRef` | safe artifact reference or `null` | Artifact must be synthetic/sanitized under SPEC-013. |
| `startedAt`, `durationMs` | instant and nonnegative duration | No threshold selected. |

## MigrationReadiness

| Field | Type | Rule |
| --- | --- | --- |
| `migrationRef` | ordered file/digest | Immutable migration source reference. |
| `fromSchema`, `toSchema` | version/ref | Must be established from test target, not assumed from local config alone. |
| `changeClass` | `additive \| backfill \| contract \| destructive \| unknown` | `unknown` blocks readiness. |
| `compatibilityWindow` | `expand_contract \| none \| not_applicable \| unresolved` | Destructive/contract change requires a reviewed compatibility plan. |
| `dataPreservation` | evidence ref | Describes synthetic tests and production preservation plan; never embeds production rows. |
| `rollbackStrategy` | `down_migration \| forward_fix \| compensating \| restore \| unresolved` | No rollback is promised without evidence. |
| `manualApplicationRequired` | literal `true` | CI cannot apply production migrations. |

## ReleaseReadinessReport

| Field | Type | Rule |
| --- | --- | --- |
| `reportId`, `sourceRevision` | identifiers | Immutable report reference and source revision. |
| `specManifestRefs` | exact SPEC/version list | If implementation uses SDD, references its approved manifest; report does not approve it. |
| `gates` | `QualityGateResult[]` | Every required criterion maps to evidence or not verified. |
| `migrations` | `MigrationReadiness[]` | Includes all in-scope migration compatibility/rollback notes. |
| `secretScan` | safe finding summary | Sentinel results only; never echo actual values. |
| `smoke` | synthetic/approved read-only outcomes | No private probe while DEC-001 is unmet. |
| `decisionStates` | DEC ID/state refs | Open decision is visible; no proposal becomes approval. |
| `accessGateState` | `closed \| verified \| unknown` | Private agent capability cannot be marked ready unless verified. |
| `readiness` | `ready_for_manual_review \| blocked \| not_verified` | Never means deployed, merged, approved, or authorized. |

## SecretExposureFinding

Contains only file/artifact reference, location category, secret class, sentinel match ID, and severity. It must not include the matched value, full line, token suffix, or an expanded environment dump.
