# FlowZenit SDD governance

The control plane is implemented with GitHub Spec Kit, project-scoped Codex roles, a small local CLI, and the private Supabase `sdd` schema. The SPEC source is versioned in `specs/<SPEC-ID>/`; live batches, approvals, leases, attempts, elapsed correction windows, tasks, gates, checkpoints, and audit events live in Supabase.

## Documentation and implementation authorization

Draft documentation work does not require a registered or approved batch. This includes creating or clarifying a Draft SPEC, preparing `plan.md` or `tasks.md`, analyzing completed artifacts, and editing checklists, the roadmap, or planning documentation. These actions do not approve a SPEC, alter an approved decision, approve a batch, or authorize implementation. Keep SPEC status `Draft` unless the user explicitly approves a status change.

Functional implementation remains batch-gated. Code changes, functional migrations or database changes, and executing an implementation SPEC require the exact user-authorized approved batch manifest and immutable SPEC versions. FlowZenit implementation runs through `$sdd-run <batch-id>` and remains sequential under the persisted supervisor gates. Draft authoring does not register or create a batch.

The local Spec Kit workflow at `.specify/workflows/speckit/workflow.yml` ends after Draft documentation generation. Its review gates only control whether the next documentation stage runs; they leave the SPEC in Draft, do not approve a decision or batch, and do not authorize implementation. Use `$speckit-clarify` and `$speckit-analyze` separately when needed.

## Setup and credentials

Install the Spec Kit CLI with the official instructions for the workstation, then run `specify check` and `specify integration status`. This repository is initialized for the Codex integration. The pinned Supabase CLI is installed as a project development dependency.

The root `.env.local` is the single local environment file. The React app uses the two `VITE_*` values; the SDD CLI parses `.env.local` in Node and uses only the server-side secret:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=<secret-key>
```

`.env.local` is ignored by Git. If `SUPABASE_URL` is omitted, the CLI falls back to `VITE_SUPABASE_URL`; the secret has no Vite prefix and is never read by frontend code. Vite is explicitly restricted to the `VITE_` prefix. Do not use a publishable/anon key for the CLI or commit the local file. The CLI redacts its configured secret from output and errors.

## Prepare a batch

1. Use `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, and `$speckit-analyze` as needed to author and review Draft documentation without a batch. These commands do not approve the SPEC. A registerable SPEC has `spec.md`, `plan.md`, and `tasks.md` plus a stable directory ID such as `AGENT-001`.
2. Register an immutable version: `npm run sdd -- register specs/AGENT-001 --by "operator"`.
3. Create an ordered candidate batch: `npm run sdd -- create-batch "Agent foundation" AGENT-001@1 AGENT-002@1 --by "operator"`.
4. Inspect `npm run sdd -- status <batch-id>` and `npm run sdd -- validate <batch-id>`. `npm run sdd -- prepare-approval <batch-id> --by "operator"` prints SQL bound to that exact manifest hash; it does not approve the batch.
5. Only after the user explicitly authorizes that exact batch, execute the prepared statement through the privileged connected Supabase SQL/MCP channel. The runner service key cannot execute approval, limit extension, or resume functions.
6. Start work only when the user explicitly invokes `$sdd-run <batch-id>` (or clearly requests that exact approved batch). The runner claims the lease and processes the immutable list sequentially.

Registration, batch creation, and lease claims derive stable namespaced UUID idempotency keys from their request data. Repeating a command after a lost response safely replays the same operation. `--key UUID` overrides the generated key when the caller needs an explicit retry identity; to intentionally create another identical batch, supply a new key.

Registration and batch creation are preparation steps for implementation only; they are not prerequisites for Draft documentation work.

## Pause, correction, and recovery

The database enforces five attempts per failure and 7,200 unioned correction-window seconds per SPEC by default. Overlapping windows are counted once for the SPEC wall-time cap; individual window durations are summed separately as worker-window time. Authorized additions are stored in append-only authorizations and add to the existing values.

`npm run sdd -- recover <batch-id>` converts an expired runner lease into `PAUSED`, closes windows at the lease expiry, preserves counters, and does not resume work. `npm run sdd -- prepare-extension <batch-id> <spec-id> <additional-attempts> <additional-seconds> --by "operator" --reason "..."` and `npm run sdd -- prepare-resume <batch-id> --by "operator" --reason "..." --owner "new-session"` print owner-only SQL. Execute such SQL through the privileged channel only after explicit authorization. Retrying an interrupted session never resets counters.

## Available commands

Run `npm run sdd -- help` for CLI syntax. The main commands are `health`, `status`, `events`, `register`, `create-batch`, `validate`, `prepare-approval`, `claim`, `heartbeat`, `next`, `record`, `recover`, `prepare-resume`, and `prepare-extension`.

The runner does not survive a Codex session in the background. A new session must inspect persisted status; expired running leases are recovered to `PAUSED` and require the user's explicit resumption authorization. A successful batch leaves all Git publication to the user.

## Test and migration workflow

`supabase/migrations/` is the versioned source for schema changes. `supabase/tests/sdd_governance_smoke.sql` exercises an isolated happy path, corrections, overlapping-window accounting, the fifth-attempt pause, additive extension, authorized resume, interruption recovery at lease expiry, rejection of unauthorized resume, completion, and role boundaries inside a transaction that rolls back all synthetic rows.

Run `npm test`, `npm run lint`, `npm run build`, and, with a fresh local Supabase stack, `npm run test:sdd-db`. Do not run `supabase db reset` against a linked or user-data environment. Remote migration application is a separately recorded deployment action; inspect the migration and validate its rollbackable smoke test first.

## Agent permissions and limitations

The nine profiles in `.codex/agents/` specialize architecture, backend/API, frontend, Supabase/PostgreSQL, LangGraph/RAG, security, QA, conformance review, and orchestration. The Codex `[agents]` setting caps concurrent subagents at three. Profiles disable Apps/MCP access. Codex subagents still inherit the parent shell sandbox and provider configuration; the profiles are task boundaries, not separate operating-system identities. Database enforcement protects approval, extension, and resume operations by withholding those function grants from `service_role`.

The recorded operator name/reason are supplied with each privileged SQL operation; they are not federated identity claims. Database persistence can recover state after interruption, but no worker continues in the background. Model/vendor spend limits are intentionally not enforced.
