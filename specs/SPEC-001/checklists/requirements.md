# Specification Quality Checklist: Agent Data Integration Foundation

**Purpose**: Review checklist for the revised, integration-only scope of SPEC-001.  
**Created**: 2026-10-28  
**Feature**: ../spec.md

## Content Quality

- [x] The purpose is limited to integrating the agent with the existing Supabase connection.
- [x] Existing React/Vite routes, UI, database schema, grants, and access mechanisms are explicitly preserved.
- [x] The single-owner scope preserves the existing passkey without representing it as server-verifiable authentication or adding a new authentication method.
- [x] Query, write, runtime, and RAG responsibilities remain assigned to their owning SPECs.

## Requirement Completeness

- [x] Provider and privileged credentials are required to remain out of frontend bundles and client-visible logs.
- [x] Arbitrary model-generated SQL and table/column access are excluded.
- [x] Existing write confirmations under DEC-009 and SPEC-005/SPEC-006 remain in force.
- [x] No new schema, grants, RLS policies, login UI, session store, MFA, or owner UUID is required.
- [x] Existing public and anonymous access is documented as unresolved and is not used to authorize new agent access to private data.
- [x] Private-data and privileged agent endpoints are gated on adequate access control; no future mechanism is invented or approved.
- [x] Requirements and success criteria are observable and testable.

## Feature Readiness

- [x] The SPEC does not duplicate agent runtime, domain tools, RAG, memory, chat UI, or observability.
- [x] Direct product-database integration is NOT APPLICABLE to this scope: no query handler, product route, server Supabase client, persistence, schema, grant, or RLS change is introduced. The required synthetic fail-closed integration check proves zero database/provider calls. Any future database test must use an isolated non-production target.
- [x] Missing adequate access control blocks private-data and privileged agent capabilities in development and production endpoints.
- [x] The data-query acceptance scenario requires the DEC-001 access gate; current browser grants and the passkey cannot satisfy it.
- [x] SC-001 retains its post-gate meaning and is NOT VERIFIED while the separate DEC-001 access-control prerequisite is unmet; it is not marked PASS by closed-gate foundation work.
- [x] T012 documentary ownership checks do not mark SC-004/SC-005 runtime delegation or write-confirmation behavior PASS; those remain NOT VERIFIED until the owning capabilities and tests exist.
- [x] Planning distinguishes the proposed server API boundary from the unselected runtime and from any enabled private capability.
- [x] Quality gates map to tasks, verification methods, evidence, pass conditions, and applicability in `plan.md`; unexecuted checks are not PASS.
- [x] T012 includes a reproducible documentary contract review for the SPEC-002 runtime, SPEC-004 typed-read, and SPEC-005 guardrail/confirmation boundaries; no downstream implementation is required.
- [ ] Exact API/runtime settings and typed-query interface are confirmed by their owning SPECs before implementation or activation; SPEC-001 does not select them.
- [ ] DEC-006 and DEC-010 are resolved before their corresponding external-data and deployment behaviors are enabled.

## T012 Cross-SPEC documentary review

**Run:** 2026-10-29, authorized run for `SPEC-001@2`. This is a read-only comparison of current documents, not runtime, database, or downstream implementation evidence. Re-run this procedure if an owning SPEC changes before its implementation.

