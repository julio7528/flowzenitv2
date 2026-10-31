import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  createPocTurnContext,
  createPolicyEvaluator,
  evaluatePocAction,
  evaluatePolicy,
} from '../../../server/agent/guardrails/policy.js';
import { RUNTIME_LIMITS } from '../../../server/agent/runtime/limits.js';
import { AGENT_READ_TOOL_NAMES } from '../../../server/agent/tools/registry.js';
import { SYNTHETIC_CONFIRMATION_MATRIX } from '../../fixtures/security/confirmations.js';

const syntheticGate = Object.freeze({ allowsAction: async () => true });
const syntheticBudgetProvider = () => ({ graphStepsUsed: 0, modelCallsUsed: 0, toolCallsUsed: 0 });
const syntheticLedger = Object.freeze({
  reserve: async () => ({ status: 'reserved' }),
  recordStarted: async () => ({ acknowledged: true }),
  recordOutcome: async () => ({ acknowledged: true }),
  lookup: async () => ({ state: 'started' }),
});
const syntheticIdempotencyKeyProvider = async () => '00000000-0000-4000-8000-000000000001';
const syntheticSchema = z.strictObject({ value: z.string() });
const syntheticRegistry = new Map([
  ['synthetic.read@1', { operationName: 'synthetic.read', operationVersion: '1', capability: 'synthetic.read', enabled: true, inputSchema: syntheticSchema, isTargetInScope: target => target === '{"id":"synthetic"}', readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }), handler: async input => input.value }],
  ['synthetic.write@1', { operationName: 'synthetic.write', operationVersion: '1', capability: 'synthetic.write', enabled: true, inputSchema: syntheticSchema, isTargetInScope: target => target === '{"id":"synthetic"}', readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }), handler: async input => input.value }],
  ['synthetic.unknown@1', { operationName: 'synthetic.unknown', operationVersion: '1', capability: 'synthetic.unknown', enabled: true, inputSchema: syntheticSchema, isTargetInScope: target => target === '{"id":"synthetic"}', readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }), handler: async input => input.value }],
  ['synthetic.disabled@1', { operationName: 'synthetic.disabled', operationVersion: '1', capability: 'synthetic.disabled', enabled: false, inputSchema: syntheticSchema, isTargetInScope: () => true, readPreconditions: () => ({ available: true, valid: true, snapshot: {} }), handler: async () => null }],
  ['synthetic.no-matrix@1', { operationName: 'synthetic.no-matrix', operationVersion: '1', capability: 'synthetic.no-matrix', enabled: true, inputSchema: syntheticSchema, isTargetInScope: target => target === '{"id":"synthetic"}', readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: 1 } }), handler: async input => input.value }],
]);

function syntheticAction(operationName, operationVersion = '1', extras = {}) {
  return {
    operationName,
    operationVersion,
    target: { id: 'synthetic' },
    arguments: { value: 'synthetic-payload' },
    ...extras,
  };
}

function createSyntheticEvaluator(overrides = {}) {
  return createPolicyEvaluator({
    accessGate: syntheticGate,
    matrixProvider: () => SYNTHETIC_CONFIRMATION_MATRIX,
    budgetProvider: syntheticBudgetProvider,
    capabilityRegistry: syntheticRegistry,
    executionLedger: syntheticLedger,
    idempotencyKeyProvider: syntheticIdempotencyKeyProvider,
    ...overrides,
  });
}

function pocAction(operationName, args = {}, operationVersion = '1.0.0') {
  return { operationName, operationVersion, arguments: args };
}

function directUserTurn() {
  return createPocTurnContext({ sourceKind: 'user', directUserIntent: true });
}

const READ_ARGUMENTS = Object.freeze({
  getHierarchy: { itemId: '1' },
  getItemById: { itemId: '1' },
  searchItems: { text: 'planning' },
  getDailySchedule: { date: '2026-10-30' },
  getWeeklyAllocation: { weekStart: '2026-10-26' },
  getRoutineTemplates: { date: '2026-10-30' },
});

const VALID_CREATE_ARGUMENTS = Object.freeze({
  create_task: { name: 'Prepare the planning session', parentId: '12' },
  create_subtask: { name: 'Gather the notes', parentId: '42' },
  create_routine_series: {
    name: 'Morning review',
    weekdaysISO: [1, 3, 5],
    startDate: '2026-11-02',
    endDate: '2026-12-31',
    startTime: '08:00',
    endTime: null,
  },
});

