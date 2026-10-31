# Feature Specification: Persistent Conversational Memory

**SPEC ID**: SPEC-003
**Version**: 4
**Dependencies**: [SPEC-001, SPEC-002]
**Risk**: high
**Created**: 2026-10-28
**Status**: Draft — POC verification scope revised; implementation requires an exact approved SDD manifest
**Input**: Persist a canonical conversation history and LangGraph checkpoints while separating transcript, domain context, derived summaries, semantic memory, and audit metadata.

**Version history**: Version 2 recorded the owner-approved, SPEC-scoped retention policy, verified LangGraph/PostgreSQL compatibility, private-schema migration design, integrity-bound history cursor, and testable deletion/idempotency limits. Version 3 corrected dependency identifiers and was registered in a paused batch. Version 4 keeps the feature and storage contract, but makes Supabase SQL MCP synthetic database evidence plus Node adapter contract tests sufficient for the POC completion gate; a direct Node-to-PostgreSQL test URL/certificate is optional and is not claimed as passed. Prior registered snapshots remain immutable.

## Scope and exclusions

### In scope
- Server-side conversation and message persistence behind an internal repository interface.
- Stable, bounded history pagination, idempotent append, turn serialization, and replay-safe results.
- Separate, versioned LangGraph checkpoint persistence and fail-closed resume preflight against the SPEC-002 ExecutionLedger.
- Conversation lifecycle, scoped retention, deterministic deletion, and an administrative cleanup routine when no scheduler exists.
- Bounded context construction from complete canonical messages and per-conversation summaries with exact source sequence provenance.
- Private PostgreSQL schema and additive migration isolated from product tables and the SDD control plane.
- The existing Supabase PostgreSQL project is the only database target. No Docker, local PostgreSQL service, database branch, or second database is required for the POC.
- Synthetic database and runtime tests. DEC-001 remains closed; these internal capabilities are not available through an unauthenticated endpoint or to the end user.

### Explicitly out of scope
- Changing authentication, treating the browser passkey or service_role as user identity, exposing private reads or writes, or enabling production access while DEC-001 is closed.
- Any conversation UI, public history/export endpoint, share link, shared user, organization, tenant, or cross-user conversation access.
- Cross-conversation semantic memory, LangGraph Store, embeddings, transcript RAG, or transcript indexing.
- Sending real conversation content to DeepSeek, Gemini, LangSmith, or any external provider; DEC-006 remains globally pending.
- Domain mutations, new product entities, product table changes, production migrations, deployment, or another SPEC.
- An assumed cron, worker, or automatic background scheduler.

## Scoped DEC-005 policy

This SPEC applies the owner-approved, feature-scoped policy identifier **dec005-spec003-v1**. It resolves lifecycle choices only for conversation history, checkpoints, and their summaries in SPEC-003. The global DEC-005 remains PENDING for other kinds of memory, audit, and storage.

- Canonical conversation history expires 365 days after its last valid activity. Each accepted turn renews the deadline. Access checks enforce expiry before returning any content.
- Checkpoints expire no later than 30 days after their last valid update and never after the linked conversation expires. An expired checkpoint cannot resume a graph or invoke tools; valid history can remain until the conversation's own expiry.
- Summaries are derived artifacts of the same conversation and share its access, expiry, and deletion lifecycle. They do not replace canonical messages or state current transactional facts.
- Deletion moves the conversation atomically to deleting before cancellation/reconciliation. Reads and appends are denied in that state. All message, checkpoint, checkpoint-write/blob, summary, and known derived/cache artifacts are removed. A partial failure remains deleting and inaccessible until an idempotent retry proves removal. No recovery window, content soft-delete, or content tombstone is retained.
- A structured JSON export DTO is defined for canonical messages and minimal metadata, excluding credentials, hidden reasoning, raw checkpoints, and private tool payloads. It has no endpoint while DEC-001 is closed.
- Sharing is disabled: no public link, user-to-user sharing, tenant, or organization.
- Operational audit contains only allowlisted metadata without transcript, prompt, checkpoint, or tool content. SPEC-003-owned deletion-operation metadata may remain for 30 days after deletion when no other contract requires it. The SDD append-only ledger is not modified.
- No scheduler is assumed. Enforce expiry on every access and provide a narrowly scoped administrative maintenance operation to purge expired artifacts. Its lack of scheduled invocation is an operational limitation until separately provisioned.

## Contracts and security constraints

