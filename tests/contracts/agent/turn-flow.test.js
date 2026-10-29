import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAgentTurnHandler,
} from '../../../api/agent/turn.js';
import { createDeterministicModelDouble } from '../../fixtures/agent/runtime-doubles.js';
import { createAgentTurnRunner } from '../../../server/agent/runtime/turn.js';
import { AGENT_READ_TOOL_NAMES, createAgentToolRegistry } from '../../../server/agent/tools/registry.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';
import { RUNTIME_LIMITS } from '../../../server/agent/runtime/limits.js';

const TERMINAL_STATUS = Object.freeze({
  completed: 200,
  'needs-clarification': 200,
  denied: 403,
  refused: 200,
  'timed-out': 504,
  cancelled: 200,
  failed: 500,
});

const TOOL_CASES = Object.freeze([
  { name: 'getHierarchy', args: { itemId: '101', pageSize: 20 } },
  { name: 'getItemById', args: { itemId: '102' } },
  { name: 'searchItems', args: { text: 'synthetic lookup' } },
  { name: 'getDailySchedule', args: { date: '2026-10-29' } },
  { name: 'getWeeklyAllocation', args: { weekStart: '2026-10-26' } },
  { name: 'getRoutineTemplates', args: { date: '2026-10-29' } },
]);

function createSyntheticCapabilityPolicy(_context, proposal) {
  return {
    accessDecision: 'allow',
    disclosureDecision: 'allow',
    mayInvokeProvider: true,
    mayInvokeSupabase: false,
    mayInvokeTools: true,
    allowedToolNames: proposal ? [proposal.toolName] : AGENT_READ_TOOL_NAMES,
  };
}

function createSyntheticServices(calls) {
  return Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    async (input) => {
      calls.push({ name, input: structuredClone(input) });
      return {
        operation: name,
        input: structuredClone(input),
        sourceRef: { id: `synthetic-${name}-source` },
        complete: true,
      };
    },
  ]));
}

function createTurnHarness({ modelAdapter, serviceCalls = [], capabilityPolicy = createSyntheticCapabilityPolicy } = {}) {
  const tools = createAgentToolRegistry(createSyntheticServices(serviceCalls));
  const toolExecutor = createToolExecutor({
    registry: tools.registry,
    capabilityPolicy,
    clock: Date,
  });
  const runTurn = createAgentTurnRunner({
    modelAdapter,
    toolExecutor,
    capabilityPolicy,
    modelTools: tools.modelTools,
    toolRegistry: tools.registry,
  });

  return { runTurn, tools };
}

function responseContextReference(context) {
  return {
    requestId: context.requestId,
    turnId: context.turnId,
    correlationId: context.correlationId,
    graphVersion: context.graphVersion,
  };
}

function request(body, { method = 'POST', contentType = 'application/json', signal } = {}) {
  const headers = new Headers();
  if (contentType !== null) headers.set('content-type', contentType);
  return new Request('http://localhost/api/agent/turn', {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    signal,
  });
}

function modelResponsesForTool(name, args) {
  return [
    {
      content: null,
      toolCalls: [{ id: `synthetic-call-${name}`, name, arguments: JSON.stringify(args) }],
      finishReason: 'tool_calls',
    },
    { content: `Synthetic ${name} result`, toolCalls: [], finishReason: 'stop' },
  ];
}

test('real graph and HTTP route execute each of the six synthetic SPEC-004 contracts', async () => {
  for (const toolCase of TOOL_CASES) {
    const serviceCalls = [];
    const model = createDeterministicModelDouble(modelResponsesForTool(toolCase.name, toolCase.args));
    const { runTurn } = createTurnHarness({ modelAdapter: model, serviceCalls });
    const handler = createAgentTurnHandler({
      runTurn,
      capabilityPolicy: createSyntheticCapabilityPolicy,
    });
    const response = await handler(request(JSON.stringify({
      message: `Read synthetic data with ${toolCase.name}.`,
      conversationId: 'synthetic-conversation',
    })));
    const body = await response.json();

    assert.equal(response.status, 200, toolCase.name);
    assert.equal(body.outcome, 'completed', toolCase.name);
    assert.equal(model.calls.length, 2, toolCase.name);
    assert.deepEqual(serviceCalls, [{ name: toolCase.name, input: toolCase.args }]);
    assert.ok(body.answer.evidence.some((item) => item.operation === toolCase.name));
  }
});

test('closed route default-denies before runtime, model, or synthetic service calls', async () => {
  const serviceCalls = [];
  const model = createDeterministicModelDouble([
    { content: 'Must not run', toolCalls: [], finishReason: 'stop' },
  ]);
  const { runTurn: actualRunner } = createTurnHarness({ modelAdapter: model, serviceCalls });
  let runtimeCalls = 0;
  const handler = createAgentTurnHandler({
    runTurn: async (input) => {
      runtimeCalls += 1;
      return actualRunner(input);
    },
  });

  const response = await handler(request(JSON.stringify({ message: 'synthetic request' })));
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, 'CAPABILITY_DISABLED');
  assert.equal(runtimeCalls, 0);
  assert.equal(model.calls.length, 0);
  assert.deepEqual(serviceCalls, []);
});

