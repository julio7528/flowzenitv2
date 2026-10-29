# FlowZenit V2 SDD Constitution

This constitution governs software changes developed through approved FlowZenit SPECs. It establishes constraints, not authorization to start a feature or execution batch.

## Core principles

### I. Preserve product behavior

Keep existing React, Vite, JavaScript, Supabase, PostgreSQL, and Vercel integrations and established business rules. A breaking API, database, security, or scheduling change requires explicit inclusion in an approved SPEC and a compatibility plan.

### II. User-controlled scope

The user owns SPEC priority, order, batch membership, exact version, architectural decisions, production operations, and resumption after a pause. Execute only the immutable SPEC versions in the approved batch manifest. A later SPEC starts only after the current SPEC passes its required gates.

### III. Security and data protection

Use least privilege, private schemas, explicit grants, validated inputs, and secret-free evidence. Never expose service keys, database credentials, private prompts, or conversation transcripts in browser code, tests, SPEC snapshots, audit events, checkpoints, or logs. Never weaken existing RLS or permission boundaries to make an implementation convenient.

### IV. Tests accompany the design

Each SPEC defines acceptance criteria and proportional unit, integration, database/RLS, security, E2E, or agent-evaluation checks before implementation. A gate is passed only with actual command/output evidence. Tests that cannot run are reported as unverified and do not silently pass.

### V. Durable and auditable execution

Supabase `sdd` is the operational source of truth for manifest approvals, runs, tasks, failures, correction windows, limits, gates, checkpoints, and events. Retrying a request must not duplicate or reset persisted work. State transitions are explicit and evidence is concise, relevant, and non-sensitive.

### VI. Bounded correction

The default limit is five attempts per failure and 7,200 unioned wall-clock seconds of correction windows per SPEC. Overlapping windows count once toward elapsed time and independently toward worker-window time. Any reached limit with an unresolved failure pauses the entire batch; counters survive sessions and extensions are additive, explicit, and auditable.

### VII. Small, reviewable changes

Prefer focused changes and existing dependencies. Parallel work is permitted only for independent tasks with disjoint file scopes. Integrate and validate each SPEC before continuing. Do not alter unrelated files or user data.

### VIII. Manual publication

Codex does not commit, push, merge, deploy, reset, or discard changes. The user performs publication and version-control actions manually.

## SDD workflow and quality gates

The normal path is `DRAFT → READY_FOR_REVIEW → APPROVED → QUEUED → PLANNING → IMPLEMENTING → TESTING → VALIDATING → COMPLETED`. Failed checks enter `FIXING`; threshold exhaustion marks a SPEC `BLOCKED` and its batch `PAUSED`. Resuming a paused batch requires explicit user authorization in the privileged Supabase SQL channel. A session ending does not imply background execution.

Every SPEC identifies dependencies, scope, exclusions, contracts, risks, ordered tasks, file ownership, test strategy, objective acceptance criteria, and completion evidence. Quality gates are selected proportionally to the change, but lint, build, and applicable tests run for every implementation SPEC. Security-sensitive, persistence, and scheduling changes add integration/authorization checks. The conformance auditor is read-only and records PASS, FAIL, or NOT VERIFIED for each criterion.

## Governance

This constitution applies to all future SPECs. Amending it requires explicit user approval. It does not authorize any feature SPEC, database migration, production operation, provider usage, batch, or resumption.

**Version**: 1.0.0 | **Ratified**: 2026-10-28 | **Last Amended**: 2026-10-28
