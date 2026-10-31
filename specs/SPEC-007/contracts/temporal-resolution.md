# Temporal resolution — SPEC-007@2

Use America/Cuiaba for relative dates and local times. Preserve civil dates and times as entered; do not convert database date/time-without-time-zone values to UTC.

Accept explicit date ranges and weekday sets. Resolve today/tomorrow from the server reference clock in America/Cuiaba. Ask the user for clarification when a weekday has no date context, “next week” is used, or a required time/date boundary is missing. Do not invent an end time; null remains null.

The resolver does not access the database. A query or create is a separate typed Supabase operation. An ambiguous/invalid result makes zero write calls.
