# Feature Specification: Gemini Embeddings, pgvector, and Incremental Indexing

**SPEC ID**: SPEC-008  
**Version**: 1  
**Dependencies**: [SPEC-001, SPEC-004]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Add Gemini Embedding and pgvector indexing with structural chunks, reliable incremental synchronization, and source-aligned deletion.

## Scope and Exclusions

### In scope
- Define eligibility and content policy for indexing approved FlowZenit domain text.
- Define structural chunks that retain entity type, persistent ID, parent chain, source version, and freshness.
- Define an outbox or equivalent transactional change feed, idempotent consumer, bounded retry, dead-letter, replay, and deletion tombstones.
- Define model/version/dimension metadata and safe re-embedding or migration strategy.
- Define data minimization, provider boundary, and test data requirements.

### Explicitly out of scope
- Implementing query-time hybrid retrieval or RRF (SPEC-009).
- Embedding raw conversation history, credentials, private prompts, or audit events by default.
- Selecting the exact Gemini model ID or vector dimensions; see DEC-011.
- Enabling indexing until DEC-006 data-sharing and DEC-007 content-value decisions are resolved.

## Contracts and Constraints

- **Existing contracts**: Relational domain rows remain the source of truth. Current text is mostly item names, with no confirmed descriptions/comments. Hierarchy is demand → task → subtask; recurring routine is separate.
- **Compatibility**: Index is derived and rebuildable. No vector result may authoritatively set existence, status, permissions, dates, or writes.
- **Security and data handling**: Only approved fields are sent to Gemini. The index represents the single-user application dataset; no owner UUID, tenant, organization, or multi-user product scope is introduced. No privileged API key enters the browser. Real private-source indexing remains disabled until the SPEC-001 access-control gate and DEC-006/DEC-007 are satisfied; synthetic fixtures remain available for planning and tests.
- **Dependencies**: [SPEC-001, SPEC-004].

## User Scenarios & Testing

### User Story 1 - Keep searchable content synchronized (Priority: P1)

A domain change eventually updates the searchable representation without losing source provenance.

**Why this priority**: Stale vectors can return deleted or incorrect operational records.

**Independent Test**: In an isolated database, create, update, delete, and replay outbox events with a deterministic embedding double.

**Acceptance Scenarios**:
1. **Given** an approved source row commits, **When** indexing consumes its event, **Then** one current chunk set is associated with the source version.
2. **Given** the same event is delivered more than once, **When** it is consumed again, **Then** no duplicate active chunk is created.
3. **Given** the source row is deleted, **When** its deletion event is processed, **Then** all active derived chunks become unavailable to search.

### User Story 2 - Recover indexing failures (Priority: P1)

The application user can identify, retry, or dead-letter an indexing failure without blocking the source transaction.

**Why this priority**: External embedding services can fail independently of relational writes.

**Independent Test**: Inject timeout, rate limit, malformed response, dimension mismatch, and repeated failure.

**Acceptance Scenarios**:
1. **Given** a transient provider failure, **When** the consumer retries within the bounded policy, **Then** the source transaction remains committed and the event remains recoverable.
2. **Given** retry exhaustion, **When** the event is dead-lettered, **Then** it is visible to the single application user through the existing access behavior and can be replayed idempotently.
3. **Given** an embedding response has unexpected dimensions, **When** validation runs, **Then** it is rejected before persistence.

### User Story 3 - Gate indexing on content value and privacy (Priority: P2)

The application user can review whether the approved content is useful enough to send to an external embedding provider.

**Why this priority**: Existing records may contain too little text for useful semantic search.

**Independent Test**: Evaluate an approved synthetic corpus for semantic retrieval gain and inspect payloads sent to the provider double.

**Acceptance Scenarios**:
1. **Given** DEC-006 or DEC-007 is unresolved, **When** a production indexing job is started, **Then** it refuses to send domain content externally.
2. **Given** an approved corpus and field allowlist, **When** embedding is requested, **Then** only approved, redacted chunk text and necessary metadata are sent.

### Edge Cases
- Source updates twice before the first event is consumed; consumer converges to the latest version.
- Event arrives out of order; older source version cannot replace newer indexed content.
- Source row is deleted while embedding call is in flight.
- Model changes dimension or task type; mixed incompatible vectors are never compared in the same active index.
- Empty/very short title has no meaningful chunk and is skipped with a reason.

## Requirements

