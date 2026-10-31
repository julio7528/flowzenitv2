# Research: SPEC-016

## Decision: Use dependency-based admission across separate batches

The current database RPC `sdd_create_batch` already rejects a batch with missing or incomplete prerequisite SPECs. Approval and claim checks prevent the same SPEC from being active in multiple batches. The stricter global “finish the current SPEC before any later SPEC” rule is also stated in `AGENTS.md`, the SDD constitution, and the runner skill.

**Rationale**: Replacing global serialization with dependency-based admission allows an independent SPEC to proceed while an unrelated batch remains paused. The paused batch keeps its state and exact manifest. Each new batch still requires owner approval of its own immutable manifest.

**Alternatives considered**:

- Resume the paused batch and finish every gate first: preserves the current rule but blocks independent work.
- Mutate the paused manifest to append another SPEC: rejected because it invalidates the approved hash and audit history.
- Run arbitrary concurrent SPECs: rejected because dependencies and writable-scope conflicts must still be checked.

## Decision: Persist gate waivers as a distinct owner-authorized state

The current gate table allows `PENDING`, `RUNNING`, `PASSED`, `FAILED`, and `SKIPPED`; `sdd_complete_spec` requires every required gate to be `PASSED`. There is no explicit state for owner-accepted alternate evidence or residual risk.

**Rationale**: `WAIVED` permits bounded MVP exceptions without turning missing evidence into a pass. Authorization must bind the precise manifest and gate, and reports must preserve the distinction.

**Alternatives considered**:

- Mark an unavailable test `PASSED` based on a different command: rejected because it misstates what was exercised.
- Keep the gate `SKIPPED` and manually change completion state: rejected because it bypasses the completion RPC and audit trail.
- Add an exact waiver authorization and allow completion with a visible `WAIVED` result: selected.

## Decision: Keep product authorization decisions unchanged

DEC-001, DEC-009, and DEC-012 remain independent. Gate-waiver authorization does not grant application access, approve an action, or set runtime limits.

## Verification scope

The facts above were checked against `supabase/migrations/20261028103332_sdd_governance_core.sql`, `scripts/sdd/sddctl.js`, `AGENTS.md`, and `.specify/memory/constitution.md`. No database writes or tests were run for this research.
