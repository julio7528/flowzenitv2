# Quickstart: Validate SPEC-011 Dashboard

**Planning artifact only.** No UI, API, tests, E2E runner, or backend has been implemented or exercised in this planning work. Future validation uses synthetic fixtures and mocked same-origin responses only.

## Preconditions for future implementation

1. SPEC-011 must be in an exact user-approved SDD batch before implementation.
2. SPEC-010 read-model contracts must be compatible with the server API owned by SPEC-001/002/010.
3. DEC-001 must be satisfied before the API returns private execution/audit information. The passkey and navigation route are not server authorization.
4. DEC-005/006 must permit the fields and lifecycle before sensitive details or external LangSmith links are exposed.
5. Confirm an approved E2E runner before claiming Playwright viewport evidence; it is not currently declared.
6. Use synthetic fixtures only. Do not connect to remote Supabase, LangSmith or production telemetry.

## Future validation sequence

1. Unit-test view-model mapping for successful, empty, partial, stale, disabled, missing and unavailable source states.
2. Use fake SPEC-010 responses to verify filters, cursor pagination, trace detail ordering, audit/trace counterpart labels, suspicious-vs-confirmed classification, provider health and token usage availability.
3. With access disabled, verify zero private result fields, zero dashboard detail rendering, no counts/correlation references, and no direct browser database/provider requests.
4. Seed synthetic RAG/outbox/evaluation states: disabled, not configured, stale, delayed, missing, unavailable, measured. Verify no absent source becomes healthy zero or quality pass.
5. Check keyboard-only filter/list/detail navigation, status announcement, focus behavior, accessible names, and classification labels independent of color.
6. Check 1440, 820 and 390 pixel widths, including long correlation IDs and long safe error categories. Verify no document-level horizontal overflow.
7. Verify displayed timestamps use America/Cuiaba and that filters preserve the server's bounded instants.
8. Scan browser build artifacts for synthetic server-key sentinels and verify no raw trace, prompt, transcript, tool payload or SDD control-plane data is present.

## Expected future evidence

- npm test for unit and contract fixtures.
- npm run lint and npm run build.
- Playwright/manual E2E evidence only after the approved runner is available.
- Security test evidence showing closed-gate no-data response and no direct browser provider/Supabase calls.
- Screenshots/accessibility notes for 1440, 820 and 390 pixels using synthetic data.

No test command or browser flow is run during this plan.
