import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentTurnHandler } from '../../../api/agent/turn.js';
import { createModelAdapter } from '../../../server/agent/model/adapter.js';
import { createAgentTurnRunner } from '../../../server/agent/runtime/turn.js';
import { createAgentToolRegistry, AGENT_READ_TOOL_NAMES } from '../../../server/agent/tools/registry.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';
import { createSafeAgentEvent } from '../../../server/agent/observability/safe-events.js';
import { createSafeErrorResponse, SAFE_ERROR_CODES } from '../../../server/agent/http/errors.js';
import { createDeterministicModelDouble } from '../../fixtures/agent/runtime-doubles.js';

const SENTINELS = Object.freeze({
  prompt: 'SYNTHETIC_PRIVATE_PROMPT_6a87',
  credential: 'SYNTHETIC_SECRET_KEY_3f12',
  reasoning: 'SYNTHETIC_PRIVATE_REASONING_ef40',
  providerBody: 'SYNTHETIC_RAW_PROVIDER_BODY_b265',
  toolInput: 'SYNTHETIC_PRIVATE_TOOL_INPUT_762c',
  toolResult: 'SYNTHETIC_PRIVATE_TOOL_RESULT_a908',
  toolError: 'SYNTHETIC_RAW_TOOL_ERROR_d013',
});

function assertSentinelsAbsent(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const sentinel of Object.values(SENTINELS)) {
    assert.equal(serialized.includes(sentinel), false, `unexpected sentinel: ${sentinel}`);
  }
}

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

function createServices(overrides = {}) {
  return Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    overrides[name] ?? (async () => ({ operation: name, complete: true })),
  ]));
}

function createRunner({ modelAdapter, serviceHandlers = {} }) {
  const tools = createAgentToolRegistry(createServices(serviceHandlers));
  const toolExecutor = createToolExecutor({
    registry: tools.registry,
    capabilityPolicy: createSyntheticCapabilityPolicy,
    clock: Date,
  });
  return createAgentTurnRunner({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: createSyntheticCapabilityPolicy,
    modelTools: tools.modelTools,
    toolRegistry: tools.registry,
  });
}

function makeRequest(message) {
  return new Request('http://localhost/api/agent/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
}

async function captureConsole(operation) {
  const original = Object.fromEntries(['debug', 'info', 'log', 'warn', 'error'].map((key) => [key, console[key]]));
  const entries = [];
  for (const key of Object.keys(original)) {
    console[key] = (...args) => entries.push({ key, args });
  }
  try {
    return { result: await operation(), entries };
  } finally {
    for (const [key, method] of Object.entries(original)) console[key] = method;
  }
}

test('raw provider exceptions and private prompts never appear in terminal HTTP output or console logs', async () => {
  const modelAdapter = createModelAdapter({
    invoke: async () => {
      const error = new Error(SENTINELS.providerBody);
      error.reasoning = SENTINELS.reasoning;
      error.apiKey = SENTINELS.credential;
      error.prompt = SENTINELS.prompt;
      throw error;
    },
  });
  const runTurn = createRunner({ modelAdapter });
  const handler = createAgentTurnHandler({
    runTurn,
    capabilityPolicy: createSyntheticCapabilityPolicy,
  });

  const { result: response, entries } = await captureConsole(() => handler(makeRequest(SENTINELS.prompt)));
  const bodyText = await response.text();

  assert.equal(response.status, 500);
  assert.equal(JSON.parse(bodyText).outcome, 'failed');
  assertSentinelsAbsent(bodyText);
  assert.deepEqual(entries, []);
});

test('raw tool input, result, and handler errors do not leak through failure responses or logs', async () => {
  const modelAdapter = createDeterministicModelDouble([
    {
      content: null,
      toolCalls: [{
        id: 'synthetic-redaction-call',
        name: 'getItemById',
        arguments: JSON.stringify({ itemId: '908' }),
      }],
      finishReason: 'tool_calls',
    },
  ]);
  const runTurn = createRunner({
    modelAdapter,
    serviceHandlers: {
      getItemById: async () => {
        const error = new Error(SENTINELS.toolError);
        error.input = SENTINELS.toolInput;
        error.result = SENTINELS.toolResult;
        throw error;
      },
    },
  });
  const handler = createAgentTurnHandler({
    runTurn,
    capabilityPolicy: createSyntheticCapabilityPolicy,
  });

  const { result: response, entries } = await captureConsole(() => handler(makeRequest(SENTINELS.prompt)));
  const bodyText = await response.text();

  assert.equal(response.status, 500);
  assert.equal(JSON.parse(bodyText).outcome, 'failed');
  assertSentinelsAbsent(bodyText);
  assert.deepEqual(entries, []);
});

test('safe operational events contain only allowlisted bounded metadata and do not log', async () => {
  const original = console.info;
  const logs = [];
  console.info = (...args) => logs.push(args);
  try {
    const event = createSafeAgentEvent({
      correlationId: 'd50b3250-42df-46b9-83bb-97b05797b78e',
      graphVersion: 'agent-turn-v1',
      nodeName: 'execute_tool',
      toolName: 'getItemById',
      toolVersion: '1.0.0',
      outcomeCategory: 'dependency_failure',
      elapsedMs: 120,
      graphSteps: 4,
      modelCalls: 1,
      toolCalls: 1,
      retryCount: 0,
      prompt: SENTINELS.prompt,
      messages: [SENTINELS.prompt],
      reasoning: SENTINELS.reasoning,
      apiKey: SENTINELS.credential,
      toolInput: SENTINELS.toolInput,
      toolResult: SENTINELS.toolResult,
      rawProviderError: SENTINELS.providerBody,
      rawToolError: SENTINELS.toolError,
    });

    assert.deepEqual(Object.keys(event).sort(), [
      'correlationId', 'elapsedMs', 'graphSteps', 'graphVersion', 'modelCalls',
      'nodeName', 'outcomeCategory', 'retryCount', 'toolCalls', 'toolName', 'toolVersion',
    ].sort());
    assert.equal(Object.isFrozen(event), true);
    assertSentinelsAbsent(event);
    assert.deepEqual(logs, []);
  } finally {
    console.info = original;
  }
});

test('public error envelopes use fixed messages and never reflect unknown codes or error payloads', () => {
  const response = createSafeErrorResponse(SENTINELS.providerBody, 'untrusted correlation text');

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, SAFE_ERROR_CODES.INTERNAL_ERROR);
  assert.equal(response.body.error.message, 'Request could not be completed');
  assert.equal(response.body.correlationId, 'unavailable');
  assertSentinelsAbsent(response);
});