test('HTTP validation maps method, content type, malformed DTO, and oversized bodies', async () => {
  const handler = createAgentTurnHandler({
    runTurn: async ({ trustedContext }) => ({
      terminalOutcome: 'completed',
      trustedContext: responseContextReference(trustedContext),
      answer: { text: 'synthetic', evidence: [], inference: [], missingEvidence: [], uncompletedActions: [] },
    }),
    capabilityPolicy: createSyntheticCapabilityPolicy,
  });

  const wrongMethod = await handler(request(JSON.stringify({ message: 'synthetic' }), { method: 'GET' }));
  assert.equal(wrongMethod.status, 405);

  const wrongContentType = await handler(request(JSON.stringify({ message: 'synthetic' }), {
    contentType: 'text/plain',
  }));
  assert.equal(wrongContentType.status, 415);

  const invalidDto = await handler(request(JSON.stringify({ message: 'synthetic', ownerId: 'forged' })));
  assert.equal(invalidDto.status, 400);

  const invalidJson = await handler(request('{'));
  assert.equal(invalidJson.status, 400);

  const tooLargeBody = JSON.stringify({ message: 'x'.repeat(RUNTIME_LIMITS.maxRequestBytes) });
  assert.ok(Buffer.byteLength(tooLargeBody, 'utf8') > RUNTIME_LIMITS.maxRequestBytes);
  const tooLarge = await handler(request(tooLargeBody));
  assert.equal(tooLarge.status, 413);
});

test('valid terminal outcomes map to the approved HTTP status and DTO shape', async () => {
  const handler = createAgentTurnHandler({
    runTurn: async ({ trustedContext }) => ({
      terminalOutcome: 'completed',
      trustedContext: responseContextReference(trustedContext),
      answer: { text: 'synthetic answer', evidence: [], inference: [], missingEvidence: [], uncompletedActions: [] },
    }),
    capabilityPolicy: createSyntheticCapabilityPolicy,
  });
  const completedResponse = await handler(request(JSON.stringify({
    message: 'synthetic question',
    conversationId: 'synthetic-conversation',
  })));
  const completedBody = await completedResponse.json();

  assert.equal(completedResponse.status, 200);
  assert.deepEqual(Object.keys(completedBody).sort(), [
    'answer', 'correlationId', 'conversationId', 'graphVersion', 'outcome', 'turnId',
  ].sort());
  assert.equal(completedBody.outcome, 'completed');
  assert.equal(completedBody.conversationId, 'synthetic-conversation');
  assert.match(completedBody.turnId, /^[0-9a-f-]{36}$/i);
  assert.match(completedBody.correlationId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(Object.keys(completedBody.answer).sort(), [
    'text', 'evidence', 'inference', 'missingEvidence', 'uncompletedActions',
  ].sort());

  for (const [outcome, expectedStatus] of Object.entries(TERMINAL_STATUS)) {
    const terminalHandler = createAgentTurnHandler({
      runTurn: async ({ trustedContext }) => ({
        terminalOutcome: outcome,
        trustedContext: responseContextReference(trustedContext),
        answer: { text: 'synthetic terminal', evidence: [], inference: [], missingEvidence: [], uncompletedActions: [] },
      }),
      capabilityPolicy: createSyntheticCapabilityPolicy,
    });
    const response = await terminalHandler(request(JSON.stringify({ message: 'synthetic' })));
    const body = await response.json();
    assert.equal(response.status, expectedStatus, outcome);
    assert.equal(body.outcome, outcome);
  }
});

test('response over 16 KiB falls back to a bounded failed terminal response', async () => {
  const handler = createAgentTurnHandler({
    runTurn: async ({ trustedContext }) => ({
      terminalOutcome: 'completed',
      trustedContext: responseContextReference(trustedContext),
      answer: { text: 'x'.repeat(8_100), evidence: [], inference: [], missingEvidence: [], uncompletedActions: [] },
    }),
    capabilityPolicy: createSyntheticCapabilityPolicy,
  });
  const response = await handler(request(JSON.stringify({ message: 'synthetic' })));
  const text = await response.text();
  const body = JSON.parse(text);

  assert.equal(response.status, 500);
  assert.ok(Buffer.byteLength(text, 'utf8') <= RUNTIME_LIMITS.maxResponseBytes);
  assert.equal(body.outcome, 'failed');
  assert.notEqual(body.answer.text, 'x'.repeat(8_100));
});

test('request cancellation propagates through the real graph and returns cancelled', async () => {
  const controller = new AbortController();
  let modelStarted;
  const started = new Promise((resolve) => { modelStarted = resolve; });
  const modelAdapter = {
    async complete({ signal }) {
      modelStarted();
      return new Promise((resolve) => {
        if (signal.aborted) {
          resolve({ content: null, toolCalls: [], finishReason: 'unknown', providerErrorCategory: 'cancelled' });
          return;
        }
        signal.addEventListener('abort', () => resolve({
          content: null,
          toolCalls: [],
          finishReason: 'unknown',
          providerErrorCategory: 'cancelled',
        }), { once: true });
      });
    },
  };
  const serviceCalls = [];
  const { runTurn } = createTurnHarness({ modelAdapter, serviceCalls });
  const handler = createAgentTurnHandler({
    runTurn,
    capabilityPolicy: createSyntheticCapabilityPolicy,
  });

  const responsePromise = handler(request(JSON.stringify({ message: 'synthetic cancellation' }), {
    signal: controller.signal,
  }));
  await started;
  controller.abort();
  const response = await responsePromise;
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.outcome, 'cancelled');
  assert.deepEqual(serviceCalls, []);
});
