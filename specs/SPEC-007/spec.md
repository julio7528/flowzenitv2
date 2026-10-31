# Feature Specification: Routine Recurrence Queries and Creation

**SPEC ID**: SPEC-007
**Version**: 2
**Dependencies**: [SPEC-001, SPEC-002, SPEC-004, SPEC-005, SPEC-006]
**Risk**: high
**Status**: Draft

## POC scope

Let the agent query existing recurring templates and create one template when the user gives the required values clearly. Use only the existing `public.recorrente` table through Supabase JS/PostgREST and current anonymous permissions. Keep the schema, grants, RLS, triggers, and current application behavior unchanged.

The existing table stores `demanda`, `hora`, nullable `hora_fim`, `dias_semana`, `data_inicial`, and `data_final`. It represents a reusable routine template, not persisted occurrences. Keep dates and times as civil values in `America/Cuiaba`.

## User scenarios

### US1 — Ask about routines

The user asks which routines apply on an explicit date or asks for existing routine templates.

**Acceptance**: return typed rows or a clear empty result. Date-range boundaries are inclusive; do not create occurrence rows.

### US2 — Create a routine template

The user asks to create one routine with a name, weekday set, date range, and explicit start time; end time may be omitted.

**Acceptance**: clarify missing/ambiguous values before the database call; insert one template; read it back before success. A missing end time stays `null`.

## Functional requirements

- **FR-001**: Query and create only existing recurring-template records in `public.recorrente` through the current Supabase JS/PostgREST client.
- **FR-002**: Require a non-empty name, at least one unique ISO weekday from 1 to 7, explicit `data_inicial` and `data_final` with start ≤ end, and an explicit valid `hora`.
- **FR-003**: Accept `hora_fim=null` or a valid local time greater than `hora`; do not infer an end time.
- **FR-004**: Preserve `America/Cuiaba` for natural-language date/time interpretation and preserve database civil date/time values without UTC conversion.
- **FR-005**: Ask for clarification for ambiguous weekdays, “next week”, missing date range, or missing time; do not silently choose values.
- **FR-006**: Insert one template at a time and read it back before reporting success. Do not automatically retry an uncertain write.
- **FR-007**: Do not create persistent occurrences, exceptions, or records in `public.demandas`; do not edit, delete, pause, or resume an existing template.

## Exclusions

Template edit/delete, occurrence generation or exceptions, holiday handling, task/subtask scheduling, recurring jobs, background workers, schema changes, direct Node `pg`, Docker, and local PostgreSQL are outside this POC.

## Success criteria

- **SC-001**: Explicit-date queries return current template rows or an unambiguous empty result.
- **SC-002**: A valid create request inserts one template with exact civil values and confirms it by read-back.
- **SC-003**: Invalid or incomplete input produces clarification/validation and zero write calls.
- **SC-004**: No occurrence, task, or subtask is created as a side effect of recurrence query/create.
- **SC-005**: `npm test`, lint, and production build pass with actual command evidence.