### Functional Requirements

- **FR-001**: The relational database MUST remain authoritative; indexed text and vectors MUST be treated as derived, disposable data.
- **FR-002**: Index eligibility and exact text fields MUST be allowlisted and approved before external processing; default content set is disabled until DEC-006 and DEC-007 are resolved.
- **FR-003**: Each chunk MUST retain source table/type, persistent ID, parent chain, source revision or update timestamp, content hash, model identifier, dimension, and indexing state.
- **FR-004**: Chunk boundaries MUST preserve hierarchy context and not combine unrelated demand trees into a single document.
- **FR-005**: A source change MUST produce a durable outbox event in the same transaction or an equivalently reliable atomic mechanism.
- **FR-006**: The consumer MUST be idempotent, version-aware, concurrency-safe, and bounded in retries and execution time.
- **FR-007**: Deletion and loss of eligibility MUST invalidate all derived chunks before they can be returned by retrieval.
- **FR-008**: Retry exhaustion MUST place an event in an inspectable dead-letter state with a redacted reason and safe replay action.
- **FR-009**: Embedding response model, task type, dimension, and content hash MUST be validated before vector persistence.
- **FR-010**: A model or dimension change MUST use an explicit index version and staged re-embedding path; incompatible spaces MUST NOT be compared together.
- **FR-011**: Backfill MUST be resumable, rate-bounded, observable, and isolated from online source writes.
- **FR-012**: Synthetic tests MUST verify duplicate, delayed, out-of-order, failed, replayed, and deleted events.
- **FR-013**: No secret, prompt, conversation transcript, or unapproved field may enter embedding requests or persisted chunks.
- **FR-014**: Private FlowZenit source data MUST NOT be read into a production index or sent to an embedding provider until the SPEC-001 access-control gate is approved, implemented, and verified; DEC-006/DEC-007 data-processing and corpus decisions are resolved; and DEC-010/DEC-011 approve the worker/runtime and model/dimension contract. This requirement does not approve a mechanism for access control or a provider configuration.
- **FR-015**: The indexer MUST distinguish the approved canonical embedding-input fingerprint from filter/provenance metadata. A status or schedule-only change MUST update relevant metadata without regenerating the vector when it does not change the approved embedding input; a text or hierarchy change MUST regenerate only the affected chunks whose canonical input changed.

### Key Entities

- **Index source**: Approved relational record and source revision.
- **Outbox event**: Durable change or deletion signal associated with the source transaction.
- **Structural chunk**: Bounded text plus hierarchy and source metadata.
- **Embedding version**: Provider model/task/dimension contract identifying a compatible vector space.
- **Dead-letter event**: Failed source event requiring inspection or replay by the single application user.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of committed synthetic source changes are eventually reflected by exactly one active source-version chunk set after successful consumption.
- **SC-002**: Duplicate and out-of-order event fixtures converge to the newest source version with no duplicate active chunks.
- **SC-003**: 100% of deleted-source fixtures are excluded from retrieval immediately after deletion invalidation completes.
- **SC-004**: Production indexing sends zero private content while the SPEC-001 access-control gate, DEC-006, DEC-007, DEC-010, or DEC-011 remains unresolved.
- **SC-005**: Synthetic fixtures prove that metadata-only changes cause zero embedding-provider calls and changed canonical text/hierarchy causes exactly the affected chunk set to be regenerated.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Indexing worker remains server-side |
| Unit/integration tests | Yes | Outbox/consumer tests with embedding double | Idempotency, retries, ordering, tombstone |
| Database/RLS/contract tests | Yes | Isolated transaction and privilege tests | Atomic event/source change and least privilege |
| E2E/accessibility/security evaluation | Yes | Synthetic provider payload inspection | Approved fields only; no secret/transcript leakage |

## Completion Evidence

- [ ] The SPEC-001 access-control gate and DEC-006/DEC-007/DEC-010/DEC-011 are satisfied before production private-data indexing is enabled.
- [ ] Outbox durability, replay, tombstone, and model-version gates have evidence.
- [ ] Dead-letter and reprocessing procedures are documented and tested.
- [ ] No unapproved data leaves the trusted server boundary.

## Assumptions

- The index is rebuildable and never authoritative.
- The first source corpus may be too sparse to justify embeddings; evaluation can recommend deferral.
- External calls use synthetic records in tests and require explicit opt-in for live smoke tests.
