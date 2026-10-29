import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeterministicModelDouble } from '../../fixtures/agent/runtime-doubles.js';
import { createAgentTurnRunner } from '../../../server/agent/runtime/turn.js';
import { AGENT_READ_TOOL_NAMES, createAgentToolRegistry } from '../../../server/agent/tools/registry.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';

function syntheticCapabilityPolicy(_context, proposal) {
  return {
    accessDecision: 'allow',
    disclosureDecision: 'allow',
    mayInvokeProvider: true,
    mayInvokeSupabase: false,
    mayInvokeTools: true,
    allowedToolNames: proposal ? [proposal.toolName] : AGENT_READ_TOOL_NAMES,
  };
}

function createRunner({ modelAdapter, serviceHandlers = {} }) {
  const services = Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    serviceHandlers[name] ?? (async (input) => ({ operation: name, input, complete: true })),
  ]));
  const tools = createAgentToolRegistry(services);
  const toolExecutor = createToolExecutor({
    registry: tools.registry,
    capabilityPolicy: syntheticCapabilityPolicy,
    clock: Date,
  });
  return createAgentTurnRunner({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: syntheticCapabilityPolicy,
    modelTools: tools.modelTools,
    toolRegistry: tools.registry,
  });
}

test('real graph retries one transient provider failure and then stops retrying', async () => {
  const model = createDeterministicModelDouble([
    {
      content: null,
      toolCalls: [],
      finishReason: 'unknown',
      providerErrorCategory: 'transient',
    },
    { content: 'Synthetic answer after retry.', toolCalls: [], finishReason: 'stop' },
  ]);
  const runTurn = createRunner({ modelAdapter: model });

  const result = await runTurn({ request: { message: 'Synthetic retry check.' } });

  assert.equal(result.terminalOutcome, 'completed');
  assert.equal(model.calls.length, 2);
  assert.match(result.answer.text, /Synthetic answer after retry/);
});

test('real graph retries one failed idempotent SPEC-004 read and returns its result', async () => {
  let readAttempts = 0;
  const model = createDeterministicModelDouble([
    {
      content: null,
      toolCalls: [{
        id: 'synthetic-retry-call',
        name: 'getItemById',
        arguments: JSON.stringify({ itemId: '204' }),
      }],
      finishReason: 'tool_calls',
    },
    { content: 'Synthetic read completed.', toolCalls: [], finishReason: 'stop' },
  ]);
  const runTurn = createRunner({
    modelAdapter: model,
    serviceHandlers: {
      getItemById: async (input) => {
        readAttempts += 1;
        if (readAttempts === 1) throw new Error('Synthetic dependency outage.');
        return { operation: 'getItemById', input, sourceRef: { id: 'synthetic-204' }, complete: true };
      },
    },
  });

  const result = await runTurn({ request: { message: 'Read synthetic item 204.' } });

  assert.equal(result.terminalOutcome, 'completed');
  assert.equal(model.calls.length, 2);
  assert.equal(readAttempts, 2);
  assert.ok(result.answer.evidence.some((item) => item.operation === 'getItemById'));
});
