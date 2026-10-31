# Feature Specification: Agent Data Integration Foundation

**SPEC ID**: SPEC-001
**Version**: 3
**Dependencies**: []
**Risk**: high
**Status**: Draft

## Owner-approved POC boundary

The FlowZenit agent may use the Supabase project and the existing anonymous database permissions for its POC. This accepts that the agent endpoint and all data available to `anon` are public. The current browser passkey remains navigation state; it does not authenticate API calls. Keep the existing permissions and schema unchanged.

The POC uses the existing Supabase JavaScript/PostgREST path. It does not add Docker, local PostgreSQL, a database branch, direct Node `pg`, `service_role`, Supabase Auth, new RLS policies, grants, or tables. This approval is limited to the POC and does not authorize deployment.

## User scenarios

### US1 — Use the existing Supabase data path

As the FlowZenit agent, I use the existing Supabase project and only the typed reads and writes defined by the dependent SPECs.

**Acceptance**: the server uses the existing public Supabase configuration; calls outside the registered typed operations cannot access a table or execute SQL; missing Supabase configuration produces a safe dependency error.

### US2 — Run the POC agent

As the owner, I can use the agent without adding a new login or changing the existing database permissions.

**Acceptance**: the POC access gate is open for the agent route; callers are not described as authenticated; the passkey, browser storage, request fields, and model output do not grant additional database privileges.

## Functional requirements

- **FR-001**: Use the existing FlowZenit Supabase project and the current `anon`/publishable-key permission boundary.
- **FR-002**: Enable only operations registered in the server-side typed tool allowlist. Reject arbitrary SQL, table names, columns, and operation names.
- **FR-003**: Preserve the existing schema, grants, RLS policies, triggers, browser access path, and application routes.
- **FR-004**: Do not use `service_role`, a direct Node PostgreSQL driver, Docker, local PostgreSQL, or another database for the agent POC.
- **FR-005**: Keep the agent route public and label it accurately as unauthenticated. Do not treat the browser passkey or client state as API authentication.
- **FR-006**: Keep provider credentials on the server. The public Supabase key may be used only within the existing anonymous permissions.
- **FR-007**: Do not add an agent-to-Supabase data path to browser code; the chat uses the same-origin server route.

## Exclusions

Authentication, new user/tenant identity, database/schema/grant/RLS changes, privileged Supabase access, arbitrary SQL, deletion, deployment, and persistent agent conversation history are outside this POC.

## Success criteria

- **SC-001**: The agent can reach the existing Supabase project with the publishable/anonymous configuration and no other database credential.
- **SC-002**: The public POC boundary is documented in the UI/API behavior and the project decision record.
- **SC-003**: No agent operation can exceed existing `anon` permissions or escape the typed tool registry.
- **SC-004**: Lint, build, and applicable automated tests pass with actual command evidence.
