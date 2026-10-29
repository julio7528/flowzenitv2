import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { productionCapabilityPolicy } from '../../../server/agent/runtime/capabilities.js';
import { createTrustedTurnContext } from '../../../server/agent/runtime/state.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';

const TOOL_VERSION = '1.0.0';

function validProposal(overrides = {}) {
  return {
    providerCallId: 'synthetic-call-1',
    toolName: 'getItemById',
    toolVersion: TOOL_VERSION,
    arguments: { itemId: 'synthetic-item-1' },
    policyDecision: 'not-evaluated',
    ...overrides,
  };
}

function allowSyntheticRead(_context, proposal) {
  return {
    accessDecision: 'allow',
    disclosureDecision: 'allow',
    reason: 'server_authorized',
    allowedToolNames: [proposal.toolName],
  };
}

function createHarness({
  capabilityPolicy = allowSyntheticRead,
  toolCallsUsed = 0,
  maxToolCalls = 4,
  deadlineAt = 2_000,
  now = 1_000,
  registeredTools = ['getItemById'],
} = {}) {
  let handlerCalls = 0;
  const entry = {
    name: 'getItemById',
    version: TOOL_VERSION,
    inputSchema: z.strictObject({ itemId: z.string().min(1) }),
    async handler(input) {
      handlerCalls += 1;
      return { itemId: input.itemId, source: 'synthetic' };
    },
  };
  const registry = new Map(
    registeredTools.includes('getItemById') ? [['getItemById', entry]] : [],
  );
  const executor = createToolExecutor({
    registry,
    capabilityPolicy,
    clock: { now: () => now },
  });

  return {
    executor,
    context: createTrustedTurnContext(),
    budget: { toolCallsUsed, maxToolCalls, deadlineAt },
    getHandlerCalls: () => handlerCalls,
  };
}

async function assertDeniedWithoutHandler(harness, proposal, expectedReason) {
  const result = await harness.executor.execute({
    proposal,
    context: harness.context,
    budget: harness.budget,
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, { status: 'denied', reason: expectedReason });
  assert.equal(harness.getHandlerCalls(), 0);
}

test('valid synthetic read proposal invokes only its registered handler', async () => {
  const harness = createHarness();
  const result = await harness.executor.execute({
    proposal: validProposal(),
    context: harness.context,
    budget: harness.budget,
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, {
    status: 'executed',
    result: { itemId: 'synthetic-item-1', source: 'synthetic' },
  });
  assert.equal(harness.getHandlerCalls(), 1);
});

test('unknown and malformed proposals are rejected before any handler runs', async () => {
  const harness = createHarness();

  await assertDeniedWithoutHandler(
    harness,
    validProposal({ toolName: 'executeSql', arguments: { sql: 'select synthetic' } }),
    'invalid_proposal',
  );
  await assertDeniedWithoutHandler(
    harness,
    validProposal({ arguments: { itemId: ['not-a-string'] } }),
    'invalid_proposal',
  );
  await assertDeniedWithoutHandler(
    harness,
    { toolName: 'getItemById', arguments: { itemId: 'synthetic-item-1' } },
    'invalid_proposal',
  );
});

test('production default-deny policy prevents a valid proposal from reaching a handler', async () => {
  const harness = createHarness({ capabilityPolicy: productionCapabilityPolicy });

  await assertDeniedWithoutHandler(harness, validProposal(), 'capability_disabled');
});

test('capability is re-evaluated immediately before execution', async () => {
  let policyCalls = 0;
  const capabilityPolicy = (_context, proposal) => {
    policyCalls += 1;
    if (policyCalls === 1) return allowSyntheticRead(_context, proposal);
    return {
      accessDecision: 'deny',
      disclosureDecision: 'deny',
      reason: 'dec001_closed',
      allowedToolNames: [],
    };
  };
  const harness = createHarness({ capabilityPolicy });

  await assertDeniedWithoutHandler(harness, validProposal(), 'capability_disabled');
  assert.equal(policyCalls, 2);
});

test('over-budget and unregistered proposals are rejected before handler invocation', async () => {
  const overBudget = createHarness({ toolCallsUsed: 4, maxToolCalls: 4 });
  await assertDeniedWithoutHandler(overBudget, validProposal(), 'budget_exhausted');

  const unregistered = createHarness({
    registeredTools: [],
    capabilityPolicy: (_context, proposal) => ({
      ...allowSyntheticRead(_context, proposal),
      allowedToolNames: ['searchItems'],
    }),
  });
  await assertDeniedWithoutHandler(
    unregistered,
    validProposal({ toolName: 'searchItems', arguments: { query: 'synthetic' } }),
    'unknown_tool',
  );
});
