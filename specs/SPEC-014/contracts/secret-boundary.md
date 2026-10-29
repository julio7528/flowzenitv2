# Secret and Build Boundary Contract: SPEC-014

**Status**: Draft safety contract for future CI and release configuration.

## Required separation

```text
Browser bundle: allowlisted public VITE_* values only
CI standard job: no production credentials; synthetic sentinels/doubles
CI DB job: isolated test credential only after SPEC-013 target verification
Server runtime: environment-scoped server secrets, only if DEC-010/runtime is approved
Provider smoke: disabled by default; explicit opt-in, synthetic data and DEC-006 approval
```

The contract describes classes and permissions, not actual secret values or variable creation.

## Scanning behavior

- Scan source, emitted assets, source maps, logs, and downloadable artifacts using synthetic sentinel strings.
- Report file/artifact, safe location and sentinel ID without echoing any matched value or full source line.
- Any server-secret sentinel in a browser artifact or normal CI log fails the security gate.
- Keep source-map generation/retention policy explicit; do not assume that a minified bundle is safe.
- Ordinary jobs must fail closed if a live provider credential is present but no opt-in mode is selected; credentials should not be injected in the first place.

## Permissions and leakage

- CI workflow permissions are minimum required for reading source and publishing safe check results/artifacts. No deployment, environment administration, migration, repository write, commit, push, or merge permission is granted to validation jobs.
- Vercel, CI and provider dashboards must scope secrets by environment and human role. This SPEC does not create/configure those scopes.
- Do not write secrets to logs, test snapshots, cache keys, artifacts, build metadata, source control, prompts, audit, or SDD snapshots.
