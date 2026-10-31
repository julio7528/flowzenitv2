# Data model: recurring templates

## Existing `public.recorrente` table

Read-only PostgreSQL catalog inspection for the development Supabase project confirmed this existing contract. No application rows were read and no database writes were made.

| Column | PostgreSQL type | Nullability / constraint | Agent contract |
| --- | --- | --- | --- |
| `id` | `bigint` identity | Primary key, not null | Return as a decimal string to preserve precision. |
| `demanda` | `text` | Not null; `btrim(demanda)` must be non-empty | Trim and require a non-empty routine name; no uniqueness or max-length constraint was observed. |
| `hora` | `time without time zone` | Not null | Required local civil start time; preserve the database string. |
| `data_inicial` | `date` | Not null; must be ≤ `data_final` | Required inclusive civil-date start. |
| `data_final` | `date` | Not null | Required inclusive civil-date end. |
| `dias_semana` | `smallint[]` | Not null; cardinality 1–7; each value is in 1–7 | Require a non-empty set of unique ISO weekdays; uniqueness is an application-level check. |
| `hora_fim` | `time without time zone` | Nullable; null or greater than `hora` | Preserve `null`; when present, require a later local civil time. |

The table has a primary-key index, a GIN index on `dias_semana`, and a B-tree index on `(data_inicial, data_final)`. Catalog inspection found no non-internal trigger and no foreign key to `demandas`. The table stores reusable templates; there is no occurrence, exception, enabled, or pause/resume column.

## Existing access and application behavior

RLS is enabled and not forced. The current `anon` role has table `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges, with matching permissive policies. SPEC-007 uses only the existing Supabase JS/PostgREST client and current permissions; it makes no schema, grant, RLS, policy, or trigger changes.

`server/domain/read/repository.js` selects the fixed projection `id::text,demanda,hora,hora_fim,dias_semana,data_inicial,data_final`. An explicit date query filters `data_inicial <= date`, `data_final >= date`, and contains the date's ISO weekday. The predicates make both range boundaries inclusive. `server/domain/read/routine-templates.js` validates the returned template and confirms that each row applies to the requested date.

`src/pages/RecorrentesPage.jsx` currently loads and edits the same table directly. Its weekday picker uses a `Set`, so it avoids duplicates in the UI, but PostgreSQL itself does not enforce uniqueness in the array. The current form requires both times, although the database permits `hora_fim = null`. `src/lib/recurringTime.js` supplies a one-hour display fallback when `hora_fim` is null; SPEC-007 must preserve null on writes and must not persist that visual fallback as a duration.

`src/pages/PlanejamentoDiarioPage.jsx` reads templates for a selected date, applies the weekday and inclusive date-range checks, then combines read-only template projections with scheduled subtasks for the timeline. This does not create a persisted occurrence or assign an occurrence ID.

## Civil date and time semantics

Interpret relative user dates in `America/Cuiaba`. Keep PostgreSQL `date` and `time without time zone` values as civil strings and do not convert them to UTC. The existing schema requires `hora_fim > hora`; overnight ranges are therefore unsupported. The current template does not encode a task, subtask, or occurrence relationship.
