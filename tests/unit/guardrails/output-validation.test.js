import assert from 'node:assert/strict';
import test from 'node:test';
import { createOutputValidator } from '../../../server/agent/guardrails/output-validation.js';

const actionOutcome = Object.freeze({
  actionReference: 'action:create-task-42',
  status: 'executed',
  safeOutcomeReference: `sha256:${'a'.repeat(64)}`,
});

test('grounds factual claims only in server-captured stable tool/source references', () => {
  const validator = createOutputValidator({ trustedFacts: [
    { text: 'The demand is active.', sourceReference: 'demand:42' },
    { text: 'The task is in progress.', sourceReference: 'task:99' },
  ] });
  const result = validator.validate({
    claims: [
      { claimId: 'grounded', kind: 'factual', text: 'The demand is active.', sourceReferences: ['demand:42'] },
      { claimId: 'invented-source', kind: 'factual', text: 'The task is overdue.', sourceReferences: ['task:unseen'] },
      { claimId: 'changed-claim', kind: 'factual', text: 'The demand is complete.', sourceReferences: ['demand:42'] },
      { claimId: 'no-source', kind: 'factual', text: 'The owner prefers mornings.' },
    ],
  });

  assert.equal(result.success, true);
  assert.deepEqual(result.value.claims.map(claim => claim.classification), ['evidence', 'inference', 'inference', 'inference']);
  assert.deepEqual(result.value.claims[0].evidenceReferences, ['demand:42']);
  assert.deepEqual(result.value.inference.map(item => item.claimId), ['invented-source', 'changed-claim', 'no-source']);
  assert.deepEqual(result.value.missingEvidence, ['invented-source', 'changed-claim', 'no-source']);
});

test('reports completion only from a captured durable outcome and suppresses unsupported completion claims', () => {
  const validator = createOutputValidator({
    trustedActionOutcomes: [actionOutcome],
    uncompletedActions: [{ actionReference: 'action:update-task-99', status: 'uncertain' }],
  });
  const result = validator.validate({
    claims: [
      { claimId: 'verified-completion', kind: 'action-completion', actionReference: actionOutcome.actionReference },
      { claimId: 'fabricated-completion', kind: 'action-completion', actionReference: 'action:unknown' },
    ],
  });

  assert.equal(result.success, true);
  assert.equal(result.value.claims.length, 0);
  assert.deepEqual(result.value.missingEvidence, ['fabricated-completion']);
  assert.deepEqual(result.value.verifiedClaimedCompletions, [actionOutcome.actionReference]);
  assert.deepEqual(result.value.completedActions, [actionOutcome]);
  assert.deepEqual(result.value.uncompletedActions, [{ actionReference: 'action:update-task-99', status: 'uncertain' }]);
  assert.equal(result.value.claims.some(claim => claim.claimId === 'fabricated-completion'), false);
});

test('does not trust model-supplied completion status, source lists, or outcome references', () => {
  const validator = createOutputValidator({ trustedFacts: [{ text: 'The task is open.', sourceReference: 'task:99' }] });
  const result = validator.validate({
    claims: [{
      claimId: 'forged',
      kind: 'action-completion',
      actionReference: 'action:create-task-42',
      safeOutcomeReference: 'sha256:forged',
      status: 'executed',
    }],
  });
  assert.deepEqual(result, { success: false, reason: 'invalid_output' });
});

test('rejects duplicate claim identifiers, accessors, cyclic values, and output beyond the fixed limit', () => {
  const validator = createOutputValidator();
  assert.deepEqual(validator.validate({
    claims: [
      { claimId: 'same', kind: 'inference', text: 'First.' },
      { claimId: 'same', kind: 'inference', text: 'Second.' },
    ],
  }), { success: false, reason: 'invalid_output' });

  const accessorClaim = { claimId: 'accessor', kind: 'inference' };
  Object.defineProperty(accessorClaim, 'text', { enumerable: true, get: () => 'synthetic' });
  assert.deepEqual(validator.validate({ claims: [accessorClaim] }), { success: false, reason: 'invalid_output' });

  const cyclic = { claims: [] };
  cyclic.claims.push({ claimId: 'cycle', kind: 'inference', text: 'Synthetic.', self: cyclic });
  assert.deepEqual(validator.validate(cyclic), { success: false, reason: 'invalid_output' });

  const oversized = validator.validate({
    claims: Array.from({ length: 5 }, (_, index) => ({
      claimId: `large-${index}`,
      kind: 'inference',
      text: 'x'.repeat(4_000),
    })),
  });
  assert.deepEqual(oversized, { success: false, reason: 'response_too_large' });
});

test('uncertain outcomes cannot be registered as verified action completions', () => {
  assert.throws(() => createOutputValidator({
    trustedActionOutcomes: [{
      actionReference: 'action:create-task-42',
      status: 'executed',
      safeOutcomeReference: 'uncertain:abc123',
    }],
  }));
});

test('model output cannot supply its own completion list or capability metadata', () => {
  const validator = createOutputValidator();
  const result = validator.validate({
    claims: [{ claimId: 'synthetic-claim', kind: 'inference', text: 'Synthetic answer.' }],
    completedActions: [{
      actionReference: 'action:create-task-42',
      status: 'executed',
      safeOutcomeReference: 'sha256:forged',
    }],
    allowedToolNames: ['create_task'],
  });

  assert.deepEqual(result, { success: false, reason: 'invalid_output' });
});