| Boundary | Sources reviewed and exact references | Documentary status | Runtime / implementation status | Follow-up / limitation |
| --- | --- | --- | --- | --- |
| SPEC-002 runtime and HTTP ownership | `specs/SPEC-002/spec.md` FR-002/FR-004/FR-005, Requirements; `specs/SPEC-002/plan.md` Architecture Proposal (`checkCapabilities`, `authorizeAndExecute`), Contracts and Integration, Dependencies and Contracts; `specs/SPEC-002/contracts/agent-turn.md` Request/Response; `specs/SPEC-002/contracts/runtime-ports.md` Tool registry and executor | PASS — runtime owns HTTP/orchestration, creates trusted server context, checks DEC-001 before protected Supabase/provider calls, does not trust caller identity hints, and delegates typed reads to SPEC-004. | NOT VERIFIED — route, status mapping, runtime behavior, and provider calls are proposals and were not executed. | `specs/SPEC-002/plan.md` Dependencies and Contracts still says `SPEC-001@1`; the SPEC-002 owner must reconcile this stale prerequisite reference before preparing its future implementation manifest. Exact route, runtime, and numeric limits remain pending. |
| SPEC-004 typed reads | `specs/SPEC-004/spec.md` FR-014/FR-015/FR-016, Requirements; `specs/SPEC-004/plan.md` Dependencies and Contracts, Named read operations, Security boundary; `specs/SPEC-004/contracts/read-tools.md` Principles, Operations, Errors, and Contract test criteria | PASS — SPEC-004 owns named structured read operations, rejects model-selected SQL/table/column/query fragments, preserves relational-source semantics, and checks the DEC-001 gate before repository access. | NOT VERIFIED — no read tool or runtime composition is implemented or executed in this run. | No private query runs while the gate is closed. Exact runtime integration and database behavior remain with the owning SPECs and their approved gates. |
| SPEC-005 guardrails and confirmations | `specs/SPEC-005/spec.md` FR-001/FR-002/FR-007/FR-015; `specs/SPEC-005/plan.md` Separate checks and DEC-009 behavior; `specs/SPEC-005/contracts/guardrail-pipeline.md` Pipeline/Policy decision point/Tool execution; `specs/SPEC-005/contracts/confirmation-lifecycle.md` Cycle/DEC-009 gate | PASS — access control is evaluated separately and before action policy/confirmation; missing DEC-009 entries deny; neither policy approval nor confirmation authenticates the owner or opens DEC-001. | NOT VERIFIED — no protected action, confirmation store, or runtime policy is executed. | DEC-009 matrix and storage details remain pending; protected writes stay disabled. `specs/SPEC-005/plan.md` Dependencies and Contracts still says `SPEC-001@1`; the SPEC-005 owner must reconcile this stale prerequisite reference before its future implementation manifest. |

These PASS values apply only to the documentary boundary comparison in this task; they do not pass a runtime, database, security, or downstream SDD implementation gate. SC-004/SC-005 runtime behavior remains NOT VERIFIED. The two stale `SPEC-001@1` references are assigned to the SPEC-002 and SPEC-005 owners and are not changed by SPEC-001.

## T014 Execution evidence — authorized run for SPEC-001@2

This section records this run only. It does not change the approved SPEC snapshot, requirements, plan, or task definitions.

### Quality-gate outcomes

| Gate | Outcome | Actual evidence and limitation |
| --- | --- | --- |
| QG-01 Lint | PASS | `rtk proxy npm run lint` exited 0 and ran the package `oxlint` script. The initial normal invocation reported an RTK output-adapter JSON parse error; the repository `RTK.md` directs use of `rtk proxy` when condensed output is unusable. No code correction was needed. |
| QG-02 Production build | PASS | `rtk proxy npm run build` exited 0. Vite built 165 modules. The 22 preexisting ignored `dist` files (723,398 bytes) had identical paths, sizes, and SHA-256 hashes after the build. |
| QG-03 Unit tests | PASS | `npm test` exited 0: 33 passed, 0 failed. |
| QG-04 Fail-closed security/integration | PASS at synthetic module boundary | `node --test tests/unit/server/accessGate.test.js tests/security/agentNoPrivateAccess.test.js` exited 0: 5 passed, 0 failed. Tests verify the closed helper denies requests and produces zero injected Supabase/provider calls and side effects. No route or deployed endpoint exists in this SPEC, so this does not claim endpoint-level runtime verification. |
| QG-05 Client-asset secret scan | PASS for synthetic sentinel | `node scripts/security/scan-client-assets.js dist` exited 0 and scanned 22 files with no synthetic sentinel match. The scanner's test suite also verifies a sentinel match is detected without printing its value. No real credential was read or included in test output. |
| QG-06 Cross-SPEC contract consistency | PASS documentary only | T012's current-document review is recorded above. It identifies two stale `SPEC-001@1` prerequisite references and assigns them to the SPEC-002 and SPEC-005 owners. No downstream implementation or runtime behavior is claimed. |
| QG-07 Direct product-database integration | NOT APPLICABLE | This SPEC added no product query, route, Supabase data client, persistence, schema, grant, or RLS behavior. No product database connection was made; QG-04 used synthetic fakes and proved zero calls. |
| QG-08 SC-001 post-gate query equivalence | NOT VERIFIED | DEC-001's separate access-control prerequisite remains unmet and the gate remains closed; no query or product-database test ran. |
| QG-09 UI/E2E/accessibility | NOT APPLICABLE | No UI or route changed in this SPEC's execution scope. |
| QG-10 SC-004/SC-005 runtime delegation and confirmation | NOT VERIFIED | The owning runtime/query/retrieval/write capabilities and DEC-009 confirmation matrix remain unimplemented or pending. T012 is documentation-only. |

