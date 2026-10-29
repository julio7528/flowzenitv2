# Feature Specification: Temporal Interpretation and Recurrence Management

**SPEC ID**: SPEC-007  
**Version**: 1  
**Dependencies**: [SPEC-004, SPEC-005, SPEC-006]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Interpret dates and times in Portuguese for daily/weekly planning and manage existing recurring routine templates without confusing a series with a persisted occurrence.

## Scope and Exclusions

### In scope
- Parse temporal expressions into a typed candidate date/time range with explicit locale, timezone context, source phrase, and confidence/ambiguity result.
- Resolve relative dates using the approved IANA timezone America/Cuiaba and a server-provided reference timestamp.
- Define conversion rules that distinguish civil dates, local wall-clock times, and absolute instants without changing the existing database schema.
- Create, edit, and query existing recurring routine series using their current weekday array, inclusive date range, start time, and optional end time; whether a series applies on a date is derived from those fields.
- Support recurrence series summaries and identify which configured template applies to a selected date.
- Require clarification when a natural-language request maps to multiple dates, weekdays, times, or recurrence interpretations.

### Explicitly out of scope
- Creating independent appointments or persisted occurrence records.
- Skip/edit-one-occurrence/holiday exceptions until recurrence exception policy DEC-004 is resolved.
- Changing the recurring table shape or converting templates into generated records.
- Silent locale assumptions or silent shifts of nonexistent/repeated local wall-clock times.

## Contracts and Constraints

- **Existing contracts**: The recurring table stores a text title, start time, optional end time, weekday array, start date, and end date. It has no relation to demand records and no occurrence identity. Existing demand schedules use date and time without timezone. Interpret these as America/Cuiaba civil scheduling values; do not convert stored date/time values to UTC or add timezone data in this SPEC.
- **Compatibility**: Preserve existing recurrence definition semantics and read-only appearance in daily planning. No generated occurrence is persisted by this SPEC.
- **Security and data handling**: Recurrence changes use SPEC-005 authorization and confirmation requirements and SPEC-006 idempotency patterns. These controls do not authenticate the owner; real private reads and recurrence mutations remain unavailable until the SPEC-001 access-control gate is satisfied. A model cannot choose timezone based on untrusted retrieved text.
- **Dependencies**: [SPEC-004, SPEC-005, SPEC-006].

### Temporal semantics awaiting a decision

- DEC-003 approves America/Cuiaba as the IANA timezone and the civil-date/local-time persistence contract. It does not define the exact interpretation of a bare weekday or “próxima semana”.
- DEC-013 remains pending for those user-facing phrase semantics. The prior rules “bare weekday means the next matching date, including today when it is that weekday” and “próxima semana means the planner’s Monday-through-Sunday range” are proposals only; they are not approved requirements.
- DEC-013 covers query and write semantics. Until it is approved, an ambiguous bare weekday or “próxima semana” MUST NOT silently select a point date or range for either a query or a consequential schedule write; ask which date/range the user means. Explicit unambiguous civil dates/ranges may still be handled.

## User Scenarios & Testing

### User Story 1 - Resolve a date and time expression (Priority: P1)

An authorized user says when an activity should happen and the agent either resolves it to an unambiguous interval or asks a targeted clarification.

**Why this priority**: Incorrect temporal interpretation can put work on the wrong day or time.

**Independent Test**: Run a versioned Portuguese fixture set against fixed reference timestamps and timezone settings.

**Acceptance Scenarios**:
1. **Given** the current server instant and timezone America/Cuiaba, **When** the user says “hoje” or “amanhã”, **Then** the parser resolves the corresponding Cuiaba civil date and returns the original phrase, reference instant, timezone, and local values.
2. **Given** the user says a bare weekday such as “sexta-feira” while DEC-013 is unresolved, **When** it could map to more than one civil date, **Then** the agent asks for clarification instead of selecting a date for a query or write. Once DEC-013 is approved, fixtures MUST follow its exact weekday semantics.
3. **Given** the user says “próxima semana” while DEC-013 is unresolved, **When** it could identify a range or a point-in-time date, **Then** the agent asks for clarification instead of selecting a query range or write date. Once DEC-013 is approved, fixtures MUST follow its exact week and point-in-time semantics.
4. **Given** an absolute timestamp is supplied, **When** it is converted for planning, **Then** it is first interpreted as an instant and then converted to America/Cuiaba civil date/time using the IANA rules applicable to that date.
5. **Given** a local wall-clock time is missing or repeated under the IANA rules for America/Cuiaba, **When** it cannot identify one unambiguous instant, **Then** the system requests clarification and does not silently shift or select an offset.
6. **Given** a schedule is written and read back, **When** its existing PostgreSQL date/time fields are compared, **Then** the civil date and wall-clock values are unchanged by timezone conversion.

