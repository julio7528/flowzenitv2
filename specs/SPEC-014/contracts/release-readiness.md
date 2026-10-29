# Manual Release Readiness Contract: SPEC-014

**Status**: Draft report contract; `ready_for_manual_review` is not approval or publication authorization.

## Required sections

- Exact SPEC IDs/versions and approved manifest reference if implementation is in an SDD batch.
- Required gates, commands, actual exit codes, evidence refs, and skipped/blocked/not-verified results.
- Test environment identity, synthetic data provenance, security/secret-scan result, and provider opt-in state.
- Migration list/digests, compatibility window, data preservation, failure response, rollback/compensation, and manual application owner.
- Vercel runtime/region/plan/duration fields only if chosen by DEC-010; otherwise mark unresolved.
- Smoke test method/results, correlation identifiers, and safe operational evidence. No private rows or user prompts while DEC-001 is unmet.
- Open decisions and whether they block the specific release scope.
- Explicit statement that CI did not deploy, merge, push, commit, or apply production migrations.

## Readiness states

- `ready_for_manual_review`: all required evidence for the candidate scope exists; human approval/release action remains outstanding.
- `blocked`: a required security/compatibility condition is unsatisfied, including unmet DEC-001 for private agent capabilities.
- `not_verified`: evidence, decision, target identity, or required runner is unavailable.

The report may distinguish a non-agent UI-only release from agent capabilities, but it must never mark a private/privileged agent endpoint ready before the SPEC-001 gate is approved, implemented, and verified.