### Success-criterion status

| Criterion | Status | Evidence / boundary |
| --- | --- | --- |
| SC-001 | NOT VERIFIED | Positive typed-query equivalence requires the separate DEC-001 access-control prerequisite and an isolated target; neither was used. |
| SC-002 | PASS for the synthetic sentinel check | The scanner detected the sentinel in a synthetic test fixture, did not disclose it, and found no match in the built browser assets. This is not a claim that any real credential was read or tested. |
| SC-003 | PASS for this execution's change set | The implementation added server boundary helpers and tests only. It added no authentication UI/session/owner UUID check, application route, schema/grant/RLS change, or migration. Preexisting workspace changes were preserved. |
| SC-004 | NOT VERIFIED at runtime | T012 confirms documentary ownership for typed reads, RAG, and writes; no runtime delegation or duplicate-capability check was executed. |
| SC-005 | NOT VERIFIED at runtime | No write capability ran. DEC-009 remains pending; documentation consistency does not verify confirmation behavior. |
| SC-006 | PASS | The checklist and contracts continue to describe anonymous/public access as an unresolved risk, not authentication, authorization, remediation, or approval for agent access. |
| SC-007 | NOT VERIFIED at endpoint level | Synthetic requests through the closed helper returned no private result and caused zero downstream calls/side effects. No agent endpoint was introduced, so endpoint-level behavior is not claimed. |

### Scope and remaining limits

- DEC-001 remains respected: the existing client passkey is unchanged and is not server-verifiable identity; no private endpoint, private Supabase read, privileged operation, or provider call with private FlowZenit data was enabled.
- The error/log helpers generate a UUID when no trusted request context is supplied. Their optional correlation input preserves a valid UUID; a future SPEC-002 route must generate the ID server-side and must never pass through a caller-supplied `requestId`. No route integration exists in this SPEC, so that behavior remains NOT VERIFIED.
- No product database, Supabase RPC outside the SDD runner, AI provider, or LangSmith service was called. No migration, Vercel configuration, route, or application UI was changed by this run.
- `plan.md` describes evidence recording in a future SDD run because it predates this execution. The approved snapshot is immutable; actual run evidence is recorded here and in the SDD ledger rather than editing the approved plan.
- All 14 executable tasks are recorded separately in the active SDD run. Quality-gate states and the conditional classifications above are also persisted there; skipped or conditional checks are not marked PASS.

## Notes

- DEC-001 v2 is approved; its prior server-authentication requirement is retained in the decision history as superseded.
- The existing browser passkey gate and anon database policies are unchanged; the passkey is not server-verifiable and the exposure is not accepted as a security basis for agent endpoints.
- This checklist reviews specification completeness only; it does not authorize implementation, migrations, or a batch.

