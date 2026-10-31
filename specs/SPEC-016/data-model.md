# Data Model: SPEC-016

## Existing entities

### Batch

- `batch_id`: immutable operational identity.
- `manifest` / `manifest_hash`: ordered SPEC version set and integrity binding.
- `state`: lifecycle of this batch only.
- `current_spec_id`: active position when the batch is running.
- `pause_reason`: reason the batch stopped; independent batches do not clear it.

### Quality gate

- `run_id`, `gate_key`: identity of one gate in one SPEC execution.
- `required`: whether it participates in completion eligibility.
- `waiver_policy`: immutable gate eligibility derived from the approved SPEC snapshot; defaults to `NEVER` and cannot be selected by a runner at execution time.
- `state`: gate outcome; `WAIVED` is distinct from `PASSED`.
- `command`, `exit_code`, `evidence`: concise test method and evidence without secrets.

## New entity: Gate waiver authorization

- `waiver_id`: immutable waiver record identifier.
- `batch_id`: exact batch receiving the waiver.
- `manifest_hash`: approved manifest hash at authorization time.
- `run_id`: exact SPEC run.
- `spec_id`, `spec_version`, `spec_content_hash`: immutable SPEC identity.
- `gate_key`: exact required quality gate.
- `outcome_basis`: either accepted alternate evidence or owner acceptance of a specifically identified unavailable check.
- `approved_by`: owner identity from the privileged approval channel.
- `reason`: concise accepted residual risk or unavailability explanation.
- `alternative_evidence`: safe command/method and evidence reference; never credentials or private content.
- `idempotency_key`: prevents duplicate authorization on retry.
- `created_at`: server timestamp.

## Integrity rules

- A waiver is valid only when batch, manifest hash, SPEC version/hash, run, and gate key all match current persisted records.
- A waiver is valid only when the immutable gate policy permits the selected waiver basis; execution-time runner input cannot make an ineligible gate waivable.
- An unauthorized, duplicate, stale, or mismatched waiver request fails closed.
- A required gate in `WAIVED` state must have exactly one matching authorization record.
- Reports retain the `WAIVED` label and include the reason/evidence reference.
- Existing `PASSED`, `FAILED`, and `SKIPPED` records are not rewritten.