- Conversation and thread IDs locate records but never authorize access. DEC-001 is checked before repository, checkpoint, ledger, or private tool access; a closed gate returns ACCESS_DISABLED with zero private calls.
- Do not add authentication, owner IDs, multi-user identity, API grants, or service-role authorization.
- History pages use a page size default of 50, maximum of 100, deterministic messageSeq ordering, and an opaque cursor bound to conversation, page size, cursor version, and the initial snapshot maximum. A server-only key authenticates cursor integrity; it is injected and never hard-coded.
- Message sequence allocation and turn reservation are serialized per conversation. The same request key and payload replays one result; a different payload with that key returns a safe conflict.
- Checkpoint envelopes include graph, state-schema, and serializer versions; conversation/thread, checkpoint namespace/ID, producing turn, correlation ID, integrity data, and ledger references. Every resume preflight fails closed on absent, expired, corrupt, incompatible, or ledger-uncertain state.
- Context limits come from the installed SPEC-002 runtime. Select whole messages only. Never silently cut structured content or mutate canonical history.
- All test and migration fixtures are synthetic. Logs, audit details, browser bundles, errors, and provider stubs receive no private transcript, prompt, credential, raw checkpoint, or tool payload.
- The private conversation schema is not added to Supabase exposed schemas. No content access is granted to PUBLIC, anon, authenticated, or service_role. Product grants/RLS and existing data remain untouched.

## User scenarios and acceptance

### Story 1 — Retrieve history and resume safely (P1)
A future authorized application path can retrieve a prior conversation and continue only from a compatible, ledger-consistent checkpoint. This SPEC implements internal contracts and synthetic tests; it does not open that path.

Acceptance:
1. A valid synthetic history page is in deterministic order, and subsequent pages do not duplicate messages or include messages after the captured snapshot maximum.
2. Malformed, unknown, cross-conversation, or tampered IDs/cursors return stable validation/no-record outcomes without content or internal errors.
3. A checkpoint with completed ledger outcomes never repeats their operation. Missing or uncertain outcomes prevent resumption before any tool call.
4. Empty history returns an explicit empty result distinct from absent/corrupt checkpoint state.

### Story 2 — Apply retention and deletion (P1)
The internal store applies only dec005-spec003-v1 and safely reconciles deletion.

Acceptance:
1. New valid activity renews the 365-day history deadline; checkpoint writes refresh a maximum 30-day deadline bounded by conversation expiry.
2. Expiration blocks retrieval before returning data and removes expired artifacts on access or an explicit maintenance run.
3. Deletion blocks reads and writes immediately, reconciles an active turn through cancellation and the durable ledger, and removes all content artifacts. An injected partial failure remains deleting and inaccessible until retry completes.
4. Completed deletion has zero retrievable transcript, checkpoint, checkpoint-write/blob, summary, or known derived content. Only minimum content-free operation metadata can remain for 30 days.
5. Export has a typed JSON contract but no endpoint; sharing remains disabled.

### Story 3 — Keep transcript, graph state, and summaries separate (P2)
The internal runtime can assemble bounded context while preserving the canonical transcript and data categories.

Acceptance:
1. Checkpoints and summaries are never returned as messages.
2. A summary records its source message sequence interval and format version, remains in its own conversation, and never changes the transcript.
3. Current domain facts remain sourced from typed SPEC-004 operations; summaries and checkpoints are not transactionally authoritative.
4. No semantic cross-thread store, transcript embedding, or provider/trace disclosure is created.

## Functional requirements

- **FR-001**: Every conversation, message, checkpoint, and summary MUST belong to the single application dataset and an opaque conversation/thread ID; no owner UUID or second user identity is introduced.
- **FR-002**: Every operation MUST validate conversation/thread IDs, but IDs MUST NOT authorize access. With DEC-001 closed, the gate MUST reject before any repository, checkpointer, ledger, or private handler call.
- **FR-003**: Canonical messages MUST distinguish user, assistant, and allowlisted tool-summary origins; support deterministic pagination with default 50 and maximum 100; and order by monotonic messageSeq.
- **FR-004**: Checkpoints MUST remain separate from transcript and carry graph, state-schema, serializer, thread, checkpoint namespace/ID, producing-turn, correlation, and integrity metadata.
- **FR-005**: Resume MUST reject absent, expired, corrupt, incompatible, or ledger-incomplete state before any pending tool can execute.
- **FR-006**: Transcript, graph checkpoint, summary, domain context, and operational audit MUST have separate data classifications and access paths. A JSON export contract MUST include only canonical messages and necessary metadata; it MUST exclude secrets, hidden reasoning, raw checkpoint state, and private tool payloads. No export endpoint is enabled.
- **FR-007**: Transcript, prompts, checkpoints, and tool payloads MUST NOT enter generic logs, traces, or audit events. Operational records MUST contain only an allowlist of non-content metadata.
- **FR-008**: The conversation store MUST apply policy dec005-spec003-v1: history expires after 365 days since valid activity; checkpoint state expires within 30 days since valid update and no later than its conversation; summary shares conversation expiry. Global DEC-005 remains pending for other storage. Expiration is checked on access, with an administrative purge routine; no scheduler is assumed.
- **FR-009**: Deletion MUST block access and writes immediately, reconcile active turns, and remove transcript, checkpoints, pending writes/blobs, summaries, known derivatives, and caches. It MUST be idempotent and remain deleting after partial failure. No content soft-delete, grace window, or content tombstone is allowed.
- **FR-010**: New conversation history MUST return explicit empty; cursors MUST be opaque, versioned, integrity-checked, conversation/page-size bound, snapshot-bound, and reject tampering or cross-conversation reuse.
- **FR-011**: Tests MUST cover valid, unknown, malformed, expired, and cross-conversation IDs/cursors; replay, concurrency, retention, deletion, redaction, and zero private storage calls with DEC-001 closed. Tests MUST NOT add multi-user, tenant, organization, or non-owner support.
- **FR-012**: The contract MUST define active-turn cancellation/reconciliation, provider interruption, partial deletion, stale checkpoints, and uncertain ledger outcomes without silent replay.
- **FR-013**: Context construction MUST use effective SPEC-002 input budgets, include only complete messages, record its selected sequence/cursor and summary version, and never rewrite canonical transcript.
- **FR-014**: A compacted summary MUST be conversation-scoped derived content, with exact source sequence interval and format version; it MUST NOT become cross-thread memory or an authoritative current domain fact. Real transcript summarization by an external provider remains prohibited under pending DEC-006.
- **FR-015**: Checkpoint resume MUST validate thread, checkpoint namespace/ID, graph/state/serializer versions, producing turn, integrity, expiry, and durable ledger outcome. Checkpoint expiry is 30 days maximum from last valid update and bounded by conversation expiry; an expired checkpoint MUST NOT block otherwise-retained transcript history.
- **FR-016**: Turn creation and message append MUST be idempotent and serialized per conversation. Same-key/same-payload replay yields one visible turn; same-key/divergent-payload conflicts safely. Deletion MUST prevent new turns/retrieval and reconcile active work before deletion completes.
- **FR-017**: Conversation persistence and checkpoints MUST use the existing Supabase PostgreSQL project as the only database. Local PostgreSQL, Docker, database branches, and secondary databases are not prerequisites for this POC.

