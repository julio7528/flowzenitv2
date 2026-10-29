# Feature Specification: Domain Contracts and Read Tools

**SPEC ID**: SPEC-004  
**Version**: 2
**Dependencies**: [SPEC-001]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Let the agent query demands, tasks, subtasks, daily and weekly planning, statuses, recurring routines, and locate activities by period, text, status, and context.

## Scope and Exclusions

### In scope
- Define canonical read contracts and typed query capabilities for the current FlowZenit domain.
- Support hierarchy traversal, exact record lookup, text filtering, status filtering, date ranges, and weekly/daily planning summaries.
- Return provenance, persistent IDs, display hierarchy numbers where useful, result freshness, and truncation metadata.
- Describe existing recurring routines as read-only templates and distinguish them from dated task activities.

### Explicitly out of scope
- Writes, status changes, recurrence edits, semantic/vector search, and chat UI.
- Creating an independent appointment/commitment/calendar entity in this first version.
- Treating display numbering as a database ID or treating a routine template as a persisted occurrence.

Test harnesses may temporarily insert and remove synthetic records only for the approved SPEC-004@2 contract tests on the FlowZenit V2 development Supabase project `flowzenithv2` (`twikxeloeftczwbpjvzr`). This test-only exception adds no runtime write capability and permits no edits to preexisting records.

## Contracts and Constraints

- **Existing contracts**: Current domain is public.demandas with type 1/2/3 and parent ID raizid, daily and weekly allocation in data_exec, local time fields, and a separate recurring table. Preserve observed ordering and status derivation. DEC-002 approves using only these existing entities; no independent appointment entity is part of this version. Date filters and schedule summaries use the civil-date interpretation supplied under America/Cuiaba by SPEC-007; existing date/time values are not shifted through UTC conversions.
- **Compatibility**: Read APIs are additive and do not change product schema, ordering, status calculation, or schedule rules.
- **Security and data handling**: The read repository accepts a narrowly injected server-side Supabase client from its eventual runtime integration; SPEC-001 provides the fail-closed access gate and safe error/logging modules, but does not provide a server Supabase client, route, or enabled private capability. The current gate remains closed and does not invoke protected operations. Existing anonymous grants do not authorize private-data access through an agent endpoint. User/model input may select supported filters but cannot supply SQL or arbitrary table/column names.
- **Approved local query parameters**: `pageSize` defaults to 50 and is capped at 100; search text is at most 200 Unicode code points; an inclusive civil date range is capped at 366 days. Text search is a literal, accent-sensitive, case-insensitive substring on `demanda`. `%`, `_`, and the escape character are literal user input, not pattern syntax. No Unicode normalization is promised; case behavior follows the current PostgreSQL column/database collation and must pass the contract tests without changing schema or collation.
- **Dependencies**: [SPEC-001].

## User Scenarios & Testing

### User Story 1 - Inspect hierarchy and status (Priority: P1)

The single application user asks for a demand, task, or subtask and receives its current parent/child context and status.

**Why this priority**: Correct hierarchy is necessary for planning and every later mutation.

**Independent Test**: Seed isolated demand → task → subtasks and query each level, including derived parent status.

**Acceptance Scenarios**:
1. **Given** a demand with tasks and subtasks, **When** the user asks for its tasks, **Then** results preserve parent relationships and persistent IDs.
2. **Given** a task or demand whose status is derived, **When** it is queried, **Then** the tool returns the current derived value and identifies it as derived.
3. **Given** an unknown record ID, **When** a record lookup is performed, **Then** the tool returns a not-found outcome consistent with the existing application behavior.

### User Story 2 - Inspect planning for a period (Priority: P1)

The application user asks what is scheduled on a day or during a week and receives the relevant date, time, status, and hierarchy.

**Why this priority**: Planning queries are central to the requested natural-language agent.

**Independent Test**: Query deterministic isolated schedules across week boundaries, overlapping intervals, and empty dates.

**Acceptance Scenarios**:
1. **Given** scheduled subtasks on a selected day, **When** the daily query runs, **Then** results include start/end times, status, demand/task/subtask names, and stable identifiers.
2. **Given** a selected week, **When** the weekly query runs, **Then** it lists only the weekly card types the application currently supports and labels the week boundaries.
3. **Given** overlapping intervals, **When** the schedule is queried, **Then** both activities are returned without collision suppression.

### User Story 3 - Inspect recurring routines (Priority: P2)

The application user asks which routine templates apply on a day and can distinguish them from ordinary subtasks.

**Why this priority**: Routine display is part of the existing daily planning context.

**Independent Test**: Query weekday arrays and date ranges using isolated recurring records.

**Acceptance Scenarios**:
1. **Given** a recurring template whose weekday and active date range include the queried day, **When** routines are queried, **Then** it appears with its configured time range and source marked as a routine template.
2. **Given** a routine template that does not apply to the queried day, **When** routines are queried, **Then** it is omitted.
3. **Given** the user requests a standalone commitment not represented by an existing demand, task, subtask, or routine template, **When** no matching record exists, **Then** the agent explains that this version has no such entity and creates no artificial record.

### Edge Cases
- A parent has no children; its current status is Backlog under the observed database rule.
- A user supplies an ambiguous name that matches multiple records; return candidates with hierarchy context rather than choosing silently.
- A query returns more rows than the bounded result limit; return a truncation flag and stable continuation cursor.
- Date range crosses month/year/week boundary or daylight-saving transition; apply only the approved date semantics.
- The user asks for a commitment not represented by a current entity; explain the limitation without fabricating an item or event.

