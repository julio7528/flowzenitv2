# Contract: Dependency-Based SDD Scheduling and Gate Waivers

## Independent batch admission

An approved new batch may start while another batch is paused when:

1. The new batch has a valid exact manifest and owner approval.
2. Every dependency for every included SPEC is completed or appears earlier in the same manifest.
3. No included SPEC is active in another approved, running, or paused batch.
4. The other paused batch has no active execution lease or correction window.
5. No writable file scope overlaps an active run or active correction window.
6. The paused batch remains paused; no lease or state transition is inferred for it.

The batch may not start when any condition is false or cannot be verified.

## MVP database-contract test target

Prefer a physically isolated PostgreSQL database. When one is unavailable, an owner-authorized contract test may use direct SQL in the connected development Supabase project after verifying the exact project, target schema, test permissions, and absence of a unique run-specific fixture marker. Create synthetic records only, record generated IDs and parent relationships, roll back when possible, otherwise clean up only captured IDs in dependency order, and preserve every preexisting record. Direct contract tests must not call product agent endpoints. A privileged SQL session does not replace checks that runner-role grants and RPC permissions remain least-privilege.

## Gate outcome

```text
PENDING -> RUNNING -> PASSED
                    -> FAILED
                    -> SKIPPED
                    -> WAIVED (only after exact privileged owner authorization)
```

`WAIVED` does not mean the check passed. Completion accepts a required `WAIVED` gate only if a valid authorization record matches the exact run, gate key, SPEC snapshot, and approved manifest hash. A known failing behavior/security test or confirmed security finding cannot use an environmental-unavailability waiver. When a waiver resolves a persisted failure, its resolution evidence must reference the waiver record.

## Required waiver fields

- Batch ID and manifest hash.
- SPEC ID, version, content hash, run ID, and gate key.
- Owner approver and exact confirmation phrase.
- Reason, alternative evidence or unavailable condition, and accepted residual risk.
- Idempotency key.

The runner credential can prepare a waiver request and record supporting evidence. Only the privileged Supabase channel can authorize it.

## Reporting

Status output must list each required gate and its exact outcome. Summaries may state “completed with authorized waivers”; they must not count a waiver as a pass or omit the accepted residual risk.
