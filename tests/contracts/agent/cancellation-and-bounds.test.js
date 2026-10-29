import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelAdapter } from '../../../server/agent/model/adapter.js';
import { buildAgentTurnGraph } from '../../../server/agent/runtime/build-graph.js';
import { BoundedOperationError, runBoundedCall } from '../../../server/agent/runtime/cancellation.js';
import {
  RUNTIME_LIMITS,
  assertOutputTokenLimit,
  assertRequestBodyWithinLimit,
  assertResponseBodyWithinLimit,
  parseRuntimeLimits,
} from '../../../server/agent/runtime/limits.js';
import {
  AgentTurnRequestSchema,
  createInitialGraphState,
  SPEC004_READ_TOOL_NAMES,
} from '../../../server/agent/runtime/state.js';
import { createAgentTurnRunner } from '../../../server/agent/runtime/turn.js';

function syntheticCapabilityPolicy(_context, proposal) {
  return {
    accessDecision: 'allow',
    disclosureDecision: 'allow',
    mayInvokeProvider: true,
    mayInvokeSupabase: false,
    mayInvokeTools: true,
    allowedToolNames: proposal ? [proposal.toolName] : SPEC004_READ_TOOL_NAMES,
  };
}

function toolProposal(id = 'synthetic-call-1') {
  return {
    id,
    name: 'getItemById',
    arguments: '{"itemId":"42"}',
  };
}

function successfulToolExecutor(calls = []) {
  return {
    async execute({ proposal }) {
      calls.push(proposal.toolName);
      return {
        status: 'executed',
        result: { resultState: 'found', item: { id: '42', title: 'Synthetic item' } },
      };
    },
  };
}

function buildGraph({ modelAdapter, toolExecutor = successfulToolExecutor(), initialState } = {}) {
  const graph = buildAgentTurnGraph({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: syntheticCapabilityPolicy,
    toolRegistry: new Map([['getItemById', { version: '1.0.0' }]]),
  });
  const state = initialState ?? createInitialGraphState({ message: 'Synthetic bounded turn.' });
  return { graph, state };
}

