# SPEC-013 Test and Evaluation Quickstart

Implementation-time validation guide only. The test platform is not implemented by this document, and none of the commands below were run in this planning task.

## Prerequisites

- An explicitly approved implementation SPEC/batch.
- Synthetic fixture dataset with a reviewed manifest, version, and digest.
- For DB tests only: local disposable Supabase/Postgres or a specifically designated non-production test target with positive identity verification. Never use production credentials/data.
- For browser E2E: Playwright must first be approved and added; it is not currently a project dependency.
- For live-provider evaluation: synthetic data, server-side credentials, explicit opt-in, DEC-006 approval, approved limits/region/model metadata, and a separate command path. No ordinary test command may opt in implicitly.

## Existing baseline commands

From the repository root, during authorized implementation:

```powershell
npm run lint
npm run build
npm test
```

These are the existing project gates. `npm run test:sdd-db` covers the SDD control-plane smoke test and is not evidence of product RLS correctness.

## Suggested future test commands (not configured or run)

After implementation and dependency approval, add separately named commands for focused suites, for example:

```powershell
npm run test:unit
npm run test:contract
npm run test:security
npm run test:eval
npm run test:e2e
```

The command names are examples only; do not add scripts or packages during this Draft planning task.

## Required validation scenarios

1. **Deterministic/no provider**: run unit, contract, safety, and synthetic evaluation suites with no provider credentials; assert zero provider-network calls.
2. **Environment guard**: test missing, mismatched, ambiguous, and production targets using stubs; assert refusal before DB connection or writes. Then test a verified local disposable target with run-scoped fixtures and exact cleanup.
3. **Access gate**: with DEC-001 unsatisfied, exercise API and tool paths using synthetic requests; assert zero private repository/tool/provider calls and no private content/existence metadata.
4. **Security**: evaluate direct/indirect prompt injection, untrusted record/retrieved content, malformed tool calls, secret sentinel leak, confirmation replay, and unauthorized side effects.
5. **Domain/time**: verify SPEC-004 hierarchy/status/date contracts and SPEC-007 fixed-clock `America/Cuiaba` cases; do not assume tenant/foreign-owner identities.
6. **Persistence/recovery**: use an isolated DB and deterministic worker interruption to test idempotency, concurrent duplicate requests, outbox replay, checkpoint corruption, deletion, and no repeated completed side effects.
7. **RAG/grounding**: run the SPEC-009 versioned dataset against lexical-only, vector-only, hybrid, and structured baselines; report Recall@k/MRR/nDCG@k and citation/abstention metrics without inventing pass thresholds.
8. **LangGraph/LangSmith**: use deterministic model/tool doubles and fake trace sink by default; real LangSmith runs stay blocked by DEC-006 unless separately approved.
9. **E2E**: after Playwright setup, exercise navigation, access-disabled state, chat, keyboard/focus, accessibility and 1440/820/390 viewport behavior with synthetic records. Record first-attempt failures even if diagnostics retry.
10. **Evidence**: attach command, actual exit code, criterion, dataset version/digest, environment category, counts/result and safe artifact refs; mark unavailable checks `NOT VERIFIED`.

## SPEC-012 SC-001 proposal

Use the protocol in [spec012-usability-protocol.md](contracts/spec012-usability-protocol.md). It proposes 100 synthetic positive cases across five task strata and a 95% Wilson interval when the sampling assumptions apply. This protocol and the existing 90% criterion remain pending review; scripted tests do not establish human comprehension.

## Data/artifact restrictions

Do not use real conversations, private records, credentials, raw provider bodies, or production database snapshots. Do not retain raw Playwright traces/screenshots containing private UI. CI artifact retention is not chosen by this guide.
