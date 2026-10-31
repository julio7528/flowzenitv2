import assert from 'node:assert/strict';
import test from 'node:test';
import { createPocTurnContext } from '../../../server/agent/guardrails/policy.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';
import { AGENT_READ_TOOL_NAMES, createAgentToolRegistry } from '../../../server/agent/tools/registry.js';
import { createWriteCapabilityRegistry } from '../../../server/agent/tools/write-capabilities.js';
import { createSupabaseWriteRepository } from '../../../server/domain/write/supabase-repository.js';
import { SYNTHETIC_WRITE_IDS } from '../../fixtures/domain-write/commands.js';

function createHarness({ operation = 'create_task', parentId = SYNTHETIC_WRITE_IDS.demand, parentTipo = 1 } = {}) {
  const state = { requests: [], inserts: [] };
  const insertedId = '900000000000000004';
  const client = {
    from(table) {
      const request = { table, method: 'select', projection: null, id: null, values: null };
      state.requests.push(request);
      const query = {
        select(projection) { request.projection = projection; return this; },
        eq(column, value) { assert.equal(column, 'id'); request.id = value; return this; },
        limit(value) { request.limit = value; return this; },
        insert(values) { request.method = 'insert'; request.values = values; state.inserts.push(request); return this; },
        then(resolve, reject) {
          if (request.method === 'insert') {
            return Promise.resolve({ data: [{ id: insertedId }], error: null }).then(resolve, reject);
          }
          const row = request.id === parentId
            ? {
              id: parentId, demanda: 'Synthetic parent', tipo: parentTipo, raizid: null,
              status: 'Backlog', data_exec: null, hora_inicio: null, hora_fim: null,
            }
            : request.id === insertedId
              ? {
                id: insertedId, demanda: 'Synthetic create', tipo: operation === 'create_task' ? 2 : 3,
                raizid: parentId, status: 'Backlog', data_exec: null, hora_inicio: null, hora_fim: null,
              }
              : null;
          return Promise.resolve({ data: row ? [row] : [], error: null }).then(resolve, reject);
        },
      };
      assert.equal(table, 'demandas');
      return query;
    },
  };
  const writeRepository = createSupabaseWriteRepository(client);
  const writeCapabilities = createWriteCapabilityRegistry({
    accessGate: { allowsWrite: async () => true },
    writeRepository,
  });
  const readHandlers = Object.fromEntries(AGENT_READ_TOOL_NAMES.map(name => [name, async () => null]));
  const toolSet = createAgentToolRegistry(readHandlers, { writeCapabilities });
  const executor = createToolExecutor({
    registry: toolSet.registry,
    capabilityPolicy: (_context, proposal) => ({
      accessDecision: 'allow',
      disclosureDecision: 'allow',
      allowedToolNames: [proposal?.toolName ?? 'create_task'],
    }),
  });
  const context = Object.freeze({
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    turnId: '123e4567-e89b-42d3-a456-426614174001',
    correlationId: '123e4567-e89b-42d3-a456-426614174002',
    graphVersion: 'agent-turn-v1',
    accessDecision: 'allow',
    disclosureDecision: 'allow',
  });

  return {
    state,
    executor,
    context,
    actionContext: createPocTurnContext({ sourceKind: 'user', directUserIntent: true }),
    proposal: (name = operation, args = { name: 'Synthetic create', parentId }) => ({
      providerCallId: 'synthetic-write-call',
      toolName: name,
      toolVersion: '1.0.0',
      arguments: args,
      policyDecision: 'not-evaluated',
    }),
    async execute(proposal) {
      return executor.execute({
        proposal,
        context,
        actionContext: this.actionContext,
        budget: { toolCallsUsed: 0, deadlineAt: Date.now() + 5_000 },
        signal: new AbortController().signal,
      });
    },
  };
}

test('model supplied SQL, table, column, tipo, parent, or authorization fields are rejected before Supabase access', async () => {
  for (const field of ['sql', 'table', 'column', 'tipo', 'raizid', 'authorization', 'policy']) {
    const harness = createHarness();
    const result = await harness.execute(harness.proposal('create_task', {
      name: 'Synthetic create',
      parentId: SYNTHETIC_WRITE_IDS.demand,
      [field]: 'untrusted',
    }));

    assert.deepEqual(result, { status: 'denied', reason: 'invalid_proposal' }, field);
    assert.equal(harness.state.requests.length, 0, `${field} must not reach Supabase`);
    assert.equal(harness.state.inserts.length, 0, `${field} must not reach an insert`);
  }
});

test('unsupported mutation names never reach the Supabase repository', async () => {
  for (const operation of ['rename_task', 'delete', 'executeSql']) {
    const harness = createHarness();
    const result = await harness.execute(harness.proposal(operation, {
      name: 'Synthetic create', parentId: SYNTHETIC_WRITE_IDS.demand,
    }));

    assert.equal(result.status, 'denied', operation);
    assert.equal(harness.state.requests.length, 0, operation);
    assert.equal(harness.state.inserts.length, 0, operation);
  }
});

test('wrong parent types for task and subtask are rejected before insert', async () => {
  const cases = [
    { operation: 'create_task', parentId: SYNTHETIC_WRITE_IDS.demand, parentTipo: 2 },
    { operation: 'create_subtask', parentId: SYNTHETIC_WRITE_IDS.task, parentTipo: 1 },
  ];

  for (const scenario of cases) {
    const harness = createHarness(scenario);
    const result = await harness.execute(harness.proposal());

    assert.equal(result.status, 'executed', scenario.operation);
    assert.equal(result.result.outcome, 'VALIDATION_ERROR', scenario.operation);
    assert.equal(result.result.reasonCategory, 'INVALID_PARENT', scenario.operation);
    assert.equal(harness.state.requests.length, 1, 'only parent lookup is permitted');
    assert.equal(harness.state.inserts.length, 0, scenario.operation);
  }
});
