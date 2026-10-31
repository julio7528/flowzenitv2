# Recurring template contract — SPEC-007@2

## Operations

| Operation | Input/result |
| --- | --- |
| Query templates | Typed list or projection for an explicit civil date; no occurrence insert. |
| Create template | Name, unique ISO weekdays, explicit inclusive start/end dates, local start time, optional local end time; insert one row and read it back. |

## Existing fields

Use public.recorrente fields demanda, dias_semana, data_inicial, data_final, hora, and hora_fim. Weekdays are unique integers 1–7. Require data_inicial ≤ data_final. Require hora_fim to be null or later than hora. Preserve null and civil date/time values exactly.

Only fixed Supabase JS/PostgREST operations are allowed. No edit, delete, pause/resume, occurrence, exception, task, or subtask side effect is registered.
