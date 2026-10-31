import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { createSideEffectSpy } from '../../unit/guardrails/test-helpers.js';
import { SYNTHETIC_CONFIRMATION_MATRIX } from '../../fixtures/security/confirmations.js';
import {
  createPocTurnContext,
  createPolicyEvaluator,
  evaluatePocAction,
} from '../../../server/agent/guardrails/policy.js';

const target = Object.freeze({ id: 'synthetic' });
const inputSchema = z.strictObject({ value: z.string() });
const registry = new Map([
  ['synthetic.read@1', {
    operationName: 'synthetic.read', operationVersion: '1', capability: 'synthetic.read', enabled: true,
    inputSchema, isTargetInScope: serialized => serialized === '{"id":"synthetic"}',
    readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }), handler: () => 'synthetic-result',
  }],
  ['synthetic.disabled@1', {
    operationName: 'synthetic.disabled', operationVersion: '1', capability: 'synthetic.disabled', enabled: false,
    inputSchema, isTargetInScope: () => true,
    readPreconditions: () => ({ available: true, valid: true, snapshot: {} }), handler: () => 'synthetic-result',
  }],
  ['synthetic.write@1', {
    operationName: 'synthetic.write', operationVersion: '1', capability: 'synthetic.write', enabled: true,
    inputSchema, isTargetInScope: serialized => serialized === '{"id":"synthetic"}',
    readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }), handler: () => 'synthetic-result',
  }],
  ['synthetic.unavailable-precondition@1', {
    operationName: 'synthetic.unavailable-precondition', operationVersion: '1', capability: 'synthetic.unavailable-precondition', enabled: true,
    inputSchema, isTargetInScope: () => true,
    readPreconditions: () => ({ available: false }), handler: () => 'synthetic-result',
  }],
]);

function createEvaluator(overrides = {}) {
  return createPolicyEvaluator({
    accessGate: { allowsAction: async () => true },
    matrixProvider: () => SYNTHETIC_CONFIRMATION_MATRIX,
    budgetProvider: () => ({ graphStepsUsed: 0, modelCallsUsed: 0, toolCallsUsed: 0 }),
    capabilityRegistry: registry,
    ...overrides,
  });
}

function action(operationName, extras = {}) {
  return { operationName, operationVersion: '1', target, arguments: { value: 'synthetic' }, ...extras };
}

function pocAction(operationName, argumentsValue = {}) {
  return { operationName, operationVersion: '1.0.0', arguments: argumentsValue };
}

function invokeWriteOnlyWhenAllowed(proposal, turnContext, effects) {
  const decision = evaluatePocAction(proposal, turnContext);
  if (decision.outcome === 'ALLOW'
    && ['create_task', 'create_subtask', 'create_routine_series'].includes(proposal.operationName)) {
    effects.invoke(proposal.operationName);
  }
  return decision;
}

test('unknown, disabled, malformed, and out-of-scope proposals cannot invoke handlers', async () => {
  const evaluator = createEvaluator();
  const effects = createSideEffectSpy();
  const proposals = [
    { operationName: 'synthetic.unknown-tool', operationVersion: '1', target, arguments: { value: 'x' } },
    { operationName: 'synthetic.disabled', operationVersion: '1', target, arguments: { value: 'x' } },
    { operationName: 'synthetic.read', operationVersion: '1', target, arguments: { value: 'x', extra: true } },
    { operationName: 'synthetic.read', operationVersion: '1', target: { id: 'outside' }, arguments: { value: 'x' } },
  ];

  for (const proposal of proposals) {
    const decision = await evaluator.evaluate(proposal);
    if (decision.outcome === 'ALLOW') effects.invoke(proposal.operationName);
    assert.equal(decision.outcome, 'DENY');
  }

  assert.equal(effects.total, 0);
});

