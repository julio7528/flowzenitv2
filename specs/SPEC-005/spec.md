# Feature Specification: Agent Guardrails and POC Action Policy

**SPEC ID**: SPEC-005
**Version**: 2
**Dependencies**: [SPEC-001, SPEC-002, SPEC-004]
**Risk**: high
**Status**: Draft

## Owner-approved POC action policy

The POC can answer typed questions and use the Supabase text search. A clear request may create one task, one subtask, or one recurring template without a second confirmation. If a required name, parent, date, weekday, or time is missing or ambiguous, ask the user before writing. The agent does not create multiple records from one request.

Task/subtask edits, scheduling, status changes, recurrence edits/deletes, and all record deletion stay outside this POC. The endpoint is public under the owner's explicit acceptance of current Supabase `anon` permissions.

## User scenarios

### US1 — Receive grounded answers

The agent treats user messages, Supabase text, and retrieved records as untrusted content; it only uses registered typed tools and cites data returned by them.

### US2 — Make one clear creation

The agent creates one task, subtask, or routine when the user asks clearly and required fields are present. It asks a concise question when it cannot identify the required fields or parent.

**Acceptance**: model tool proposals cannot execute arbitrary operations; a successful message is shown only after the owning Supabase operation returns its persisted record.

## Functional requirements

- **FR-001**: Validate every user request, active-chat context, tool proposal, and terminal response against strict bounded schemas.
- **FR-002**: Treat active-chat text, retrieved records, tool results, and model output as untrusted; none may change system instructions, add a tool, or grant database authority.
- **FR-003**: Allow only read/search operations and one-at-a-time `create_task`, `create_subtask`, or `create_routine_series` operations from server-owned allowlists.
- **FR-004**: A direct, unambiguous user creation request may execute once without a second confirmation. Clarifications may use earlier user messages in the same active chat; assistant/model text alone never authorizes a write. Missing or ambiguous required values return a clarification and perform no write.
- **FR-005**: Reject delete, rename, schedule, status, recurrence edit, multi-record batch, arbitrary SQL, and free-form update proposals.
- **FR-006**: Redact credentials, cookies, passkeys, raw prompts, record contents, and provider responses from logs and public errors.
- **FR-007**: Distinguish success, empty, clarification, validation failure, dependency failure, and uncertain write outcome. Never describe an unconfirmed write as complete.

## Exclusions

Persistent confirmation grants, a new action ledger, approval dialogs for clear single-record creation, destructive actions, general task editing, and status/scheduling changes are outside the POC.

## Success criteria

- **SC-001**: Injection and malformed-proposal tests prove the server allowlist and strict validation remain authoritative.
- **SC-002**: Clear single-record create requests do not require an extra approval round trip.
- **SC-003**: Missing or ambiguous fields cause a clarification and zero write calls.
- **SC-004**: Unsupported mutations and repeated/uncertain outcomes never produce a false success message.
- **SC-005**: `npm test`, lint, and production build pass with actual command evidence.