## Key entities

- **Conversation**: Single-dataset metadata, lifecycle, last valid activity, policy version, and next message sequence.
- **Message**: Canonical ordered user/assistant/allowlisted tool summary.
- **Turn reservation**: Server-generated request key, payload hash, state, and durable replay reference; side-effect outcomes remain in the SPEC-002 ExecutionLedger.
- **Graph checkpoint**: Internal versioned execution state, never user-visible history.
- **Context summary**: Derived per-conversation content tied to an exact message sequence interval.
- **Deletion operation metadata**: Content-free operational state with at most 30-day post-deletion retention.

## Success criteria

- **SC-001**: 100% of unknown, malformed, expired, or invalid conversation retrieval/resume fixtures return the documented stable outcome without an internal error or content leak.
- **SC-002**: Every valid history page is deterministic and has no duplicates across adjacent cursors; messages added after the first page snapshot do not appear in that pagination session.
- **SC-003**: 100% of corrupt or version-incompatible checkpoint fixtures stop before any pending tool is invoked.
- **SC-004**: A completed deletion leaves zero retrievable transcript, checkpoint, checkpoint-write/blob, summary, and known derived-memory artifacts in the approved deletion scope.
- **SC-005**: 100% of context fixtures remain within the injected SPEC-002 budget; compaction records the exact source cursor/version and leaves canonical transcript bytes unchanged.
- **SC-006**: Same-key replay and concurrent duplicate turns create at most one visible user/assistant turn and never repeat a completed ledger operation.
- **SC-007**: 100% of expired, corrupt, incompatible, or ledger-incomplete checkpoint fixtures stop before a pending tool call; history remains independently retrievable until its own expiry.

## Dependencies and validation

Hard dependencies: SPEC-001@2 and SPEC-002@2; both must be COMPLETED in SDD before admission. SPEC-004@2 supplies typed domain contracts; its tools remain inaccessible while DEC-001 is closed.

Required POC checks: Node unit/contract tests for the adapter and LangGraph checkpoint behavior; synthetic schema, constraint, transaction, ACL, and cleanup checks against the existing development project through Supabase SQL MCP; privacy and server-only bundle checks; `npm test`, lint, build, and an independent read-only audit. The SQL MCP evidence does not claim to exercise the Node `pg` adapter. A direct Node-to-PostgreSQL test is optional and NOT VERIFIED unless it is actually run; its URL, pooler setup, and CA certificate are not required completion gates. No Docker or local PostgreSQL service is required. No provider smoke test with real content is allowed.

## Completion evidence

- All executable tasks and every FR-001…FR-016 / SC-001…SC-007 have evidence.
- Migration and PostgreSQL checks affect only the approved private schema on the verified development project, use synthetic fixtures, and leave zero fixture residue.
- DEC-001 remains closed; all private runtime and endpoint calls fail before storage access.
- The registered v4 snapshot and its approved manifest remain unchanged during execution; no unresolved required failure remains.
- SDD records the SPEC and sole-SPEC batch COMPLETED.
- No commit, push, merge, deploy, or production operation occurred.
