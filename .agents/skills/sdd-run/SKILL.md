---
name: sdd-run
description: Run an exact user-authorized FlowZenit SDD batch from its persisted Supabase manifest, sequentially, with bounded recovery and evidence.
---

# FlowZenit SDD runner

This workflow governs executable SPEC implementation only. Draft SPEC authoring, clarification, planning, task generation, analysis, checklist, roadmap, and governance-document work do not require a batch and are not authorized or executed by this runner. Implementation still requires the exact approved persisted manifest and all supervisor checks below.

Run this workflow only when the user explicitly asks to execute a batch and supplies or identifies its UUID. A database approval alone does not ask Codex to start a new session of work.

## Admission check

1. Read the project `AGENTS.md` and this skill. Use `npm run sdd -- status <batch-id>` and `npm run sdd -- validate <batch-id>`.
2. Confirm the batch is `APPROVED` or is `RUNNING` under this same active session. Verify the approval timestamp/actor, exact manifest hash, ordered SPEC IDs, and immutable versions from Supabase. The manifest is the sole execution allowlist.
3. Never add or reorder SPECs. If the target batch is `PAUSED`, stop. The user must authorize resumption through the privileged Supabase SQL channel; do not infer authorization from an earlier approval. An unrelated paused batch does not block a separate batch when its exact manifest is approved, all declared dependencies are complete, no duplicate SPEC is active, and writable scopes are disjoint. Do not change or implicitly resume the paused batch.
4. If a `RUNNING` batch has an expired lease, call `npm run sdd -- recover <batch-id>`. This only stops and persists the interrupted batch. Then stop and report that explicit user authorization is required to resume.
5. If the service credential, migration, manifest, authorization, or data integrity check is unavailable or inconsistent, do not start work.

## Execute in manifest order

For an approved batch, claim it once using `npm run sdd -- claim <batch-id> --owner <session-id> --key <uuid>`. Keep the lease token only in the active Codex session; pass it to every operational write. Never place it in the repository, SPECs, checkpoints, events, or reports.

Call `npm run sdd -- next <batch-id> --lease <token> --owner <session-id>` to obtain the next SPEC snapshot. If the response says `complete`, finish. Do not begin a later SPEC in the same manifest until `sdd_complete_spec` has passed for the current one. A separate batch may run only when its declared dependencies are complete and its task scopes do not overlap active work in another batch.

For each SPEC:

1. Compare the stored version and content hash with the checkout. Work only on listed acceptance criteria and exclusions.
2. Record each executable task in Supabase before delegating it. Include the configured agent profile and disjoint file scope. Parallelize only tasks whose dependencies and files do not overlap. Record completion and evidence for each task.
3. Treat subagents as trusted collaborators, not a security boundary. Give each the active SPEC, task, file scope, relevant contracts, and no unrelated work. Disable or interrupt agents if the batch is paused.
4. Run required project quality gates and SPEC-specific checks. Record exact command, exit code, and concise evidence. Never mark an unexecuted test passed or skip a required gate. Required passed command gates must include exit code `0`.
5. Persist useful checkpoints without secrets, prompts, transcripts, or credentials.
6. Call `sdd_complete_spec` only after all executable tasks are completed, no unresolved failure remains, and at least one required quality gate plus every other required gate is `PASSED` or has an exact authorized `WAIVED` record. Report waivers separately from passes.

## Snapshot-declared gate waivers

For a SPEC version registered after the waiver migration, an optional `## Gate waiver policies` table in `plan.md` may declare exact gate keys and one policy per gate: `NEVER`, `ALTERNATIVE_EVIDENCE`, `UNAVAILABLE`, or `ALTERNATIVE_AND_UNAVAILABLE`. Missing entries default to `NEVER`; the registered mapping is part of the immutable SPEC snapshot. Never edit a registered SPEC to change eligibility.

The runner may use `prepare-waiver` to validate the current batch, manifest, run, gate, evidence basis, and snapshot policy, then print the exact owner SQL. The runner must never execute `sdd_authorize_gate_waiver`; only the privileged owner SQL/MCP channel can authorize it after explicit user approval. A known failing check cannot use `UNAVAILABLE`. Preserve `WAIVED` as a distinct outcome in status, events, completion summaries, and reports.

## Failure correction and hard limits

When a quality gate or acceptance check fails, persist one failure with a stable fingerprint and root-cause diagnosis. Start a correction attempt through `sdd_begin_correction`. The database counts at most five correction attempts per failure by default and at most 7,200 seconds of unioned correction-window time per SPEC. Persisted limit extensions are additive and never reset either counter.

Open a fix window for the coordinating agent and each worker only while they are actively correcting that failure. Close every window when its agent stops; the database records window durations and unions overlapping intervals for the SPEC timer. Heartbeat before and after substantial operations and at least every few minutes while correction is active. A heartbeat response with `must_stop: true`, a `blocked` response, either threshold being reached, or a supervisor integrity error means:

1. Stop all new work immediately.
2. Interrupt all active subagents and close windows where the lease remains valid.
3. Persist concise root cause, failure ID, active task IDs, tests run, remaining work, and checkpoint evidence.
4. Let the database mark the SPEC `BLOCKED` and the entire batch `PAUSED`; verify with `status`.
5. Do not continue a later SPEC or resume. Report the precise batch/SPEC and wait for explicit user authorization.

Do not reset, delete, or locally reconstruct attempts or timing. The database closes open windows at the lease expiry during interruption recovery so idle time after a stopped Codex session is not counted as correction work.

## Completion report

Report the batch ID and manifest hash; each SPEC's state; tasks/agents; commands and actual gate outcomes; correction attempt count, unioned elapsed seconds and aggregate worker-window seconds; checkpoints; remaining limitations; and the final persisted batch state. If the Codex session ends, do not claim background execution. The next session must inspect persisted state and follow the recovery/resume rules above.

## Operational command reference

Use `npm run sdd -- help`. General status and runner writes use `SUPABASE_SECRET_KEY` from the ignored root `.env.local` (or an explicitly provided Node process environment). Never include the key in command arguments or any `VITE_*` variable. Approval, limit extension, and resume SQL must be prepared by `sddctl`, then executed only in the connected privileged Supabase SQL/MCP channel after the user explicitly authorizes the exact action.
