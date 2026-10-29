import assert from 'node:assert/strict';
import test from 'node:test';
import { GRAPH_VERSION, TERMINAL_OUTCOMES, createInitialGraphState } from '../../../server/agent/runtime/state.js';
import { buildAgentTurnGraph } from '../../../server/agent/runtime/build-graph.js';
import { createDeterministicModelDouble } from '../../fixtures/agent/runtime-doubles.js';

const SYNTHETIC_TOOL_NAME = 'getItemById';

function answer(text = 'Synthetic answer.') {
  return {
    content: text,
    toolCalls: [],
    finishReason: 'stop',
  };
}

function toolCall({ content = null, argumentsJson = '{"itemId":"42"}' } = {}) {
  return {
    content,
    toolCalls: [{
      id: 'synthetic-call-1',
      name: SYNTHETIC_TOOL_NAME,
      arguments: argumentsJson,
    }],
    finishReason: 'tool_calls',
  };
}

function createSyntheticCapabilityPolicy() {
  // This policy is injected by the test into the graph constructor only. It is
  // never available through a request field, HTTP header, or production route.
  return async () => Object.freeze({
    accessDecision: 'allow',
    disclosureDecision: 'allow',
    mayInvokeProvider: true,
    mayInvokeTools: true,
    allowedToolNames: [SYNTHETIC_TOOL_NAME],
    reason: 'synthetic_test',
  });
}

async function runTurn(responses) {
  const modelAdapter = createDeterministicModelDouble(responses);
  const toolCalls = [];
  const toolExecutor = {
    async execute({ proposal }) {
      toolCalls.push(Object.freeze({
        toolName: proposal.toolName,
        arguments: structuredClone(proposal.arguments),
      }));
      return Object.freeze({
        status: 'executed',
        result: Object.freeze({
          resultState: 'found',
          item: Object.freeze({ id: '42', title: 'Synthetic item' }),
          completeness: 'complete',
        }),
        referenceId: 'synthetic:read:item-42',
      });
    },
  };

  const graph = buildAgentTurnGraph({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: createSyntheticCapabilityPolicy(),
  });

  // Inspecting and invoking the compiled graph exercises LangGraph's actual
  // StateGraph runtime, including its declared nodes and conditional edges.
  assert.equal(typeof graph.invoke, 'function');
  assert.equal(typeof graph.getGraphAsync, 'function');
  const drawable = await graph.getGraphAsync();
  const nodeNames = new Set(Object.keys(drawable.nodes));
  for (const name of ['validate_request', 'decide_access', 'invoke_model', 'finish']) {
    assert.ok(nodeNames.has(name), `compiled LangGraph is missing node ${name}`);
  }

  const result = await graph.invoke(createInitialGraphState({
    message: 'Synthetic request for deterministic graph routing.',
    conversationId: 'synthetic-conversation',
  }));

  assert.ok(TERMINAL_OUTCOMES.includes(result.terminalOutcome));
  assert.equal(result.trustedContext.graphVersion, GRAPH_VERSION);
  assert.ok(result.graphStepCount <= 12);
  return { result, modelAdapter, toolCalls };
}

test('answer-only output reaches response without invoking tools', async () => {
  const { result, modelAdapter, toolCalls } = await runTurn([answer()]);

  assert.equal(result.terminalOutcome, 'completed');
  assert.equal(result.modelCallCount, 1);
  assert.equal(modelAdapter.calls.length, 1);
  assert.equal(toolCalls.length, 0);
});

test('tool-only output executes one synthetic tool and accepts a final model answer', async () => {
  const { result, modelAdapter, toolCalls } = await runTurn([
    toolCall(),
    answer('Synthetic answer based on synthetic evidence.'),
  ]);

  assert.equal(result.terminalOutcome, 'completed');
  assert.equal(result.modelCallCount, 2);
  assert.equal(result.toolCallCount, 1);
  assert.equal(modelAdapter.calls.length, 2);
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(toolCalls[0], {
    toolName: SYNTHETIC_TOOL_NAME,
    arguments: { itemId: '42' },
  });
});

test('refusal output terminates as refused without invoking tools', async () => {
  const { result, toolCalls } = await runTurn([{
    content: 'Synthetic refusal.',
    toolCalls: [],
    finishReason: 'content_filter',
  }]);

  assert.equal(result.terminalOutcome, 'refused');
  assert.equal(toolCalls.length, 0);
});

test('empty output requests clarification and does not invoke tools', async () => {
  const { result, toolCalls } = await runTurn([{
    content: null,
    toolCalls: [],
    finishReason: 'stop',
  }]);

  assert.equal(result.terminalOutcome, 'needs-clarification');
  assert.equal(toolCalls.length, 0);
});

test('mixed content and tool-call output is bounded and executes one proposal', async () => {
  const { result, modelAdapter, toolCalls } = await runTurn([
    toolCall({ content: 'Synthetic pre-tool text.' }),
    answer('Synthetic final answer.'),
  ]);

  assert.equal(result.terminalOutcome, 'completed');
  assert.equal(result.modelCallCount, 2);
  assert.equal(result.toolCallCount, 1);
  assert.equal(modelAdapter.calls.length, 2);
  assert.equal(toolCalls.length, 1);
});

test('malformed normalized model output fails closed before any tool handler', async () => {
  const { result, toolCalls } = await runTurn([{
    content: { unexpected: 'Synthetic malformed content.' },
    toolCalls: [{
      id: 'synthetic-call-malformed',
      name: SYNTHETIC_TOOL_NAME,
      arguments: '{not-json',
    }],
    finishReason: 'tool_calls',
  }]);

  assert.equal(result.terminalOutcome, 'failed');
  assert.equal(toolCalls.length, 0);
});

test('unsupported provider output reaches one failed terminal outcome', async () => {
  const { result, toolCalls } = await runTurn([{
    content: null,
    toolCalls: [],
    finishReason: 'unknown',
    providerErrorCategory: 'unsupported_response',
  }]);

  assert.equal(result.terminalOutcome, 'failed');
  assert.equal(toolCalls.length, 0);
});
