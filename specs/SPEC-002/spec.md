# Feature Specification: LangGraph Runtime and DeepSeek Model Integration

**SPEC ID**: SPEC-002  
**Version**: 1  
**Dependencies**: [SPEC-001, SPEC-004]  
**Risk**: high

**Feature Branch**: not-created (existing branch main preserved)

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: Define the agent runtime using LangGraph.js and LangChain.js with DeepSeek as the primary LLM, typed tools, bounded execution, and recoverable state transitions.

## Scope and Exclusions

### In scope
- Define the graph lifecycle for a single user turn: receive, validate, assemble authorized context, invoke model, validate proposed tool calls, execute permitted tools, compose answer, persist outcomes.
- Define model adapter contracts, tool-call normalization, timeout/retry policy, cancellation, and deterministic test doubles.
- Ensure graph state carries the single-user application context, conversation ID, correlation ID, and a bounded tool ledger without adding an authentication principal; private-data and privileged tool calls remain blocked until the SPEC-001 access-control gate is satisfied.
- Define routing that distinguishes answer-only, tool-backed answer, clarification, refusal, and recoverable error.

### Explicitly out of scope
- Production chat UI, long-term memory storage, domain tool implementation, and vector retrieval.
- Selecting final DeepSeek model ID or provider retention settings; see DEC-006 and DEC-011.
- Arbitrary code execution, generated SQL, unrestricted agent loops, and autonomous background work.

## Contracts and Constraints

- **Existing contracts**: Use the data-integration context from SPEC-001 and typed query contracts from SPEC-004; no client-visible provider key.
- **Compatibility**: Runtime is server-side and optional until its dependencies, model/provider choices, and applicable data-disclosure decisions are approved.
- **Security and data handling**: A model tool call is an untrusted proposal. Revalidate name, schema, capability policy, domain preconditions, and budget at execution time. Provider input is limited by DEC-006.
- **Dependencies**: [SPEC-001, SPEC-004].

## User Scenarios & Testing

### User Story 1 - Receive a grounded answer (Priority: P1)

The single application user asks a question; the runtime either answers from available context or uses an allowed typed read tool.

**Why this priority**: This is the minimum useful agent turn and establishes safe orchestration.

**Independent Test**: Run graph tests with a deterministic model double that emits plain text, a valid tool call, malformed tool call, or refusal.

**Acceptance Scenarios**:
1. **Given** a question requiring no domain lookup, **When** the model returns a valid answer, **Then** the graph terminates in one turn without invoking tools.
2. **Given** a question requiring a lookup, **When** the model proposes an allowed typed tool call, **Then** the server validates and executes it and the final answer distinguishes retrieved facts from inference.
3. **Given** an unknown tool or invalid arguments, **When** the proposal is received, **Then** no tool executes and the graph returns a bounded validation outcome.

### User Story 2 - Bound execution and recover failures (Priority: P1)

The single application user can inspect a graph turn that terminates under timeout or provider failure without an unbounded model/tool loop.

**Why this priority**: Unbounded retries can duplicate actions and consume resources.

**Independent Test**: Inject provider timeout, tool timeout, retryable error, permanent error, and cancellation into the graph.

**Acceptance Scenarios**:
1. **Given** a transient provider failure, **When** the configured bounded retry policy is exhausted, **Then** the graph returns a stable retryable error with correlation ID.
2. **Given** a tool has already completed, **When** the graph resumes from a checkpoint, **Then** the tool ledger prevents duplicate execution.
3. **Given** the configured maximum step or time budget is reached, **When** another tool call is proposed, **Then** the graph stops and reports that the request was not completed.

### User Story 3 - Inspect a deterministic execution (Priority: P2)

A reviewer can reproduce a graph path with synthetic inputs and verify each node transition and tool proposal.

**Why this priority**: Deterministic tests make model-driven routing auditable.

**Independent Test**: Replay a versioned fixture against provider and tool doubles and compare node outcomes, not nondeterministic natural-language wording.

**Acceptance Scenarios**:
1. **Given** a fixed fixture, **When** the graph is executed with doubles, **Then** node order, tool decisions, terminal category, and correlation are deterministic.

