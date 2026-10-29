# SPEC-001 implementation verification quickstart

This guide describes future checks for an implementation admitted through an explicitly user-approved SDD batch. It does not authorize implementation or run any command now.

## Preconditions

- Use the exact SPEC version admitted by the batch manifest and execute only through `$sdd-run`.
- Keep DEC-001's access gate closed unless a separate access-control mechanism has been approved, implemented, and verified.
- Use synthetic fixtures only for this closed-gate scope. Direct product-database integration is NOT APPLICABLE because no database behavior is added; if scope later adds a database test, use an isolated non-production target and never production or private FlowZenit records.
- Do not add dependencies without an approved SPEC decision. The project currently has no Vercel CLI/API test harness declared.

## Local checks after implementation is authorized

1. Run `npm test` for unit, contract, security, and integration doubles.
2. Run `npm run lint` and `npm run build`.
3. Set a synthetic `SPEC001_SCAN_SENTINEL` value and scan emitted browser assets/source maps with `node scripts/security/scan-client-assets.js dist`. Confirm server-only values and unprefixed server environment values do not appear in the client output; the scanner must not print the matched value.
4. If SPEC-002 selects Vercel Functions, validate local function routing with the chosen local workflow. Vercel documents `vercel dev`; the CLI is not currently installed or declared by this project, so adding or invoking it requires an implementation plan decision.
5. With the gate closed, call the handler/service using a synthetic private request and spies. Confirm no Supabase/provider call occurs, no private value is returned, and no write side effect occurs. Confirm the browser passkey state does not change the result.
6. Exercise empty success, invalid DTO, missing configuration, dependency unavailable, and internal failure; compare public responses and logs against the redaction contract.
7. Do not connect to the product database for this SPEC. The mandatory QG-04 negative-path test proves zero Supabase/provider calls. SC-001's positive typed-query equivalence remains NOT VERIFIED while DEC-001's separate access-control gate is closed; if that prerequisite is later met, run SC-001 only against an isolated non-production fixture. Do not apply migrations or modify grants/RLS in SPEC-001.

## Completion evidence

Record exact commands and actual outcomes as PASS, FAIL, or NOT VERIFIED in the SPEC's completion evidence and authorized SDD run. Record NOT APPLICABLE gates with their scope rationale; never represent them as PASS. Verify that existing UI routes and browser database behavior remain unchanged. A passing foundation does not enable private agent capabilities while the DEC-001 gate is unmet, and does not pass SC-001 or the downstream runtime behavior in SC-004/SC-005.
