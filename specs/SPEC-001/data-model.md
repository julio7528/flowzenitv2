# Data and integration model: SPEC-001

## Persistence boundary

SPEC-001 adds no database entity, column, table, schema, grant, or policy. The current product schema and data remain unchanged. This document models only conceptual request flow and ownership; it does not propose persisted API sessions, user identities, or access-control records.

## Existing domain entities

Use only the entities approved by DEC-002: demands, tasks, subtasks, and routines. Their current hierarchy, status, scheduling, and recurrence semantics remain authoritative. Do not introduce an independent commitment/appointment entity, tenant, organization, or additional user.

Domain date and time interpretation uses the approved IANA timezone `America/Cuiaba` (DEC-003). API transport may use ISO 8601 timestamps where an instant is required; civil dates and local times remain explicit domain values and must not be silently converted between these concepts.

## Conceptual components

| Component | Responsibility | Current state |
| --- | --- | --- |
| Existing React/Vite application | Existing screens, routes, and current browser Supabase access | Exists; preserved by this SPEC |
| Existing browser Supabase client | Current public application connection | Exists; its key is public configuration, not an owner identity |
| Future same-origin agent API | HTTP boundary for agent capabilities | Not present; proposed for SPEC-002/runtime decision |
| DEC-001 access gate | Prevent private or privileged capability before adequate server-verifiable access control is approved, implemented, and verified | Closed by default; no future control mechanism selected |
| Typed domain capability | Query, retrieval, or write interface owned by the relevant SPEC | Defined downstream; not duplicated here |

## Conceptual request outcomes

- `success`: response contains only fields allowed by the typed capability.
- `empty`: successful query with an empty collection; not an integration error.
- `invalid`: request fails strict schema/allowlist validation before dispatch.
- `dependency_unavailable`: required configuration or dependency is unavailable; details and credentials stay server-side.
- `capability_disabled`: access gate is not satisfied; no private database/provider call or side effect occurs.
- `internal`: unexpected failure is mapped to a sanitized response and correlated server-side.

These are planning concepts, not a final wire contract. Route names, payload DTOs, HTTP status mapping, and exact provider error handling belong to SPEC-002 and the owning SPECs.