### Edge Cases
- Provider returns both content and tool calls; runtime applies an explicit accepted response shape and rejects ambiguous combinations.
- Provider returns malformed JSON, an empty response, or unsupported tool-call format.
- A checkpoint references a tool call whose result was not durably recorded.
- Request is cancelled while the provider or tool is in flight.
- A user asks for an action while the mutation tools are disabled.

## Requirements

### Functional Requirements

- **FR-001**: The runtime MUST implement explicit graph states for validated request, context, model result, pending tool proposal, tool result, response, refusal, and failure.
- **FR-002**: Every graph invocation MUST carry the single-user application context, conversation ID, correlation ID, graph version, and bounded execution ledger. DEC-001 does not add a verified principal or new authentication; absence of one MUST NOT be treated as authorization, and private-data reads or privileged tools MUST remain unavailable until the SPEC-001 access-control gate is satisfied.
- **FR-003**: The model adapter MUST expose normalized message, tool proposal, usage metadata when available, finish reason, and provider error category.
- **FR-004**: Tool proposals MUST be schema-validated and authorized immediately before execution; prompt instructions cannot grant tool capabilities.
- **FR-005**: The graph MUST use named, versioned tools and MUST NOT accept SQL, table names, column names, or code from the model as executable input.
- **FR-006**: The graph MUST enforce configurable maximum nodes/turn steps, provider timeouts, tool timeouts, and bounded retries; defaults and ceilings must be recorded in the technical plan and must not create a financial budget.
- **FR-007**: Only errors classified as transient may be retried; validation, authorization, and domain-rule errors MUST terminate or request clarification without retrying the same operation.
- **FR-008**: Every mutation proposal MUST have a durable idempotency key before execution and a recorded outcome before graph continuation.
- **FR-009**: The graph MUST distinguish factual tool results, model inference, missing evidence, and uncompleted actions in its final response contract.
- **FR-010**: A terminal graph outcome MUST be one of completed, needs-clarification, denied, refused, timed-out, cancelled, or failed.
- **FR-011**: Provider model ID, API mode, response format, and data-sharing options MUST remain configurable decisions until DEC-006 and DEC-011 are resolved.
- **FR-012**: Automated tests MUST use deterministic model doubles; live provider calls MUST be opt-in and use synthetic data.

### Key Entities

- **Graph turn**: One bounded user request and its node/edge lifecycle.
- **Tool proposal**: Untrusted name and arguments returned by the model.
- **Execution ledger**: Durable references to authorized tool proposals and outcomes.
- **Model adapter result**: Provider-neutral response, finish state, usage, and error metadata.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of malformed or unauthorized synthetic tool proposals execute zero tools.
- **SC-002**: Every test turn reaches exactly one declared terminal category within its configured step and timeout limits.
- **SC-003**: Replaying a graph checkpoint does not repeat a completed synthetic mutation.
- **SC-004**: For deterministic fixtures, all graph node outcomes and tool decisions match the expected fixture on every run.

## Validation and Evidence

| Quality gate | Required | Command or method | Expected evidence |
| --- | --- | --- | --- |
| Lint/static checks | Yes | Project lint command | No new violations |
| Build/type check | Yes | Project production build | Runtime adapter included server-side only |
| Unit/integration tests | Yes | Graph and adapter tests with doubles | Routing, bounds, errors, replay |
| Database/RLS/contract tests | Yes | Tool/ledger contract tests | No SQL/code execution channel exists |
| E2E/accessibility/security evaluation | Yes | Service-level security tests | Prompted unknown tool, timeout, cancellation |

## Completion Evidence

- [ ] Acceptance scenarios and graph bounds have executed with stored evidence.
- [ ] Provider secrets and prompts are absent from browser bundles and logs.
- [ ] All required gates have exact commands/results; unavailable live provider checks are NOT VERIFIED.
- [ ] Changes remain within this SPEC's approved runtime scope.

## Assumptions

- DeepSeek is the primary provider per user direction, but the precise model/version is not fixed.
- Provider tool calls are proposals only; local validation remains authoritative.
- The graph can be invoked synchronously in the first release; durable background execution is not assumed.
