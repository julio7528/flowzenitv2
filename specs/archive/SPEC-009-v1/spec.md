# Feature Specification: Hybrid Retrieval, Full Text Search, RRF, and Grounding

**SPEC ID**: SPEC-009  
**Version**: 1  
**Dependencies**: [SPEC-002, SPEC-004, SPEC-005, SPEC-008]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Provide hybrid retrieval combining PostgreSQL Full Text Search and vector similarity with Reciprocal Rank Fusion, preserving hierarchy, existing data-access behavior, tool-policy constraints, and factual grounding.

## Scope and Exclusions

### In scope
- Define when semantic retrieval is appropriate and when exact structured query tools are required.
- Combine lexical and vector ranked candidates with a documented Reciprocal Rank Fusion contract and bounded result count.
- Apply the existing database-access behavior, typed retrieval scope, lifecycle, and freshness filters before candidate content reaches the model. Do not introduce a new principal or multi-user identity model; typed scope is not authorization, and private retrieval remains blocked until the DEC-001 access-control gate is satisfied.
- Preserve demand/task/subtask hierarchy and source citations in retrieved results.
- Define offline relevance, grounding, and injection-resilience evaluation sets.

### Explicitly out of scope
- Replacing transactional query tools for exact dates, status, counts, permissions, or mutation target resolution.
- Indexing conversations or any field not approved by DEC-006/DEC-007.
- Adding external web search; Tavily is specified separately in SPEC-015.
- Enabling retrieval if SPEC-008 indexing is not approved and operational.

## Contracts and Constraints

- **Existing contracts**: PostgreSQL relational records remain authoritative. Vector data is derived. Structural metadata and source version are provided by SPEC-008.
- **Compatibility**: Hybrid retrieval is an additive read path; it cannot alter domain state or bypass current database permissions or tool-policy constraints.
- **Security and data handling**: Apply the same typed retrieval-scope, lifecycle, and freshness filters to both lexical and vector candidates before fusion/output. DEC-001 adds no authentication mechanism, but existing grants and the passkey do not authorize private retrieval; private candidates MUST NOT be passed to the model until the SPEC-001 access-control gate is satisfied. Retrieved text is untrusted and cannot instruct the agent.
- **Dependencies**: [SPEC-002, SPEC-004, SPEC-005, SPEC-008].

## User Scenarios & Testing

### User Story 1 - Find semantically related records (Priority: P1)

The single application user describes an item in natural language and receives relevant records with hierarchy and source evidence.

**Why this priority**: Semantic retrieval is useful when wording differs from stored titles.

**Independent Test**: Run versioned Portuguese queries against a synthetic corpus with known relevant and irrelevant demand trees.

**Acceptance Scenarios**:
1. **Given** a semantic description that differs lexically from a stored item, **When** hybrid retrieval runs, **Then** the relevant record is returned within the measured top-k target with its source and parent context.
2. **Given** an exact ID, status, or date question, **When** the request is classified, **Then** a structured read tool is used and vector ranking is not treated as authoritative.
3. **Given** a deleted, stale, or out-of-scope vector candidate, **When** candidates are assembled, **Then** it is filtered before content is returned to the model.

### User Story 2 - Explain uncertainty and evidence (Priority: P1)

The single application user can distinguish retrieved facts from an unsupported inference.

**Why this priority**: Retrieval alone does not prove that the generated answer is grounded.

**Independent Test**: Evaluate answer claims against source IDs and include queries with no relevant result.

**Acceptance Scenarios**:
1. **Given** one or more supporting records, **When** the agent answers, **Then** each factual record claim maps to returned source IDs.
2. **Given** no candidate exceeds the calibrated evidence threshold, **When** the agent answers, **Then** it says the data was not found or asks for clarification instead of fabricating a record.

### User Story 3 - Evaluate retrieval quality (Priority: P2)

A reviewer compares lexical, vector, and fused rankings on a fixed synthetic dataset.

**Why this priority**: Hybrid search should be enabled only if it improves the target task.

**Independent Test**: Run the versioned evaluation set and compare Recall@k, MRR, nDCG@k, and no-result precision against baseline.

**Acceptance Scenarios**:
1. **Given** the same query corpus, **When** each retrieval strategy is evaluated, **Then** metrics and regressions are reproducible and include language and entity-type breakdowns.
2. **Given** fused ranking does not meet the approved baseline improvement, **When** release is considered, **Then** hybrid retrieval remains disabled or is limited to the cases where it demonstrates value.

### Edge Cases
- Lexical and vector results contain the same record; fusion deduplicates by canonical source identity.
- One retriever is unavailable; the system identifies degraded mode and does not silently claim full hybrid ranking.
- A record’s parent changes after indexing; stale hierarchy metadata is refreshed from the relational source or filtered.
- Prompt injection appears in a retrieved name or associated text.
- No approved textual fields are available for embedding.