### User Story 2 - Manage a recurring routine template (Priority: P2)

An authorized user creates or changes a repeating routine definition with multiple weekdays and a bounded active date range.

**Why this priority**: Routine templates are part of the existing planning domain and must stay distinct from occurrences.

**Independent Test**: Use isolated recurring templates with one and multiple weekdays, optional end time, and date-range boundaries.

**Acceptance Scenarios**:
1. **Given** a valid selected weekday set and date range, **When** a template is created, **Then** one series definition is persisted with exactly those days and times.
2. **Given** a recurring template matching a date, **When** its daily planning representation is queried, **Then** it is shown as a read-only routine block and is not counted as a persisted subtask.
3. **Given** a request to skip or edit only one occurrence, **When** no occurrence exception policy exists, **Then** no series mutation occurs and the agent explains the unsupported exception.
4. **Given** a routine template and a selected civil date, **When** its weekday and inclusive active range match, **Then** the result is a read-only projection identified by template ID and selected date, without a persisted occurrence ID; outside either boundary no routine block is returned.

### User Story 3 - Correct a temporal interpretation (Priority: P2)

An authorized user sees the interpreted date, timezone, and time range before confirming a consequential schedule change.

**Why this priority**: Visible interpretation reduces silent scheduling errors.

**Independent Test**: Exercise candidate display and confirmation binding with synthetic temporal inputs.

**Acceptance Scenarios**:
1. **Given** a schedule mutation requiring confirmation, **When** the user receives the proposal, **Then** its date, local timezone, start/end times, and affected record are displayed.
2. **Given** the temporal value changes after confirmation, **When** execution is attempted, **Then** the old approval is invalid and no schedule write occurs.

### Edge Cases
- Relative date request is made near midnight or a week/year boundary.
- The reference clock or timezone configuration is unavailable.
- A date uses a historical or future IANA rule change for America/Cuiaba.
- Weekday text lists duplicates, invalid names, or mixed locale spellings.
- Start time is after end time, or a range crosses midnight.
- A routine interval overlaps another routine or scheduled subtask; report overlap as informational and do not silently reject, displace, or reschedule either item.
- A recurring template’s start and end date boundary excludes the queried date.
- The user requests a recurrence exception unsupported by the existing schema.

## Requirements

### Functional Requirements