## Requirements

### Functional Requirements

- **FR-001**: Read tools MUST expose named, typed query operations for hierarchy, single-record lookup, status, daily schedule, weekly allocation, recurring routine templates, and text/status/date filters.
- **FR-002**: Each query MUST validate type, date range, status enum, pagination, and text length against these bounded rules: default `pageSize=50`, maximum `pageSize=100`, maximum text length 200 Unicode code points, and maximum inclusive civil date span of 366 days.
- **FR-003**: A hierarchy result MUST include persistent IDs, entity type, parent reference, entity name, current status and whether status is stored or derived.
- **FR-004**: Hierarchical display numbers MUST be explicitly labeled as display-only and MUST never replace persistent IDs.
- **FR-005**: Daily schedule results MUST include only the currently supported daily entities, their local start/end times, status, and hierarchy context.
- **FR-006**: Weekly results MUST reflect current weekly eligibility: a demand without tasks or a task can be a weekly card; a subtask is not a weekly card.
- **FR-007**: Recurring results MUST identify a routine template, applicable weekday/date range, and configured time; they MUST NOT imply a persisted occurrence ID or editable occurrence.
- **FR-008**: Parent demand/task status MUST be returned as derived from children; read tools MUST not represent it as an independently editable value.
- **FR-009**: A query MUST expose whether its result is empty, its completeness (`complete`, `partial`, or `truncated`), its freshness (`fresh` or `stale`), and stable source reference(s) for returned records.
- **FR-010**: Ambiguous text matches MUST return multiple ranked candidates or request narrowing; the tool MUST NOT silently select a potentially different record for a mutation follow-up.
- **FR-011**: Unknown and nonexistent IDs MUST have indistinguishable externally visible not-found behavior; the single-owner product does not define foreign-owner or tenant IDs.
- **FR-012**: The first version MUST use only existing demand, task, subtask, and recurring routine records; it MUST NOT create, infer, or present an independent appointment or calendar event.
- **FR-013**: If a request requires an entity or relationship absent from the current model, the agent MUST explain the limitation and leave data unchanged; a new commitment entity requires a future separately approved SPEC.
- **FR-014**: Queries MUST use structured domain operations; no LLM-generated SQL or arbitrary query fragments are accepted.
- **FR-015**: Relative date ranges MUST be resolved to canonical America/Cuiaba civil dates under SPEC-007 before they are passed to structured query tools; reads MUST preserve the existing PostgreSQL date/time values without UTC conversion.
- **FR-016**: Private domain reads through an agent endpoint MUST fail closed until adequate access control is separately approved, implemented, and verified; current anonymous grants and the browser passkey MUST NOT be treated as authorization.

### Key Entities

- **Demand hierarchy record**: One demand, task, or subtask with persistent identity and parent relationship.
- **Schedule item**: A currently persisted demand/task weekly allocation or subtask daily allocation.
- **Recurring routine template**: A repeated, read-only rule with weekday set, active range, and local time range.
- **Query result**: Bounded records plus source, completeness, and continuation metadata.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of hierarchy fixtures return the correct parent chain and persistent IDs.
- **SC-002**: 100% of daily and weekly schedule fixtures include exactly the eligible records for the selected range, including overlapping items.
- **SC-003**: Every truncated response identifies that it is incomplete and provides a usable continuation reference.
- **SC-004**: Ambiguous and unknown-ID fixtures never produce a silently selected or disclosed record.
- **SC-005**: 100% of requests for unsupported standalone commitments return a limitation response and create zero records.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Read tool contracts compile in server boundary |
| Unit/integration tests | Yes | Synthetic domain query fixtures | Hierarchy, filters, date ranges, ambiguity |
| Database/contract tests | Yes | Existing owner-authorized FlowZenit V2 development Supabase project; verify project/schema/permissions/marker before writes; synthetic fixtures only | Verify exact bigint text projection, filters, escaped literal patterns, accent distinction, and relationships. Record generated IDs/parent links; prefer transactional rollback or delete only captured fixture IDs child-first. No preexisting record changes, broad DELETE/TRUNCATE/reset, new policy/grant, or agent-endpoint access. |
| Agent-tool integration/security tests | Yes | Internal service tests with doubles and isolated synthetic data | Empty, overlap, truncation, non-disclosure, and zero repository calls while the access gate is closed |
| Browser E2E/accessibility | Conditional | Only if an approved implementation changes visible UI | Relevant browser flow and accessibility evidence; no UI change is in this SPEC |

## Completion Evidence

- [ ] Each query contract has examples and acceptance evidence.
- [ ] Read operations use typed contracts and a narrowly injected server-side Supabase client from the eventual runtime integration; SPEC-001 does not supply that client. No owner UUID or arbitrary SQL interface is introduced, and reads remain inaccessible through the service while the current gate is closed.
- [ ] No independent appointment/commitment entity is introduced in this version.
- [ ] No implementation scope outside read operations is included.

## Assumptions

- Relational records remain authoritative for transactional facts.
- Existing business ordering and status derivation are preserved.
- Recurring routines are templates and remain read-only in planning.
- Future support for independent commitments requires a separate SPEC and renewed approval.
