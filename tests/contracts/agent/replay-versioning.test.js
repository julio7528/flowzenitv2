import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeterministicModelDouble } from '../../fixtures/agent/runtime-doubles.js';
import { DETERMINISTIC_RUN_FIXTURES } from '../../fixtures/agent/deterministic-runs.js';
import { replayDeterministicTurn } from '../../helpers/agent/replay.js';
import { createAgentTurnRunner } from '../../../server/agent/runtime/turn.js';
import { buildAgentTurnGraph, AGENT_GRAPH_NODE_NAMES } from '../../../server/agent/runtime/build-graph.js';
import {
  createInitialGraphState,
  GRAPH_VERSION,
  GraphStateSchema,
  SPEC004_READ_TOOL_NAMES,
  TrustedTurnContextSchema,
} from '../../../server/agent/runtime/state.js';
import { AGENT_READ_TOOL_NAMES, createAgentToolRegistry } from '../../../server/agent/tools/registry.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';

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

function createReadHandlers(handlers = {}) {
  return Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    async (input) => handlers[name]?.(input) ?? { operation: name, complete: true },
  ]));
}

function makeGraph({ modelAdapter, toolExecutor = { async execute() { return { status: 'denied' }; } } }) {
  return buildAgentTurnGraph({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: syntheticCapabilityPolicy,
  });
}

test('registered graph version rejects mismatched turn and fixture versions', async () => {
  const initialState = createInitialGraphState({ message: 'Synthetic version check.' });
  assert.throws(() => TrustedTurnContextSchema.parse({
    ...initialState.trustedContext,
    graphVersion: 'agent-turn-v99',
  }));

  await assert.rejects(replayDeterministicTurn({
    fixture: { ...DETERMINISTIC_RUN_FIXTURES, graphVersion: 'agent-turn-v99' },
  }), /matching deterministic graph fixture/);

  assert.equal(GRAPH_VERSION, DETERMINISTIC_RUN_FIXTURES.graphVersion);
});

test('unknown state fields and unknown graph nodes are rejected or absent', async () => {
  const state = createInitialGraphState({ message: 'Synthetic unknown-field check.' });
  assert.equal(GraphStateSchema.safeParse({ ...state, unknownStateField: true }).success, false);

  const graph = makeGraph({
    modelAdapter: { async complete() { return { content: 'Synthetic', toolCalls: [], finishReason: 'stop' }; } },
  });
  const drawable = await graph.getGraphAsync();
  assert.equal(Object.hasOwn(drawable.nodes, 'unknown_node'), false);
  assert.equal(graph.agentNodeNames.includes('unknown_node'), false);
  assert.deepEqual(graph.agentNodeNames, AGENT_GRAPH_NODE_NAMES);
  await assert.rejects(replayDeterministicTurn({ pathName: 'unknownNode' }), /fixture path is required/);
});

test('opaque hierarchy cursor passes through unchanged and tool metadata is preserved', async () => {
  const cursor = 'opaque|cursor::synthetic::not-base64-or-decodable';
  const nextCursor = 'opaque|next-cursor::synthetic';
  let observedInput;
  const hierarchyResult = Object.freeze({
    operation: 'getHierarchy',
    items: Object.freeze([Object.freeze({
      id: '204',
      parentId: '100',
      title: 'Synthetic hierarchy item',
      ancestorIds: Object.freeze(['100']),
    })]),
    sourceRef: Object.freeze({ id: 'synthetic-hierarchy-source-204' }),
    metadata: Object.freeze({
      source: 'relational',
      completeness: 'truncated',
      nextCursor,
      requiresNarrowing: true,
      narrowingReason: 'synthetic ambiguity',
      candidateReferences: Object.freeze([
        Object.freeze({ id: '204', hierarchyPath: Object.freeze(['100', '204']) }),
      ]),
    }),
  });

  const tools = createAgentToolRegistry(createReadHandlers({
    getHierarchy(input) {
      observedInput = structuredClone(input);
      return hierarchyResult;
    },
  }));
  const capabilityPolicy = syntheticCapabilityPolicy;
  const toolExecutor = createToolExecutor({
    registry: tools.registry,
    capabilityPolicy,
    clock: { now: () => 1_000 },
  });
  const modelAdapter = createDeterministicModelDouble([
    {
      content: null,
      toolCalls: [{
        id: 'synthetic-hierarchy-call',
        name: 'getHierarchy',
        arguments: JSON.stringify({ itemId: '100', pageSize: 1, cursor }),
      }],
      finishReason: 'tool_calls',
    },
    DETERMINISTIC_RUN_FIXTURES.modelResults.answer,
  ]);
  const run = createAgentTurnRunner({
    modelAdapter,
    toolExecutor,
    capabilityPolicy,
    modelTools: tools.modelTools,
    toolRegistry: tools.registry,
  });
  const result = await run({ request: { message: 'Synthetic hierarchy cursor check.' } });

  assert.equal(observedInput.cursor, cursor);
  assert.equal(observedInput.itemId, '100');
  assert.equal(result.terminalOutcome, 'needs-clarification');
  assert.deepEqual(result.answer.evidence[0], hierarchyResult);
  assert.equal(result.answer.evidence[0].metadata.nextCursor, nextCursor);
  assert.equal(result.answer.evidence[0].metadata.completeness, 'truncated');
  assert.equal(result.answer.evidence[0].metadata.requiresNarrowing, true);
  assert.deepEqual(result.answer.evidence[0].metadata.candidateReferences[0].hierarchyPath, ['100', '204']);
});

test('unsupported model result shapes fail closed before tool execution', async () => {
  let toolCalls = 0;
  const graph = makeGraph({
    modelAdapter: {
      async complete() {
        return {
          content: { hidden: 'synthetic unsupported shape' },
          toolCalls: [{ id: 'synthetic-call', name: 'getItemById', arguments: '{"itemId":"204"}' }],
          finishReason: 'unsupported-provider-finish-reason',
        };
      },
    },
    toolExecutor: {
      async execute() {
        toolCalls += 1;
        return { status: 'executed', result: { complete: true } };
      },
    },
  });
  const result = await graph.invoke(createInitialGraphState({ message: 'Synthetic malformed provider result.' }));

  assert.equal(result.terminalOutcome, 'failed');
  assert.equal(toolCalls, 0);
});

test('replay is stable by graph path, outcome, counters, and tool decisions rather than prose', async () => {
  const replay = await replayDeterministicTurn({ pathName: 'toolThenAnswer', repetitions: 2 });

  assert.equal(replay.stable, true);
  assert.deepEqual(replay.projections[0], replay.projections[1]);
  assert.deepEqual(replay.projection.path, [
    'validate_request',
    'decide_access',
    'prepare_context',
    'invoke_model',
    'normalize_model_result',
    'validate_proposal',
    'authorize_tool',
    'execute_tool',
    'invoke_model',
    'normalize_model_result',
    'compose_response',
    'finish',
  ]);
  assert.equal(replay.projection.outcome, 'completed');
  assert.deepEqual(replay.projection.counters, {
    graphSteps: 12,
    modelCalls: 2,
    toolCalls: 1,
    retries: 0,
  });
  assert.ok(replay.projection.toolDecisions.some((decision) => (
    decision.toolName === 'getItemById' && decision.policyDecision === 'allow'
  )));

  const projectionJson = JSON.stringify(replay.projection);
  assert.equal(projectionJson.includes(DETERMINISTIC_RUN_FIXTURES.request.message), false);
  assert.equal(projectionJson.includes(DETERMINISTIC_RUN_FIXTURES.modelResults.answer.content), false);
});
