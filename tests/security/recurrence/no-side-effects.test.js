import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_READ_TOOL_NAMES, createAgentToolRegistry } from '../../../server/agent/tools/registry.js';
import { createRecurrenceCapabilities } from '../../../server/agent/tools/recurrence-capabilities.js';
import { createWriteCapabilityRegistry } from '../../../server/agent/tools/write-capabilities.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';
import { createPocTurnContext, productionPocActionPolicy } from '../../../server/agent/guardrails/policy.js';
import { classifyPocCreateIntent } from '../../../server/agent/guardrails/intent.js';
import { GRAPH_VERSION } from '../../../server/agent/runtime/state.js';

const VALID_ROUTINE_ARGS = Object.freeze({
  name: 'Study planning',
  weekdaysISO: [1, 5],
  startDate: '2026-10-30',
  endDate: '2026-11-06',
  startTime: '09:00',
});

function createHarness() {
  const calls = { routine: 0, task: 0, subtask: 0 };
  const readTools = Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [name, async () => ({
    items: [],
    metadata: { resultState: 'empty' },
  })]));
  const writeCapabilities = createWriteCapabilityRegistry({
    accessGate: { allowsWrite: async () => true },
    writeRepository: {
      async createTask() { calls.task += 1; return { outcome: 'COMMITTED' }; },
      async createSubtask() { calls.subtask += 1; return { outcome: 'COMMITTED' }; },
    },
  });
  const recurrenceCapabilities = createRecurrenceCapabilities({
    readTools,
    recurrenceRepository: {
      async createRoutineSeries() { calls.routine += 1; return { outcome: 'COMMITTED' }; },
    },
  });
  const toolSet = createAgentToolRegistry(readTools, { writeCapabilities, recurrenceCapabilities });
  const executor = createToolExecutor({
    registry: toolSet.registry,
    capabilityPolicy: (_context, proposal) => ({
      accessDecision: 'allow',
      disclosureDecision: 'allow',
      allowedToolNames: [proposal.toolName],
    }),
    actionPolicy: productionPocActionPolicy,
  });

  async function propose({ toolName, arguments: args, message }) {
    const entry = toolSet.registry.get(toolName);
    const proposal = {
      providerCallId: `synthetic-${toolName}`,
      toolName,
      toolVersion: entry?.version ?? '1.0.0',
      arguments: args,
      policyDecision: 'not-evaluated',
    };
    const context = {
      requestId: '10000000-0000-4000-8000-000000000001',
      turnId: '10000000-0000-4000-8000-000000000002',
      correlationId: '10000000-0000-4000-8000-000000000003',
      graphVersion: GRAPH_VERSION,
      accessDecision: 'allow',
      disclosureDecision: 'allow',
    };
    return executor.execute({
      proposal,
      context,
      actionContext: createPocTurnContext({
        sourceKind: 'user',
        ...classifyPocCreateIntent(message),
      }),
      budget: { toolCallsUsed: 0, deadlineAt: Date.now() + 10_000 },
    });
  }

  return { calls, propose, registry: toolSet.registry };
}

test('ambiguous weekdays, next week, and missing date/time never call the routine repository', async () => {
  const { calls, propose } = createHarness();
  const cases = [
    {
      message: 'Crie uma rotina de estudo às segundas e sextas da próxima semana às 09:00.',
      arguments: VALID_ROUTINE_ARGS,
    },
    {
      message: 'Crie uma rotina de estudo nas segundas e sextas às 09:00.',
      arguments: VALID_ROUTINE_ARGS,
    },
    {
      message: 'Crie uma rotina de estudo nas segundas e sextas, de 30/10/2026 a 06/11/2026.',
      arguments: VALID_ROUTINE_ARGS,
    },
    {
      message: 'Crie uma rotina de estudo nas segundas e sextas, de 30/10/2026 a 06/11/2026, às 09:00.',
      arguments: { ...VALID_ROUTINE_ARGS, startDate: undefined, startTime: undefined },
    },
  ];

  for (const item of cases) {
    const result = await propose({
      toolName: 'create_routine_series',
      arguments: item.arguments,
      message: item.message,
    });
    assert.equal(result.status, 'denied');
    assert.ok(['invalid_proposal', 'capability_disabled'].includes(result.reason));
  }
  assert.equal(calls.routine, 0);
});

test('a routine request cannot trigger task, subtask, or occurrence creation', async () => {
  const { calls, propose, registry } = createHarness();
  const message = 'Crie uma rotina de estudo nas segundas e sextas, de 30/10/2026 a 06/11/2026, às 09:00.';

  const taskResult = await propose({
    toolName: 'create_task',
    arguments: { name: 'Unexpected task', parentId: '900000000000000001' },
    message,
  });
  const subtaskResult = await propose({
    toolName: 'create_subtask',
    arguments: { name: 'Unexpected subtask', parentId: '900000000000000002' },
    message,
  });
  const occurrenceResult = await propose({
    toolName: 'create_occurrence',
    arguments: { routineId: '900000000000000021', date: '2026-10-30' },
    message,
  });

  assert.equal(taskResult.status, 'denied');
  assert.equal(subtaskResult.status, 'denied');
  assert.equal(occurrenceResult.status, 'denied');
  assert.equal(registry.has('create_occurrence'), false);
  assert.deepEqual(calls, { routine: 0, task: 0, subtask: 0 });
});

test('routine message classifier grants only a complete current-turn routine request', () => {
  assert.deepEqual(classifyPocCreateIntent(
    'Crie uma rotina de estudo nas segundas e sextas, de 30/10/2026 a 06/11/2026, às 09:00.',
  ), {
    directUserIntent: true,
    directCreateOperations: ['create_routine_series'],
    routineClarificationRequired: false,
  });
  assert.deepEqual(classifyPocCreateIntent('Crie uma rotina nas segundas da próxima semana às 09:00.'), {
    directUserIntent: true,
    directCreateOperations: ['create_routine_series'],
    routineClarificationRequired: true,
  });
  assert.deepEqual(classifyPocCreateIntent('Quais rotinas tenho na próxima semana?'), {
    directUserIntent: false,
    directCreateOperations: [],
    routineClarificationRequired: false,
  });
});