function turnRunner({ modelAdapter, toolExecutor = successfulToolExecutor() } = {}) {
  return createAgentTurnRunner({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: syntheticCapabilityPolicy,
    toolRegistry: new Map([['getItemById', { version: '1.0.0' }]]),
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushGraphContinuations() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('fixed graph, model, tool, request, response, retry, and deadline budgets are immutable', () => {
  assert.deepEqual(RUNTIME_LIMITS, {
    maxGraphSteps: 12,
    maxModelCalls: 3,
    maxToolCalls: 4,
    maxRetries: 1,
    modelTimeoutMs: 15_000,
    toolTimeoutMs: 5_000,
    deadlineMs: 45_000,
    maxRequestBytes: 8_192,
    maxResponseBytes: 16_384,
    maxOutputTokens: 2_048,
  });
  assert.equal(parseRuntimeLimits(), RUNTIME_LIMITS);
  assert.throws(() => parseRuntimeLimits({ maxModelCalls: 99 }), /cannot be overridden/);
  assert.throws(() => parseRuntimeLimits({ maxOutputTokens: 20_000 }), /cannot be overridden/);
  assert.deepEqual(parseRuntimeLimits({}), RUNTIME_LIMITS);
  assert.equal(AgentTurnRequestSchema.safeParse({
    message: 'Synthetic request.',
    maxOutputTokens: 20_000,
  }).success, false);
});

test('request and response byte limits accept exactly the fixed boundary and reject one byte over', () => {
  const requestAtLimit = 'x'.repeat(RUNTIME_LIMITS.maxRequestBytes);
  const requestOverLimit = `${requestAtLimit}x`;
  const responseAtLimit = 'y'.repeat(RUNTIME_LIMITS.maxResponseBytes);
  const responseOverLimit = `${responseAtLimit}y`;

  assert.equal(assertRequestBodyWithinLimit(requestAtLimit), RUNTIME_LIMITS.maxRequestBytes);
  assert.throws(() => assertRequestBodyWithinLimit(requestOverLimit), { code: 'RUNTIME_LIMIT_EXCEEDED' });
  assert.equal(assertResponseBodyWithinLimit(responseAtLimit), RUNTIME_LIMITS.maxResponseBytes);
  assert.throws(() => assertResponseBodyWithinLimit(responseOverLimit), { code: 'RUNTIME_LIMIT_EXCEEDED' });
  assert.equal(assertRequestBodyWithinLimit('é'.repeat(RUNTIME_LIMITS.maxRequestBytes / 2)), 8_192);
});

test('output token cap is fixed at 2,048 and cannot be expanded by a caller', async () => {
  assert.equal(assertOutputTokenLimit(2_048), 2_048);
  assert.throws(() => assertOutputTokenLimit(2_049), { code: 'RUNTIME_LIMIT_EXCEEDED' });

  let invocationOptions;
  const adapter = createModelAdapter({
    async invoke(options) {
      invocationOptions = options;
      return { content: 'Synthetic answer.', toolCalls: [], finishReason: 'stop' };
    },
  });
  const result = await adapter.complete({
    messages: [{ role: 'user', content: 'synthetic' }],
    tools: [],
    maxOutputTokens: 20_000,
    timeoutMs: 1,
  });

  assert.equal(result.content, 'Synthetic answer.');
  assert.equal(invocationOptions.maxOutputTokens, RUNTIME_LIMITS.maxOutputTokens);
  assert.equal(invocationOptions.timeoutMs, RUNTIME_LIMITS.modelTimeoutMs);
});

test('compiled StateGraph enforces the 12-step and 3-model-call budgets', async () => {
  let modelCalls = 0;
  const modelAdapter = {
    async complete() {
      modelCalls += 1;
      return { content: 'Synthetic answer.', toolCalls: [], finishReason: 'stop' };
    },
  };

  const exhaustedModelState = createInitialGraphState({ message: 'Synthetic model budget.' });
  exhaustedModelState.modelCallCount = RUNTIME_LIMITS.maxModelCalls;
  const modelGraph = buildGraph({ modelAdapter, initialState: exhaustedModelState }).graph;
  const modelResult = await modelGraph.invoke(exhaustedModelState);
  assert.equal(modelResult.modelCallCount, RUNTIME_LIMITS.maxModelCalls);
  assert.equal(modelResult.terminalOutcome, 'timed-out');
  assert.equal(modelCalls, 0);

  const exhaustedStepState = createInitialGraphState({ message: 'Synthetic graph step budget.' });
  exhaustedStepState.graphStepCount = RUNTIME_LIMITS.maxGraphSteps - 1;
  const stepGraph = buildGraph({ modelAdapter, initialState: exhaustedStepState }).graph;
  const stepResult = await stepGraph.invoke(exhaustedStepState);
  assert.equal(stepResult.graphStepCount, RUNTIME_LIMITS.maxGraphSteps);
  assert.equal(stepResult.terminalOutcome, 'timed-out');
  assert.equal(modelCalls, 0);
});

test('compiled StateGraph executes at most four tool proposals per turn', async () => {
  const toolCalls = [];
  let modelCallIndex = 0;
  const modelAdapter = {
    async complete() {
      modelCallIndex += 1;
      if (modelCallIndex > 1) {
        return { content: 'Synthetic result after four reads.', toolCalls: [], finishReason: 'stop' };
      }
      return {
        content: null,
        toolCalls: Array.from({ length: RUNTIME_LIMITS.maxToolCalls }, (_, index) => ({
          ...toolProposal(`synthetic-call-${index + 1}`),
        })),
        finishReason: 'tool_calls',
      };
    },
  };
  const { graph, state } = buildGraph({ modelAdapter, toolExecutor: successfulToolExecutor(toolCalls) });
  const result = await graph.invoke(state);

  assert.equal(result.toolCallCount, RUNTIME_LIMITS.maxToolCalls);
  assert.equal(toolCalls.length, RUNTIME_LIMITS.maxToolCalls);
  assert.equal(modelCallIndex, 2);
  assert.equal(result.terminalOutcome, 'completed');
  assert.ok(result.graphStepCount <= RUNTIME_LIMITS.maxGraphSteps);

  const tooManyModelProposals = {
    ...state,
    toolCallCount: 1,
    trustedContext: { ...state.trustedContext },
  };
  const overBudgetAdapter = {
    async complete() {
      return {
        content: null,
        toolCalls: Array.from({ length: RUNTIME_LIMITS.maxToolCalls }, (_, index) => ({
          ...toolProposal(`synthetic-over-budget-${index + 1}`),
        })),
        finishReason: 'tool_calls',
      };
    },
  };
  const rejectedToolCalls = [];
  const overBudgetGraph = buildGraph({
    modelAdapter: overBudgetAdapter,
    toolExecutor: successfulToolExecutor(rejectedToolCalls),
    initialState: tooManyModelProposals,
  }).graph;
  const overBudgetResult = await overBudgetGraph.invoke(tooManyModelProposals);
  assert.equal(overBudgetResult.terminalOutcome, 'timed-out');
  assert.equal(rejectedToolCalls.length, 0);
});

test('request cancellation reaches an in-flight model call and stops the graph', async () => {
  const modelStarted = deferred();
  let modelCallCount = 0;
  let modelSignalAborted = false;
  const modelAdapter = {
    async complete({ signal }) {
      modelCallCount += 1;
      modelStarted.resolve();
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          modelSignalAborted = true;
          resolve({ content: null, toolCalls: [], finishReason: 'stop' });
        }, { once: true });
      });
    },
  };
  const controller = new AbortController();
  const run = turnRunner({ modelAdapter });
  const turn = run({ request: { message: 'Synthetic cancellable turn.' }, signal: controller.signal });
  await modelStarted.promise;
  controller.abort();
  const result = await turn;

  assert.equal(modelCallCount, 1);
  assert.equal(modelSignalAborted, true);
  assert.equal(result.terminalOutcome, 'cancelled');
});

