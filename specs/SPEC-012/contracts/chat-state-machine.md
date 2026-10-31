# Chat state machine — SPEC-012@2

| State | Meaning | User-visible behavior |
| --- | --- | --- |
| idle | Ready for a new request | Composer enabled. |
| sending | Request is in progress | Pending indicator; composer disabled. |
| answered | Valid terminal response received | Render answer and safe evidence references. |
| clarification | Required detail is missing/ambiguous | Ask one direct follow-up; keep active context in memory. |
| empty | Valid query returned no records | Say no matching records were found. |
| failed | Request/provider/database failure | Show safe error; do not imply no write occurred if outcome is uncertain. |
| uncertain | A create was attempted but could not be confirmed | Warn user to check Supabase before manually retrying. |
| cancelled | User/browser cancelled the request | Show cancellation; do not display success. |

On reload, active context is cleared. Do not restore or list persisted conversations. Do not treat button submission as a completed create.
