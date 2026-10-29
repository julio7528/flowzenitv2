# FlowZenit V2 engineering rules

- Preserve the existing React/Vite, JavaScript, Supabase, and Vercel architecture unless an approved SPEC explicitly changes it.
- Documentation for Draft SPECs may be created or revised without a registered or approved batch. This includes `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, checklists, roadmaps, and planning documentation.
- Documentation commands do not approve a SPEC, change an approved decision, approve a batch, or authorize implementation. SPECs remain `Draft` unless the user explicitly approves a status change.
- Implementing a SPEC requires an exact, explicitly user-authorized, approved SDD batch manifest and immutable SPEC version. Never add, reorder, or replace a SPEC in that manifest.
- Execute implementation SPECs in manifest order. A later SPEC starts only after the current SPEC's required quality gates pass.
- In FlowZenit, `$speckit-implement` is not a standalone implementation path; execute implementation only through `$sdd-run <batch-id>` after its admission checks pass.
- Parallelize only independent tasks with disjoint file scopes. Record assignments, results, and evidence in Supabase.
- Do not execute approval, limit-extension, or resume RPCs through the runner credential. These actions use the privileged Supabase SQL channel after explicit user authorization.
- Enforce the 5-attempt and 120-minute-per-SPEC correction limits. Count overlapping correction windows once, preserve counters across sessions, and pause the entire batch at either limit.
- Never place credentials, tokens, chat transcripts, or private prompts in SPEC snapshots, checkpoints, audit details, CLI output, or source control.
- Use physically isolated database tests by default. The only current exception is owner-authorized synthetic fixture testing for SPEC-004@2 against the existing FlowZenit V2 development Supabase project `flowzenithv2` (`twikxeloeftczwbpjvzr`). Before test writes, verify the exact project, schema, permissions, and absence of the run-specific fixture marker. Use synthetic records only, record created IDs and parent relationships, prefer rollback, and otherwise clean up only captured IDs in dependency order. Preserve all preexisting records and never use agent endpoints for these direct contract tests. This scoped exception does not change the default for other SPECs. Do not alter production behavior, migrations, grants/RLS, or deployment settings.
- Run the applicable lint, build, unit, integration, security, and acceptance checks. Report commands and real results; do not infer a pass.
- Do not commit, push, merge, deploy, reset, or discard user changes. The user performs version-control publication manually.

## SDD entrypoints

- Draft documentation: `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, and `$speckit-analyze`; these do not require a batch or change SPEC/decision approval state.
- Functional implementation: `$sdd-run <batch-id>` only, after exact-manifest admission checks. `$speckit-implement` is not a standalone entrypoint.
- Operational commands: `npm run sdd -- help`.
- SDD operational state lives in the Supabase `sdd` schema. Local files hold SPEC source, Draft planning documents, governance documentation, and migration source code.