test('a server deadline reason remains timed-out when the inner graph clock still has time', async () => {
  const controller = new AbortController();
  const deadlineAt = Date.now() + RUNTIME_LIMITS.deadlineMs;
  const call = runBoundedCall({
    kind: 'model',
    deadlineAt,
    signal: controller.signal,
    operation: (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', resolve, { once: true });
    }),
  });
  controller.abort(new BoundedOperationError('timeout'));
  await assert.rejects(call, (error) => error.category === 'timeout');

  const preAbortedDeadline = new AbortController();
  preAbortedDeadline.abort(new BoundedOperationError('timeout'));
  let modelCalls = 0;
  const result = await turnRunner({
    modelAdapter: { async complete() { modelCalls += 1; return { content: 'unexpected', toolCalls: [], finishReason: 'stop' }; } },
  })({
    request: { message: 'Synthetic deadline.' },
    signal: preAbortedDeadline.signal,
  });

  assert.equal(result.terminalOutcome, 'timed-out');
  assert.equal(modelCalls, 0);
});

test('the total deadline is bounded at 45 seconds and aborts pending capability work', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const policyStarted = deferred();
  let modelCalls = 0;
  const run = createAgentTurnRunner({
    modelAdapter: {
      async complete() {
        modelCalls += 1;
        return { content: 'Unexpected', toolCalls: [], finishReason: 'stop' };
      },
    },
    toolExecutor: successfulToolExecutor(),
    capabilityPolicy() {
      policyStarted.resolve();
      return new Promise(() => {});
    },
  });

  const turn = run({ request: { message: 'Synthetic deadline turn.' } });
  await policyStarted.promise;
  t.mock.timers.tick(RUNTIME_LIMITS.deadlineMs);
  await flushGraphContinuations();
  const result = await turn;

  assert.equal(modelCalls, 0);
  assert.equal(result.terminalOutcome, 'timed-out');
  assert.equal(Date.now(), RUNTIME_LIMITS.deadlineMs);
});

test('fixed model and tool per-call timeouts abort their signals', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });

  const modelStarted = deferred();
  let modelSignalAborted = false;
  const modelRun = turnRunner({
    modelAdapter: {
      async complete({ signal }) {
        modelStarted.resolve();
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            modelSignalAborted = true;
            resolve({ content: null, toolCalls: [], finishReason: 'stop' });
          }, { once: true });
        });
      },
    },
  });
  const modelTurn = modelRun({ request: { message: 'Synthetic model timeout.' } });
  await modelStarted.promise;
  t.mock.timers.tick(RUNTIME_LIMITS.modelTimeoutMs);
  await flushGraphContinuations();
  const modelResult = await modelTurn;

  assert.equal(modelSignalAborted, true);
  assert.equal(modelResult.terminalOutcome, 'timed-out');

  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });

  const toolStarted = deferred();
  let toolSignalAborted = false;
  const toolExecutor = {
    async execute({ signal }) {
      toolStarted.resolve();
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          toolSignalAborted = true;
          resolve({ status: 'denied', reason: 'timed_out' });
        }, { once: true });
      });
    },
  };
  const toolRun = turnRunner({
    modelAdapter: {
      async complete() {
        return {
          content: null,
          toolCalls: [toolProposal()],
          finishReason: 'tool_calls',
        };
      },
    },
    toolExecutor,
  });
  const toolTurn = toolRun({ request: { message: 'Synthetic tool timeout.' } });
  await toolStarted.promise;
  t.mock.timers.tick(RUNTIME_LIMITS.toolTimeoutMs);
  await flushGraphContinuations();
  const toolResult = await toolTurn;

  assert.equal(toolSignalAborted, true);
  assert.equal(toolResult.terminalOutcome, 'timed-out');
});