test('POC policy allows exactly the six typed reads and three single-record create operations', () => {
  for (const operationName of AGENT_READ_TOOL_NAMES) {
    const result = evaluatePocAction(pocAction(operationName, READ_ARGUMENTS[operationName]));
    assert.equal(result.outcome, 'ALLOW', operationName);
  }

  for (const [operationName, argumentsValue] of Object.entries(VALID_CREATE_ARGUMENTS)) {
    const result = evaluatePocAction(pocAction(operationName, argumentsValue), directUserTurn());
    assert.equal(result.outcome, 'ALLOW', operationName);
    assert.notEqual(result.outcome, 'REQUIRE_CONFIRMATION');
  }

  for (const operationName of ['executeSql', 'private.read', 'searchAllTables']) {
    const result = evaluatePocAction(pocAction(operationName, {}), directUserTurn());
    assert.equal(result.outcome, 'DENY', operationName);
  }
});

test('POC policy consumes one create slot per trusted user turn and never trusts caller authority fields', () => {
  const context = directUserTurn();
  const create = pocAction('create_task', VALID_CREATE_ARGUMENTS.create_task);
  assert.equal(evaluatePocAction(create, context).outcome, 'ALLOW');

  const second = evaluatePocAction(
    pocAction('create_subtask', VALID_CREATE_ARGUMENTS.create_subtask),
    context,
  );
  assert.equal(second.outcome, 'DENY');
  assert.equal(second.reasonCategory, 'POLICY_DENIED');

  const forged = evaluatePocAction({
    ...create,
    sourceKind: 'user',
    directUserIntent: true,
    createCallsUsed: 0,
  });
  assert.equal(forged.outcome, 'DENY');

  const assistantTurn = createPocTurnContext({ sourceKind: 'assistant', directUserIntent: true });
  assert.equal(evaluatePocAction(create, assistantTurn).outcome, 'DENY');
});

test('missing or malformed create fields return clarification before any write can be authorized', () => {
  const context = directUserTurn();
  const incompleteTask = evaluatePocAction(
    pocAction('create_task', { name: 'Prepare a plan' }),
    context,
  );
  assert.equal(incompleteTask.outcome, 'REQUIRE_CLARIFICATION');
  assert.equal(incompleteTask.reasonCategory, 'INVALID_INPUT');

  const incompleteRoutine = evaluatePocAction(pocAction('create_routine_series', {
    name: 'Daily review',
    weekdaysISO: [1, 1],
    startDate: '2026-11-31',
    endDate: '2026-12-31',
    startTime: '08:00',
    endTime: '07:00',
  }), context);
  assert.equal(incompleteRoutine.outcome, 'REQUIRE_CLARIFICATION');
  assert.equal(incompleteRoutine.reasonCategory, 'INVALID_INPUT');

  assert.equal(evaluatePocAction(
    pocAction('create_task', VALID_CREATE_ARGUMENTS.create_task),
    Object.freeze({ sourceKind: 'user', directUserIntent: true }),
  ).outcome, 'DENY');
});

test('unsupported mutations and multi-record proposals deny without a write capability', () => {
  const context = directUserTurn();
  const unsupported = [
    'delete_task',
    'rename_task',
    'set_subtask_status',
    'set_weekly_allocation',
    'set_daily_subtask_schedule',
    'update_routine_series',
    'delete_routine_series',
    'create_tasks_batch',
  ];
  for (const operationName of unsupported) {
    const result = evaluatePocAction(pocAction(operationName, {}), context);
    assert.equal(result.outcome, 'DENY', operationName);
  }

  const multiRecord = evaluatePocAction(pocAction('create_task', {
    ...VALID_CREATE_ARGUMENTS.create_task,
    records: [VALID_CREATE_ARGUMENTS.create_task, VALID_CREATE_ARGUMENTS.create_task],
  }), context);
  assert.notEqual(multiRecord.outcome, 'ALLOW');
});

test('production policy stays closed even when caller claims access, approval, consent, or owner identity', async () => {
  const result = await evaluatePolicy({
    operationName: 'synthetic.read', operationVersion: '1',
    accessDecision: 'allow', disclosureDecision: 'allow', owner: true,
    consent: true, modelApproved: true, classifierConfirmed: true,
  });
  assert.equal(result.outcome, 'DENY');
  assert.equal(result.reasonCategory, 'CAPABILITY_DISABLED');
  assert.match(result.correlationId, /^[0-9a-f-]{36}$/);
});