- **FR-001**: Temporal parsing MUST return a structured candidate containing the original phrase, resolved civil date, local start/end time, timezone identifier, reference instant, and ambiguity reasons.
- **FR-002**: Relative-date interpretation MUST use a server-provided reference instant and America/Cuiaba; it MUST NOT use an implicit browser or server-host timezone.
- **FR-003**: “Hoje” MUST be the America/Cuiaba civil date at the request reference instant; “amanhã” MUST be the next civil date, not a fixed 24-hour duration.
- **FR-004**: Until DEC-013 is approved, the system MUST NOT silently resolve an ambiguous bare weekday or “próxima semana” to a query date/range or consequential write date; it MUST request clarification. After approval, parsing MUST follow the exact recorded semantics for queries and writes and versioned tests for each phrase.
- **FR-005**: The system MUST distinguish civil dates, local wall-clock values, and absolute instants. An absolute instant MUST be converted through America/Cuiaba IANA rules when a local planning value is needed.
- **FR-006**: Existing PostgreSQL date and time-without-time-zone values MUST remain civil date and wall-clock values. Reads and writes MUST NOT reinterpret them as UTC or shift them through a timezone conversion. This SPEC MUST NOT change the database schema.
- **FR-007**: Temporal interpretation MUST use IANA timezone rules for America/Cuiaba for historical and future dates; timezone database/runtime version and test fixture dates MUST be recorded with evaluation evidence.
- **FR-008**: Ambiguous date, weekday, week boundary, daylight-saving, or time-range requests MUST request clarification before a consequential write. Missing or repeated local times MUST NOT be silently shifted or assigned an arbitrary offset.
- **FR-009**: Recurring template tools MUST expose series-level create, edit, and query using existing fields and weekday values 1–7. Applicability on a selected date is derived from weekday membership and the inclusive `data_inicial`/`data_final` range; the tools MUST NOT expose pause, resume, activation toggle, or another active-state mutation because no such field exists.
- **FR-010**: A recurring template MUST validate non-empty unique weekdays, valid local start/end times, valid active date order, and end time after start time where an end time is provided.
- **FR-011**: A routine matching a date MUST be represented as a template-derived display result, never as a persisted occurrence or demand/subtask ID.
- **FR-012**: Recurrence exceptions MUST remain unavailable until DEC-004 defines skip, one-occurrence edits, holiday behavior, cancellation, and restoration.
- **FR-013**: Recurring template mutations MUST be authorized, idempotent, and confirmation-gated according to the approved risk matrix. DEC-009 is pending; until its applicable entry and the DEC-001 access gate are satisfied, real series mutations remain disabled.
- **FR-014**: A series edit MUST state its effective date range and affected weekdays before execution; no one-occurrence implication may be presented. Any confirmation card displaying a time MUST label it with the IANA zone America/Cuiaba.
- **FR-015**: Temporal tests MUST cover Brazilian Portuguese relative terms, midnight and week boundaries, month/year rollover, America/Cuiaba historical IANA transitions, absolute-instant conversion, repeated/missing local times, and exact date/time database round trips.
- **FR-016**: Real private reads and recurrence mutations MUST fail closed until adequate access control is separately approved, implemented, and verified.
- **FR-017**: If an existing routine or subtask interval overlaps a proposed routine interval, the system MUST report the overlap when it has authorized evidence for it, but MUST NOT reject or displace an item solely to eliminate that overlap; existing schedule rules allow overlaps.

### Key Entities

- **Temporal candidate**: Proposed date/time interpretation with provenance and ambiguity state.
- **Recurring routine template**: A series definition with weekdays, active range, and local time interval.
- **Routine display instance**: Ephemeral read-only rendering of a template for a date; it has no persistent occurrence identity.
- **Temporal confirmation**: Approval bound to a canonical date/time proposal and affected resource.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of unambiguous temporal fixtures resolve to the expected date and local interval under a fixed timezone and reference instant.
- **SC-002**: 100% of ambiguous and daylight-saving edge fixtures request clarification or return an explicit ambiguity without writing.
- **SC-003**: Recurrence fixtures return exactly the configured matching weekdays within inclusive active-date boundaries.
- **SC-004**: No recurrence query produces a persistent occurrence ID or changes a demand/subtask count.
- **SC-005**: 100% of date/time database round-trip fixtures preserve the stored civil date and local wall-clock values exactly.
- **SC-006**: 100% of temporal fixtures use America/Cuiaba and match the IANA rules for their fixture dates, including historical rule changes.
- **SC-007**: 100% of overlap fixtures preserve both stored schedule records and return no implicit displacement or conflict-based reschedule.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Date/time contract is explicit |
| Unit/integration tests | Yes | Fixed-clock temporal and recurrence tests with IANA-zone fixtures | Cuiaba midnight/week/month/year boundaries, historical DST, instant conversion, wall-clock round trip |
| Database/RLS/contract tests | Yes | Isolated template mutation tests | Weekdays, ranges, times, idempotency |
| E2E/accessibility/security evaluation | Yes | Confirmation and ambiguity flows | No silent scheduling or series/occurrence confusion |

## Completion Evidence

- [x] DEC-003 timezone is America/Cuiaba and its civil-time persistence contract is explicit.
- [ ] DEC-013 bare-weekday and “próxima semana” semantics are approved before implementing mappings that select a query date/range or consequential write date.
- [ ] DEC-004 is resolved before offering occurrence exceptions.
- [ ] Parser and recurrence gates record fixture results and false-resolution cases.
- [ ] No schema or recurrence behavior outside scope is changed.

## Assumptions

- Initial recurrence support operates on a series template only.
- PostgreSQL date/time without timezone stores civil schedule values, not absolute instants; this SPEC does not change the schema.
- “One occurrence” operations are not approximated by editing the full series.
- Runtime IANA timezone data is the authority for date-specific historical/future rules; ambiguous wall-clock values require clarification.
