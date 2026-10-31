# SPEC-006 requirement checklist

Current POC scope for immutable candidate version 2. Fill each evidence cell and mark the checkbox only after implementation evidence exists.

| Complete | Requirement | Evidence |
| --- | --- | --- |
| [x] | FR-001 | T006–T007: `write-capabilities.js` and `registry.js` expose only `create_task` and `create_subtask` alongside the six reads. |
| [x] | FR-002 | T002–T005, T008: strict name/decimal parent validation; exact lookup and type checks; invalid input tests assert zero inserts. |
| [x] | FR-003 | T007: `api/agent/turn.js` injects the existing Supabase JS client with its configured publishable/anon key into both repositories. |
| [x] | FR-004 | T003–T005: adapter derives `tipo` and `raizid`; deterministic tests assert exact insert fields. No database schema or permission change. |
| [x] | FR-005 | T001–T004: scheduled demand is rejected before insert; zero-insert contract passes. |
| [x] | FR-006 | T003–T005: adapter reads back by exact inserted ID and verifies ID, type, name, and `raizid` before returning `COMMITTED`. |
| [x] | FR-007 | T004, T007: uncertain PostgREST outcomes are not retried; response tells the user to check before retrying. |
| [x] | FR-008 | T003, T008: strict server schemas reject SQL, table/column names, `tipo`, `raizid`, authorization flags, and unsupported operations. |
| [x] | SC-001 | T004–T007: task and subtask shapes persist expected type/parent; mocked production route covers parent lookup, one insert, and exact read-back. |
| [x] | SC-002 | T002, T005, T008: blank/malformed input, scheduled demand, wrong/mismatched parent, and unsupported writes produce no insert. |
| [x] | SC-003 | T003–T007: only a matching read-back produces a confirmed ID; missing or mismatched rows remain unconfirmed. |
| [x] | SC-004 | T004, T007–T008: PostgREST request, safe error, no-retry, registry, direct-intent, and hostile-input tests pass. |
| [x] | SC-005 | T009–T010: full tests, focused contracts, lint, build, browser boundary scan, and diff check passed; see the SDD gate evidence and quickstart. |
