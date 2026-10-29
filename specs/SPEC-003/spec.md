# Feature Specification: Persistent Conversational Memory

**SPEC ID**: SPEC-003  
**Version**: 1  
**Dependencies**: [SPEC-001, SPEC-002]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Persist conversation history and LangGraph checkpoints while separating conversation, domain context, semantic memory, and audit records.

## Scope and Exclusions

### In scope
- Define conversation and message lifecycle for the single-user application, history pagination, checkpoint association, deletion, and retention controls.
- Separate message content, graph checkpoint state, optional user memory, domain records, and audit metadata by purpose and access policy.
- Resume an interrupted graph turn only when its thread, graph version, and durable tool ledger agree.
- Build bounded per-turn context from the canonical transcript and compact older context without rewriting history or creating cross-thread semantic memory.
- Define concurrency, duplicate-turn, checkpoint integrity, and expiration behavior without selecting an unapproved retention duration.
- Provide redaction and retention behavior that can be verified without exposing stored content.

### Explicitly out of scope
- Persistent semantic user memory or vectorized conversation retrieval unless separately approved.
- Indexing conversation transcripts into SPEC-008/009 RAG.
- Selecting retention duration, export policy, cross-device sharing, or deletion grace period; see DEC-005.
- Chat UI and agent orchestration implementation.

## Contracts and Constraints

- **Existing contracts**: Use the existing data-integration context from SPEC-001 and graph state contract from SPEC-002.
- **Compatibility**: No existing product table is repurposed for conversation content. New persistence is additive and isolated.
- **Security and data handling**: Conversation and thread IDs identify records but do not add a new authentication mechanism or authorize access by themselves. Preserve the existing application path without adding authentication or owner IDs; the client-side passkey is not server-verifiable. Real private history and checkpoint endpoints remain unavailable until the SPEC-001 access-control gate is approved, implemented, and verified. Checkpoints and transcript content are not copied into general audit logs by default.
- **Dependencies**: [SPEC-001, SPEC-002].

## User Scenarios & Testing

### User Story 1 - Resume a conversation (Priority: P1)

The single application user opens a prior conversation and continues from the correct bounded state.

**Why this priority**: A persistent chat must preserve continuity without replaying completed operations or exposing internal checkpoint state as conversation history.

**Independent Test**: Create multiple synthetic conversations for the single application dataset; attempt normal retrieval, malformed/unknown IDs, and graph resume.

**Acceptance Scenarios**:
1. **Given** an existing conversation in the single-user dataset, **When** its history is requested, **Then** messages are returned in stable chronological order with pagination.
2. **Given** an unknown or malformed conversation ID, **When** it is retrieved or resumed, **Then** the service returns a stable no-record or validation outcome without an internal error.
3. **Given** a resumable checkpoint with a completed tool outcome, **When** the graph continues, **Then** the completed operation is not repeated.

### User Story 2 - Manage stored conversation data (Priority: P1)

The application user can apply the approved retention and deletion policy to conversation artifacts.

**Why this priority**: Conversation records can contain sensitive operational context.

**Independent Test**: Exercise retention and deletion against synthetic records and inspect transcript, checkpoint, derived index, and audit references.

**Acceptance Scenarios**:
1. **Given** DEC-005 retention and deletion settings are configured, **When** an eligible record reaches its policy boundary, **Then** transcript and checkpoint artifacts follow the same declared lifecycle or an explicitly documented exception.
2. **Given** deletion is requested, **When** the operation completes, **Then** content is no longer retrievable and the audit record retains only the minimum approved non-content evidence.
3. **Given** retention policy is not approved, **When** storage is configured, **Then** production conversation persistence is not enabled with an invented duration.

### User Story 3 - Keep memory categories separate (Priority: P2)

The application user can distinguish the graph checkpoint needed to resume a thread from the conversation history and any semantic memory.

**Why this priority**: These artifacts have different access, purpose, and retention needs.

**Independent Test**: Verify separate data classifications and that deleting one category cannot silently leave an accessible derived copy.

**Acceptance Scenarios**:
1. **Given** a checkpoint is written, **When** history is read, **Then** internal graph state is not returned as user-visible transcript content.
2. **Given** semantic memory is not enabled, **When** a conversation is persisted, **Then** no transcript embedding or cross-thread memory is created.

### Edge Cases
- History page boundary changes while new messages arrive; stable ordering uses a monotonic message sequence or cursor.
- A checkpoint is missing, corrupted, or created by an incompatible graph version; do not resume its tools.
- A deletion request races with an active turn; further writes are blocked or reconciled according to a recorded terminal state.
- A tool response contains content that should not be copied into a transcript or checkpoint.

## Requirements

### Functional Requirements