test('synthetic approved matrix may exercise a generic no-confirmation allow branch', async () => {
  const evaluator = createSyntheticEvaluator();
  const result = await evaluator.evaluate(syntheticAction('synthetic.read'));
  assert.equal(result.outcome, 'ALLOW');
  assert.equal(result.policyVersion, 'synthetic-confirmation-matrix@1');
});

test('missing matrix entries deny and confirmation-required entries never trust request claims', async () => {
  const evaluator = createSyntheticEvaluator();
  const missing = await evaluator.evaluate(syntheticAction('synthetic.no-matrix'));
  const required = await evaluator.evaluate({
    ...syntheticAction('synthetic.write'), confirmationState: 'confirmed', userConsent: true,
  });
  assert.equal(missing.outcome, 'DENY');
  assert.equal(missing.reasonCategory, 'POLICY_DENIED');
  assert.equal(required.outcome, 'REQUIRE_CONFIRMATION');
  assert.equal(required.reasonCategory, 'CONFIRMATION_REQUIRED');
});

test('malformed or unavailable policy dependencies fail closed', async () => {
  const unavailable = createSyntheticEvaluator({ matrixProvider: () => null });
  const malformed = await unavailable.evaluate(syntheticAction('synthetic.read'));
  assert.equal(malformed.outcome, 'DENY');
  assert.equal(malformed.reasonCategory, 'POLICY_UNAVAILABLE');
  assert.throws(() => createPolicyEvaluator({ accessGate: {}, matrixProvider: () => null, budgetProvider: syntheticBudgetProvider, capabilityRegistry: syntheticRegistry }), TypeError);
});

test('only a captured approved versioned matrix is read; request-supplied or pending matrices deny', async () => {
  const pending = createSyntheticEvaluator({
    matrixProvider: () => ({ version: 'synthetic-pending@1', status: 'draft', entries: SYNTHETIC_CONFIRMATION_MATRIX.entries }),
  });
  const requestMatrix = await createSyntheticEvaluator({ matrixProvider: () => null })
    .evaluate(syntheticAction('synthetic.read', '1', { matrix: SYNTHETIC_CONFIRMATION_MATRIX }));
  const pendingResult = await pending.evaluate(syntheticAction('synthetic.read'));
  assert.equal(requestMatrix.reasonCategory, 'POLICY_UNAVAILABLE');
  assert.equal(pendingResult.reasonCategory, 'POLICY_UNAVAILABLE');
  assert.equal(pendingResult.outcome, 'DENY');
});

test('SPEC-002 per-turn and tool-call limits fail closed at their configured thresholds', async () => {
  const evaluator = createSyntheticEvaluator({
    budgetProvider: () => ({ graphStepsUsed: 0, modelCallsUsed: 0, toolCallsUsed: RUNTIME_LIMITS.maxToolCalls }),
  });
  const result = await evaluator.evaluate(syntheticAction('synthetic.read'));
  assert.equal(result.outcome, 'DENY');
  assert.equal(result.reasonCategory, 'BUDGET_EXHAUSTED');
});