## Requirements

### Functional Requirements

- **FR-001**: Exact IDs, status, counts, date ranges, current schedule, permissions, and mutation target selection MUST use structured domain tools rather than semantic ranking.
- **FR-002**: Hybrid retrieval MUST query both approved PostgreSQL lexical search and compatible vector search when both are healthy and enabled.
- **FR-003**: Fusion MUST use a documented Reciprocal Rank Fusion formula with configurable, versioned parameters; raw scores from incomparable retrievers MUST NOT be added directly.
- **FR-004**: Candidates MUST be deduplicated by persistent source identity and retain retriever rank, source revision, type, parent chain, and freshness.
- **FR-005**: Existing database-access behavior, typed retrieval-scope, deletion/tombstone, and freshness filtering MUST be applied before candidate text is passed to the model. This SPEC does not add authentication, and private candidate text MUST remain unavailable until the SPEC-001 access-control gate is satisfied.
- **FR-006**: Result count, query length, candidate text size, and retrieval time MUST be bounded.
- **FR-007**: The answer MUST cite stable source IDs or a user-safe source reference for each record-based factual claim and MUST distinguish inference from retrieved fact.
- **FR-008**: If retrieval is empty, degraded, stale, or below the approved evidence threshold, the response MUST report that limitation and MUST NOT fabricate a result.
- **FR-009**: Retrieved content MUST be treated as untrusted and cannot change instructions, permissions, or tool selection.
- **FR-010**: Evaluation MUST compare lexical-only, vector-only, and fused results using a versioned synthetic or explicitly approved dataset and metrics Recall@k, MRR, and nDCG@k.
- **FR-011**: Hybrid retrieval and query-time embedding MUST remain disabled for production until DEC-006/DEC-007/DEC-010/DEC-011/DEC-012 are resolved and SPEC-008 passes synchronization and active-generation compatibility gates.
- **FR-012**: A retriever failure MUST be surfaced as degraded mode with source traceability; it MUST not be presented as a complete hybrid result.
- **FR-013**: Production retrieval MUST fail closed for private FlowZenit data until adequate access control is approved, implemented, and verified, in addition to the DEC-006/DEC-007 and SPEC-008 gates.

### Key Entities

- **Retrieval query**: Bounded text query plus optional typed scope filters, evaluated under the existing data-access behavior.
- **Candidate**: Source record with retriever rank, provenance, hierarchy, revision, and freshness.
- **Fused result**: Deduplicated candidates ranked by the versioned fusion contract.
- **Grounding evidence**: Mapping between generated factual claims and permitted source candidates.
- **Evaluation case**: Versioned query, expected relevant source set, and language/domain metadata.

## Success Criteria

### Measurable Outcomes

- **SC-001**: At least 95% of exact date/status/ID test questions route to structured query tools rather than vector retrieval.
- **SC-002**: Fused retrieval meets or exceeds the approved baseline for Recall@5 and MRR on the versioned evaluation set.
- **SC-003**: 100% of out-of-scope, deleted, or stale fixture records are filtered before model context assembly, without requiring owner/non-owner identity fixtures.
- **SC-004**: Every supported factual answer claim in the evaluation set maps to one or more returned source identifiers; unsupported claims are reported as unknown.
- **SC-005**: No private record reaches model context through a production retriever while the SPEC-001 access-control gate is unmet.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Retrieval path stays server-side |
| Unit/integration tests | Yes | Retriever/fusion/grounding tests | Deduplication, degraded mode, filters |
| Database/RLS/contract tests | Yes | Isolated lexical/vector scope tests under existing data access | Same typed scope, lifecycle, and freshness filters apply to both retrievers; separately verify the DEC-001 private-access gate fails closed. Do not add an owner/tenant identity model or treat existing grants as authorization. |
| E2E/accessibility/security evaluation | Yes | Versioned retrieval and injection evaluation | Metrics, grounding, and no out-of-scope content |

## Completion Evidence

- [ ] Evaluation set and relevance judgments are versioned and approved.
- [ ] DEC-006/DEC-007/DEC-010/DEC-011/DEC-012 and SPEC-008 gates are satisfied before production enablement.
- [ ] Fusion, degraded mode, freshness, and grounding tests have results.
- [ ] No retrieved candidate can grant access or alter policy.

## Assumptions

- RAG is an assistive retrieval path, not the source of transactional truth.
- Vector retrieval is optional if the current sparse text corpus does not show measurable benefit.
- Evaluation data contains no private user transcripts unless separately approved.