- **FR-001**: Every conversation, message, and checkpoint MUST be associated with the single-user application dataset and an opaque conversation/thread ID; DEC-001 does not introduce an authenticated principal or owner UUID.
- **FR-002**: Every operation MUST validate the conversation/thread ID, but that ID MUST NOT be treated as authorization. Preserve the existing application path without adding a new authentication mechanism; private history and checkpoint endpoints MUST fail closed until the SPEC-001 access-control gate is satisfied.
- **FR-003**: Message history MUST support bounded pagination and stable ordering and MUST distinguish user, assistant, and tool-originated content.
- **FR-004**: Graph checkpoints MUST be logically separate from transcript messages and MUST include graph version, state version, and correlation to the turn that produced them.
- **FR-005**: Checkpoint resume MUST reject absent, corrupted, incompatible, or incomplete tool-ledger state without executing pending mutations.
- **FR-006**: Conversation content, checkpoints, optional semantic memory, domain context, and audit metadata MUST have separately declared data classifications and access paths.
- **FR-007**: Transcript content MUST NOT be copied into generic logs, traces, or audit events unless a separately approved policy defines fields, redaction, access, and retention.
- **FR-008**: Production persistence MUST remain disabled until retention, deletion, export, and sharing decisions in DEC-005 are resolved.
- **FR-009**: When enabled under an approved policy, deletion MUST cover transcript, checkpoints, compaction summaries, derived memory/index entries, and caches, with a minimal tombstone only where legally and operationally approved.
- **FR-010**: History retrieval MUST return an explicit empty result for a new thread and a stable cursor for additional pages.
- **FR-011**: Tests MUST cover valid, unknown, and malformed conversation IDs, replay handling, retention, deletion, and fail-closed behavior while the access-control gate is unmet, without synthetic non-owner identities or product support for multiple users, tenants, or organizations.
- **FR-012**: The contract MUST define behavior for an active turn, deletion request, provider interruption, and stale checkpoint without silent replay.
- **FR-013**: Context construction MUST respect the active SPEC-002/provider input budget; any compaction MUST preserve the canonical transcript and record its source message cursor and compaction format version. Numeric limits remain subject to DEC-011/DEC-012 and the approved runtime.
- **FR-014**: A compacted summary MUST remain scoped to its conversation, be classified as derived conversation content, and never become persistent cross-thread semantic memory or an authoritative source for exact transactional facts. Sending real transcript content for summarization remains blocked by DEC-006.
- **FR-015**: A checkpoint MUST be validated against its thread, checkpoint/state format version, graph version, producing turn, and durable tool-ledger state before resume. Expiration MUST derive from an approved DEC-005 policy; no default TTL is selected, and expired, corrupt, or incompatible state MUST stop before a tool executes.
- **FR-016**: Message append and turn creation MUST be idempotent under duplicate requests and deterministic under concurrent turns. A deletion request MUST prevent new turns and retrieval while an active turn is cancelled or reconciled through a durable terminal/ledger outcome; exact retention/tombstone behavior remains governed by DEC-005.

### Key Entities

- **Conversation**: Single-user thread metadata, state, lifecycle, and policy references.
- **Message**: Ordered user, assistant, or tool interaction with content classification and provenance.
- **Graph checkpoint**: Internal resumable orchestration state, not user-visible history.
- **Memory artifact**: Optional derived preference or fact; not enabled until a separate policy is approved.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of unknown or malformed conversation retrieval and resume fixtures return the documented no-record or validation result without internal errors.
- **SC-002**: Every valid history page returns messages in deterministic order with no duplicates across adjacent cursors.
- **SC-003**: 100% of checkpoint corruption or version-mismatch tests stop before invoking any pending mutation tool.
- **SC-004**: A deletion test leaves zero retrievable transcript, checkpoint, compaction-summary, and derived-memory artifacts within the approved deletion scope.
- **SC-005**: 100% of context-build fixtures stay within the injected input budget; when compaction is required, the recorded source cursor/version is correct and the canonical transcript remains byte-for-byte unchanged.
- **SC-006**: Replaying the same turn request or submitting concurrent duplicate turns creates at most one visible message/turn and invokes no completed tool operation a second time.
- **SC-007**: 100% of expired, corrupt, incompatible, or ledger-incomplete checkpoint fixtures stop before a pending mutation tool is invoked.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Persistence adapters remain server-only |
| Unit/integration tests | Yes | Synthetic history and checkpoint tests | Pagination, resume, corruption, deletion |
| Database/contract tests | Yes | Isolated single-user/current-grant tests | Synthetic fixtures only; private history endpoints fail closed until the access-control gate is met; no new RLS or owner checks are assumed by this SPEC |
| E2E/accessibility/security evaluation | Yes | API lifecycle tests and deletion verification | No leakage across history, checkpoint, or audit |

## Completion Evidence

- [ ] Access and lifecycle scenarios have PASS, FAIL, or NOT VERIFIED evidence.
- [ ] Retention decision is resolved before production persistence is enabled.
- [ ] Required tests cover transcript, checkpoint, and derived artifact deletion.
- [ ] Changes remain limited to approved memory and checkpoint behavior.

## Assumptions

- Conversation content is sensitive by default.
- Short-term graph checkpoint state and long-term user memory are distinct concepts.
- No conversation-level cross-thread semantic memory is created by default.
