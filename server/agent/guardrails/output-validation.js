import { z } from 'zod';
import { canonicalizePayload } from './canonical-action.js';
import { assertServerOnlyRuntime } from '../runtime/server-only.js';
import { RUNTIME_LIMITS } from '../runtime/limits.js';

assertServerOnlyRuntime();

const ReferenceSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/);
const ClaimIdSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const ClaimTextSchema = z.string().min(1).max(4_000);

const OutputClaimSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    claimId: ClaimIdSchema,
    kind: z.literal('factual'),
    text: ClaimTextSchema,
    sourceReferences: z.array(ReferenceSchema).max(16).optional(),
  }),
  z.strictObject({
    claimId: ClaimIdSchema,
    kind: z.literal('inference'),
    text: ClaimTextSchema,
  }),
  z.strictObject({
    claimId: ClaimIdSchema,
    kind: z.literal('action-completion'),
    actionReference: ReferenceSchema,
  }),
]);

const CandidateSchema = z.strictObject({
  claims: z.array(OutputClaimSchema).max(64),
});
const TrustedFactSchema = z.strictObject({
  text: ClaimTextSchema,
  sourceReference: ReferenceSchema,
});
const TrustedActionOutcomeSchema = z.strictObject({
  actionReference: ReferenceSchema,
  status: z.enum(['executed', 'replayed']),
  safeOutcomeReference: ReferenceSchema.refine(reference => !reference.startsWith('uncertain:'), {
    message: 'Uncertain outcomes cannot prove action completion.',
  }),
});
const UncompletedActionSchema = z.strictObject({
  actionReference: ReferenceSchema,
  status: z.enum(['denied', 'failed', 'uncertain', 'not-executed']),
});

export const OUTPUT_VALIDATION_FAILURES = Object.freeze({
  invalid: Object.freeze({ success: false, reason: 'invalid_output' }),
  oversized: Object.freeze({ success: false, reason: 'response_too_large' }),
});

function immutableRecords(records) {
  return Object.freeze(records.map(record => Object.freeze({ ...record })));
}

function safeCandidate(candidate) {
  try {
    const { serialized } = canonicalizePayload(candidate);
    if (Buffer.byteLength(serialized, 'utf8') > RUNTIME_LIMITS.maxResponseBytes) {
      return OUTPUT_VALIDATION_FAILURES.oversized;
    }
    const parsed = CandidateSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success) return OUTPUT_VALIDATION_FAILURES.invalid;
    const ids = new Set();
    for (const claim of parsed.data.claims) {
      if (ids.has(claim.claimId)) return OUTPUT_VALIDATION_FAILURES.invalid;
      ids.add(claim.claimId);
    }
    return parsed.data;
  } catch {
    return OUTPUT_VALIDATION_FAILURES.invalid;
  }
}

/**
 * Capture server-owned source references and durable action outcomes, then
 * validate model-authored claims against those references. Model output never
 * supplies the evidence set or the action outcome state.
 */
export function createOutputValidator({
  trustedFacts = [],
  trustedActionOutcomes = [],
  uncompletedActions = [],
} = {}) {
  const facts = z.array(TrustedFactSchema).max(256).parse(trustedFacts);
  const sourcesByFact = new Map();
  for (const fact of facts) {
    const references = sourcesByFact.get(fact.text) ?? new Set();
    references.add(fact.sourceReference);
    sourcesByFact.set(fact.text, references);
  }
  const actionOutcomes = immutableRecords(z.array(TrustedActionOutcomeSchema).max(64).parse(trustedActionOutcomes));
  const pendingActions = immutableRecords(z.array(UncompletedActionSchema).max(64).parse(uncompletedActions));
  if (new Set(actionOutcomes.map(outcome => outcome.actionReference)).size !== actionOutcomes.length) {
    throw new TypeError('Trusted action outcomes must have unique references.');
  }
  const outcomesByAction = new Map(actionOutcomes.map(outcome => [outcome.actionReference, outcome]));

  function validate(candidate) {
    const parsed = safeCandidate(candidate);
    if (parsed === OUTPUT_VALIDATION_FAILURES.invalid || parsed === OUTPUT_VALIDATION_FAILURES.oversized) {
      return parsed;
    }

    const claims = [];
    const inference = [];
    const missingEvidence = [];
    const claimedCompletions = new Set();

    for (const claim of parsed.claims) {
      if (claim.kind === 'inference') {
        const item = Object.freeze({ claimId: claim.claimId, text: claim.text });
        claims.push(Object.freeze({ ...item, classification: 'inference', evidenceReferences: Object.freeze([]) }));
        inference.push(item);
        continue;
      }

      if (claim.kind === 'action-completion') {
        const outcome = outcomesByAction.get(claim.actionReference);
        if (!outcome) {
          missingEvidence.push(claim.claimId);
          continue;
        }
        claimedCompletions.add(claim.actionReference);
        continue;
      }

      const references = claim.sourceReferences ?? [];
      const factSources = sourcesByFact.get(claim.text);
      const grounded = references.length > 0
        && Boolean(factSources)
        && references.every(reference => factSources.has(reference));
      if (grounded) {
        claims.push(Object.freeze({
          claimId: claim.claimId,
          text: claim.text,
          classification: 'evidence',
          evidenceReferences: Object.freeze([...new Set(references)]),
        }));
      } else {
        const item = Object.freeze({ claimId: claim.claimId, text: claim.text });
        claims.push(Object.freeze({ ...item, classification: 'inference', evidenceReferences: Object.freeze([]) }));
        inference.push(item);
        missingEvidence.push(claim.claimId);
      }
    }

    const value = {
      claims: Object.freeze(claims),
      inference: Object.freeze(inference),
      missingEvidence: Object.freeze(missingEvidence),
      completedActions: Object.freeze(actionOutcomes.map(outcome => Object.freeze({
        actionReference: outcome.actionReference,
        status: outcome.status,
        safeOutcomeReference: outcome.safeOutcomeReference,
      }))),
      uncompletedActions: pendingActions,
      verifiedClaimedCompletions: Object.freeze([...claimedCompletions]),
    };

    try {
      if (Buffer.byteLength(canonicalizePayload(value).serialized, 'utf8') > RUNTIME_LIMITS.maxResponseBytes) {
        return OUTPUT_VALIDATION_FAILURES.oversized;
      }
    } catch {
      return OUTPUT_VALIDATION_FAILURES.invalid;
    }
    return Object.freeze({ success: true, value: Object.freeze(value) });
  }

  return Object.freeze({ validate });
}