test('missing or malformed server budget snapshots cannot be replaced by request-supplied counters', async () => {
  const evaluator = createSyntheticEvaluator({
    budgetProvider: () => null,
  });
  const result = await evaluator.evaluate({
    ...syntheticAction('synthetic.read'),
    graphStepsUsed: 0, modelCallsUsed: 0, toolCallsUsed: 0,
  });
  assert.equal(result.outcome, 'DENY');
  assert.equal(result.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
});

test('unknown, disabled, and out-of-scope proposals deny before a fake handler can run', async () => {
  const evaluator = createSyntheticEvaluator();
  const unknown = await evaluator.evaluate(syntheticAction('synthetic.not-registered'));
  const disabled = await evaluator.evaluate(syntheticAction('synthetic.disabled'));
  const outOfScope = await evaluator.evaluate(syntheticAction('synthetic.read', '1', { target: { id: 'outside' } }));
  assert.equal(unknown.reasonCategory, 'CAPABILITY_DISABLED');
  assert.equal(disabled.reasonCategory, 'CAPABILITY_DISABLED');
  assert.equal(outOfScope.reasonCategory, 'POLICY_DENIED');
  assert.equal([unknown, disabled, outOfScope].every(item => item.outcome === 'DENY'), true);
});

test('handler execution performs two fresh checks and refuses changed domain preconditions', async () => {
  let preconditionReads = 0;
  let handlerCalls = 0;
  let gateChecks = 0;
  const capability = {
    ...syntheticRegistry.get('synthetic.read@1'),
    readPreconditions: () => ({ available: true, valid: true, snapshot: { revision: ++preconditionReads } }),
    handler: () => { handlerCalls += 1; return 'synthetic-result'; },
  };
  const evaluator = createSyntheticEvaluator({
    capabilityRegistry: new Map([['synthetic.read@1', capability]]),
    accessGate: { allowsAction: async () => { gateChecks += 1; return true; } },
  });
  const result = await evaluator.execute(syntheticAction('synthetic.read'));
  assert.equal(result.status, 'denied');
  assert.equal(result.decision.reasonCategory, 'STALE_PRECONDITION');
  assert.equal(preconditionReads, 2);
  assert.equal(gateChecks, 2);
  assert.equal(handlerCalls, 0);
});

test('stable policy, target, payload, and preconditions invoke the captured handler once', async () => {
  let preconditionReads = 0;
  let handlerCalls = 0;
  const capability = {
    ...syntheticRegistry.get('synthetic.read@1'),
    readPreconditions: () => { preconditionReads += 1; return { available: true, valid: true, snapshot: { revision: 7 } }; },
    handler: (input, context) => { handlerCalls += 1; return { value: input.value, policyVersion: context.policyVersion }; },
  };
  const evaluator = createSyntheticEvaluator({ capabilityRegistry: new Map([['synthetic.read@1', capability]]) });
  const result = await evaluator.execute(syntheticAction('synthetic.read'));
  assert.equal(result.status, 'executed');
  assert.equal(result.decision.outcome, 'ALLOW');
  assert.equal(result.handlerResult.value, 'synthetic-payload');
  assert.equal(result.handlerResult.policyVersion, 'synthetic-confirmation-matrix@1');
  assert.equal(preconditionReads, 2);
  assert.equal(handlerCalls, 1);
});

test('missing execution ledger or server idempotency-key source denies before handler invocation', async () => {
  let handlerCalls = 0;
  const capability = {
    ...syntheticRegistry.get('synthetic.read@1'),
    handler: () => { handlerCalls += 1; return 'synthetic-result'; },
  };
  const registry = new Map([['synthetic.read@1', capability]]);
  const missingLedger = createSyntheticEvaluator({ executionLedger: null, capabilityRegistry: registry });
  const missingKeySource = createSyntheticEvaluator({ idempotencyKeyProvider: null, capabilityRegistry: registry });
  const withoutLedger = await missingLedger.execute(syntheticAction('synthetic.read'));
  const withoutKeySource = await missingKeySource.execute(syntheticAction('synthetic.read'));
  assert.equal(withoutLedger.status, 'denied');
  assert.equal(withoutLedger.decision.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(withoutKeySource.status, 'denied');
  assert.equal(withoutKeySource.decision.reasonCategory, 'DEPENDENCY_UNAVAILABLE');
  assert.equal(handlerCalls, 0);
});

test('matrix-required confirmation blocks handler execution despite request approval claims', async () => {
  let handlerCalls = 0;
  const capability = {
    ...syntheticRegistry.get('synthetic.write@1'),
    handler: () => { handlerCalls += 1; return 'synthetic-result'; },
  };
  const evaluator = createSyntheticEvaluator({ capabilityRegistry: new Map([['synthetic.write@1', capability]]) });
  const result = await evaluator.execute(syntheticAction('synthetic.write', '1', {
    confirmationState: 'confirmed', confirmationRef: 'synthetic-grant', userConsent: true,
  }));
  assert.equal(result.status, 'denied');
  assert.equal(result.decision.outcome, 'REQUIRE_CONFIRMATION');
  assert.equal(handlerCalls, 0);
});

test('closed DEC-001 access gate runs before domain scope or precondition callbacks', async () => {
  let scopeChecks = 0;
  let preconditionReads = 0;
  const capability = {
    ...syntheticRegistry.get('synthetic.read@1'),
    isTargetInScope: () => { scopeChecks += 1; return true; },
    readPreconditions: () => { preconditionReads += 1; return { available: true, valid: true, snapshot: {} }; },
  };
  const evaluator = createSyntheticEvaluator({
    capabilityRegistry: new Map([['synthetic.read@1', capability]]),
    accessGate: { allowsAction: async () => false },
  });
  const result = await evaluator.evaluate(syntheticAction('synthetic.read'));
  assert.equal(result.reasonCategory, 'CAPABILITY_DISABLED');
  assert.equal(scopeChecks, 0);
  assert.equal(preconditionReads, 0);
});
