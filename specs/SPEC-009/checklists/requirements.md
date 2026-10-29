# Specification Quality Checklist: Hybrid Retrieval, Full Text Search, RRF, and Grounding

**Purpose**: Reviewer checklist for retrieval applicability, ranking quality, authorization, and grounding.
**Created**: 2026-10-28
**Feature**: ../spec.md

## Content Quality

- [x] RAG use is separated from exact transactional query use.
- [x] Retrieval output preserves source and hierarchy provenance.
- [x] Fused rankings and unsupported claims have explicit outcomes.
- [x] Mandatory template sections are complete.

## Requirement Completeness

- [x] Lexical/vector failure, stale candidates, empty result, and duplicate candidates are covered.
- [x] Evaluation metrics and a repeatable synthetic test approach are named.
- [ ] Baseline comparison, minimum Recall@5/MRR gain and evidence/abstention threshold await explicit approval; no values are chosen.
- [x] Success criteria are measurable.
- [x] Dependencies and production gates are explicit.

## Feature Readiness

- [x] Tests include exact query routing and untrusted retrieved content.
- [x] Existing data-access behavior and retrieval filters are preserved without adding authentication; private retrieval remains blocked until the SPEC-001 access-control gate is satisfied.
- [x] Production enablement is gated on data-sharing and corpus-value decisions.
- [x] Query-time provider use also remains gated on runtime/model/call-limit decisions (DEC-010/011/012); these approvals are still pending.

## Notes

- Current short titles may not justify vector cost or external data transfer; the evaluation decides whether to proceed.
- A checked item means the requirement is explicit in this Draft document, not that retrieval code or tests exist or have run.