test('expired or caller-claimed confirmations, missing policy, and unavailable preconditions deny before handlers', async () => {
  const effects = createSideEffectSpy();
  const writeRegistry = new Map(registry);
  writeRegistry.set('synthetic.write@1', {
    ...registry.get('synthetic.write@1'), handler: effects.handler('synthetic.write@1'),
  });
  const readRegistry = new Map(registry);
  readRegistry.set('synthetic.read@1', {
    ...registry.get('synthetic.read@1'), handler: effects.handler('synthetic.read@1'),
  });

  const expired = await createEvaluator({ capabilityRegistry: writeRegistry }).execute(action('synthetic.write', {
    confirmationRef: 'synthetic-expired-grant', confirmationState: 'confirmed', expiresAt: 1,
  }));
  assert.equal(expired.decision.outcome, 'REQUIRE_CONFIRMATION');

  const missingMatrix = Object.freeze({ ...SYNTHETIC_CONFIRMATION_MATRIX, entries: Object.freeze({}) });
  const missingPolicyResult = await createEvaluator({ capabilityRegistry: readRegistry, matrixProvider: () => missingMatrix })
    .execute(action('synthetic.read'));
  assert.equal(missingPolicyResult.decision.reasonCategory, 'POLICY_DENIED');

  const unavailableResult = await createEvaluator({ capabilityRegistry: readRegistry, matrixProvider: () => null })
    .execute(action('synthetic.read'));
  assert.equal(unavailableResult.decision.reasonCategory, 'POLICY_UNAVAILABLE');

  const preconditionMatrix = Object.freeze({
    ...SYNTHETIC_CONFIRMATION_MATRIX,
    entries: Object.freeze({
      ...SYNTHETIC_CONFIRMATION_MATRIX.entries,
      'synthetic.unavailable-precondition@1': Object.freeze({ outcome: 'ALLOW', confirmationRequired: false }),
    }),
  });
  const preconditionResult = await createEvaluator({ matrixProvider: () => preconditionMatrix })
    .execute(action('synthetic.unavailable-precondition'));
  assert.equal(preconditionResult.decision.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(effects.total, 0);
});

test('missing, ambiguous, malformed, unsupported, and multi-record proposals invoke zero POC write handlers', () => {
  const effects = createSideEffectSpy();
  const context = createPocTurnContext({ sourceKind: 'user', directUserIntent: true });
  const proposals = [
    pocAction('create_task', { name: 'Prepare a plan' }),
    pocAction('create_task', { name: 'Prepare a plan', parentId: ['12', '13'] }),
    pocAction('create_routine_series', {
      name: 'Morning review',
      weekdaysISO: [1, 1],
      startDate: '2026-11-02',
      endDate: '2026-12-31',
      startTime: '08:00',
      endTime: '07:00',
    }),
    ...[
      'delete_task',
      'rename_task',
      'set_subtask_status',
      'set_daily_subtask_schedule',
      'set_weekly_allocation',
      'update_routine_series',
      'delete_routine_series',
      'create_tasks_batch',
      'executeSql',
    ].map(name => pocAction(name, {})),
    pocAction('create_task', {
      name: 'Prepare a plan',
      parentId: '12',
      records: [{ name: 'First' }, { name: 'Second' }],
    }),
  ];

  for (const proposal of proposals) {
    const decision = invokeWriteOnlyWhenAllowed(proposal, context, effects);
    assert.notEqual(decision.outcome, 'ALLOW', proposal.operationName);
  }

  assert.equal(effects.total, 0);
});

test('a direct valid create invokes one handler once and a second proposal cannot invoke another', () => {
  const effects = createSideEffectSpy();
  const context = createPocTurnContext({ sourceKind: 'user', directUserIntent: true });
  const first = invokeWriteOnlyWhenAllowed(
    pocAction('create_task', { name: 'Prepare a plan', parentId: '12' }),
    context,
    effects,
  );
  const second = invokeWriteOnlyWhenAllowed(
    pocAction('create_subtask', { name: 'Gather the notes', parentId: '42' }),
    context,
    effects,
  );

  assert.equal(first.outcome, 'ALLOW');
  assert.equal(second.outcome, 'DENY');
  assert.equal(effects.total, 1);
  assert.equal(effects.count('create_task'), 1);
  assert.equal(effects.count('create_subtask'), 0);

  const forged = invokeWriteOnlyWhenAllowed({
    ...pocAction('create_task', { name: 'Injected', parentId: '12' }),
    sourceKind: 'user',
    directUserIntent: true,
  }, null, effects);
  assert.equal(forged.outcome, 'DENY');
  assert.equal(effects.total, 1);
});
