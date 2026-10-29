# Proposed SPEC-012 SC-001 Evaluation Protocol

**Status**: Proposal for user review; not an approval or change to SPEC-012's 90% target.

## Proposed scenario set

- Freeze **100 synthetic pt-BR read-only scenarios**, provisionally split into five equal strata (20 cases each): exact status/date/time, hierarchy lookup, daily/weekly planning, recurrence/relative-time, and semantic-name/synonym lookup.
- Use fabricated records with expected results and source references. Keep no-result, ambiguity, stale, partial, and refusal cases in separate companion suites; they measure safe abstention, not positive source identification.
- Each case is an independent task fixture and one run contributes at most one binary result. Report total and per-stratum numerator/denominator, fixture IDs, dataset digest, and failure categories.

## Proposed success scoring

One scenario succeeds only if the query follows the expected route, returns the expected read-only fact, displays the correct human-readable source reference without a hint, and makes no unsupported factual claim. A scripted evaluator can assert the expected source reference is visible and correctly associated. It cannot prove a human understood the reference.

## Uncertainty and representativeness

- If cases are sampled from a defined intended query distribution and treated as independent Bernoulli observations, report a two-sided 95% Wilson interval with the observed proportion. The interval is descriptive for a fixed synthetic benchmark unless sampling assumptions are justified.
- If several queries are completed by each human participant, observations cluster by participant; use a participant-level bootstrap or other predeclared cluster-aware interval, not a naive case-level binomial interval.
- If “synthetic users” is intended to mean scripted user personas, report scenario success, not usability. If it means human users, use volunteers with synthetic data and document population, accessibility/device representation, task protocol, and scoring before recruiting.
- Sample size, category weights, interval method, evaluator population, and the use of the existing 90% threshold as a release gate remain pending user approval.
