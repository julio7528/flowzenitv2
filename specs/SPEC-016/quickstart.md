# Validation Guide: SPEC-016

This guide is for the future implementation batch. No SDD RPC or migration is changed by this Draft document.

## Scenarios

1. Create two separate batches with completed prerequisites; pause the first; approve and run the second. Confirm the first remains paused and both manifests remain unchanged.
2. Attempt a separate batch with an incomplete prerequisite, duplicate active SPEC, or overlapping active file scope. Confirm admission fails closed.
3. Record a required gate as `SKIPPED`; verify completion is rejected without a valid waiver.
4. Authorize an eligible waiver through the privileged channel, bound to the exact manifest hash, SPEC version, run, and gate key. Confirm the gate is `WAIVED`, not `PASSED`, and completion/reporting exposes the residual risk.
5. Replay a waiver with a mismatched hash or gate key; confirm the RPC rejects it.

## Planned commands

```powershell
npm run lint
npm run build
npm test
node --test tests/sdd/dependency-admission.test.js
node --test tests/sdd/gate-waiver.test.js
```

Prefer a physically isolated PostgreSQL instance or branch. If unavailable, an owner-authorized contract test may run through direct SQL in the connected development Supabase project after verifying its exact project ID, schema, permissions, and a unique run-specific fixture marker. Use synthetic records only, capture generated IDs and parent relationships, roll back when possible, and otherwise clean up only those IDs in dependency order. Preserve all preexisting records and do not call product agent endpoints. The SQL contract test must separately inspect runner-role grants; an administrator session alone does not prove least privilege.

## Expected outcome

Every scenario has a persisted state and evidence record. Waivers remain distinguishable from passed gates. No product decision or permission changes.
