import { createHash } from 'node:crypto';
import {
  createDeterministicModelDouble,
  createMemoryCheckpointDouble,
} from '../../fixtures/agent/runtime-doubles.js';
import { DETERMINISTIC_RUN_FIXTURES } from '../../fixtures/agent/deterministic-runs.js';
import { buildAgentTurnGraph } from '../../../server/agent/runtime/build-graph.js';
import {
  CHECKPOINT_NOT_FOUND,
  loadCheckpoint,
  runSyntheticEffectWithLedger,
} from '../../../server/agent/persistence/ports.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';
import {
  AGENT_READ_TOOL_NAMES,
  createAgentToolRegistry,
} from '../../../server/agent/tools/registry.js';
import {
  createInitialGraphState,
  GRAPH_VERSION,
  GraphStateSchema,
} from '../../../server/agent/runtime/state.js';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createMemoryClockDouble(initialTime = 1_000) {
  let time = initialTime;
  return Object.freeze({
    now: () => time,
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new TypeError('Clock advancement must be a non-negative duration.');
      }
      time += milliseconds;
      return time;
    },
  });
}

function createMemoryLedgerDouble() {
  const entries = new Map();

  return Object.freeze({
    async reserve(idempotencyKey, proposalHash) {
      const existing = entries.get(idempotencyKey);
      if (existing) {
        if (existing.proposalHash !== proposalHash) {
          throw new Error('Synthetic replay key conflicts with the prior proposal.');
        }
        if (existing.status === 'completed') {
          return {
            status: 'prior-outcome',
            safeOutcomeReference: existing.safeOutcomeReference,
          };
        }
        throw new Error('Synthetic replay is blocked by an uncertain ledger state.');
      }

      entries.set(idempotencyKey, { status: 'reserved', proposalHash });
      return { status: 'reserved' };
    },
    async recordStarted(idempotencyKey) {
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.status !== 'reserved') return false;
      entries.set(idempotencyKey, { ...entry, status: 'started' });
      return { acknowledged: true };
    },
    async recordOutcome(idempotencyKey, safeOutcomeReference) {
      const entry = entries.get(idempotencyKey);
      if (!entry || entry.status !== 'started') return false;
      entries.set(idempotencyKey, {
        ...entry,
        status: 'completed',
        safeOutcomeReference,
      });
      return { acknowledged: true };
    },
    async lookup(idempotencyKey) {
      return clone(entries.get(idempotencyKey) ?? null);
    },
  });
}

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

function makeSyntheticServices(fixture, readCalls) {
  return Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    async (input) => {
      readCalls.push({ name, input: clone(input) });
      if (name === fixture.tool.name) return clone(fixture.tool.result);
      return {
        operation: name,
        sourceRef: { id: `synthetic-source-${name}` },
        complete: true,
      };
    },
  ]));
}

function hashProposal(proposal) {
  const canonicalProposal = JSON.stringify({
    toolName: proposal.toolName,
    toolVersion: proposal.toolVersion,
    arguments: proposal.arguments,
  });
  return createHash('sha256').update(canonicalProposal, 'utf8').digest('hex');
}

function safeNodeEvent(nodeName, update) {
  const trustedContext = update?.trustedContext;
  const pendingProposal = update?.pendingProposal;
  const event = { node: nodeName };

  if (typeof update?.terminalOutcome === 'string') event.outcome = update.terminalOutcome;
  if (typeof update?.graphStepCount === 'number') event.graphSteps = update.graphStepCount;
  if (typeof update?.modelCallCount === 'number') event.modelCalls = update.modelCallCount;
  if (typeof update?.toolCallCount === 'number') event.toolCalls = update.toolCallCount;
  if (typeof update?.retryCount === 'number') event.retries = update.retryCount;
  if (typeof trustedContext?.accessDecision === 'string') {
    event.accessDecision = trustedContext.accessDecision;
  }
  if (typeof trustedContext?.disclosureDecision === 'string') {
    event.disclosureDecision = trustedContext.disclosureDecision;
  }
  if (pendingProposal && typeof pendingProposal.toolName === 'string') {
    event.toolDecision = {
      toolName: pendingProposal.toolName,
      toolVersion: pendingProposal.toolVersion,
      policyDecision: pendingProposal.policyDecision,
    };
  }

  return event;
}

function projectRun({ state, path, events }) {
  return Object.freeze({
    graphVersion: state.trustedContext.graphVersion,
    path: Object.freeze([...path]),
    outcome: state.terminalOutcome,
    counters: Object.freeze({
      graphSteps: state.graphStepCount,
      modelCalls: state.modelCallCount,
      toolCalls: state.toolCallCount,
      retries: state.retryCount,
    }),
    toolDecisions: Object.freeze(events
      .filter((event) => event.toolDecision !== undefined)
      .map((event) => Object.freeze({
        node: event.node,
        ...event.toolDecision,
      }))),
    nodeOutcomes: Object.freeze(events.map((event) => Object.freeze(event))),
  });
}

async function runOneReplay({
  fixture,
  modelResultKeys,
  checkpoint,
  ledger,
  ledgerResults,
  clock,
  checkpointThreadId,
}) {
  const modelResponses = modelResultKeys.map((key) => clone(fixture.modelResults[key]));
  const modelAdapter = createDeterministicModelDouble(modelResponses);
  const readCalls = [];
  const toolCalls = [];
  const { registry, modelTools } = createAgentToolRegistry(makeSyntheticServices(fixture, readCalls));
  const baseExecutor = createToolExecutor({
    registry,
    capabilityPolicy: syntheticCapabilityPolicy,
    clock,
  });

  const toolExecutor = Object.freeze({
    async execute(input) {
      const { proposal } = input;
      const safeOutcomeReference = `synthetic:read:${proposal.toolName}:${proposal.providerCallId}`;
      const execution = await runSyntheticEffectWithLedger({
        ledger,
        idempotencyKey: fixture.correlation.turnId,
        proposalHash: hashProposal(proposal),
        safeOutcomeReference,
        effect: async () => {
          const result = await baseExecutor.execute(input);
          toolCalls.push({
            toolName: proposal.toolName,
            toolVersion: proposal.toolVersion,
          });
          ledgerResults.set(safeOutcomeReference, result);
          return result;
        },
      });

      if (execution.status === 'replayed') {
        const previous = ledgerResults.get(execution.safeOutcomeReference);
        if (previous === undefined) return { status: 'failed', reason: 'dependency_failure' };
        return previous;
      }
      return execution.result;
    },
  });

  const graph = buildAgentTurnGraph({
    modelAdapter,
    toolExecutor,
    capabilityPolicy: syntheticCapabilityPolicy,
    modelTools,
    toolRegistry: registry,
  });
  const initialized = createInitialGraphState(fixture.request);
  const initialState = GraphStateSchema.parse({
    ...initialized,
    trustedContext: {
      ...initialized.trustedContext,
      ...fixture.correlation,
      graphVersion: fixture.graphVersion,
    },
  });

  const priorCheckpoint = await loadCheckpoint(checkpoint, checkpointThreadId);
  if (priorCheckpoint !== CHECKPOINT_NOT_FOUND) {
    if (priorCheckpoint.graphVersion !== GRAPH_VERSION) {
      throw new Error('Deterministic checkpoint graph version mismatch.');
    }
  }

  let state = initialState;
  const path = [];
  const events = [];
  const updates = await graph.stream(initialState, { streamMode: 'updates' });
  for await (const update of updates) {
    for (const [nodeName, nodeUpdate] of Object.entries(update)) {
      if (!graph.agentNodeNames.includes(nodeName)) continue;
      path.push(nodeName);
      events.push(safeNodeEvent(nodeName, nodeUpdate));
      state = { ...state, ...nodeUpdate };
    }
  }

  const finalState = GraphStateSchema.parse(state);
  const projection = projectRun({ state: finalState, path, events });
  await checkpoint.save(checkpointThreadId, GRAPH_VERSION, projection);

  const savedCheckpoint = await loadCheckpoint(checkpoint, checkpointThreadId);
  if (savedCheckpoint === CHECKPOINT_NOT_FOUND
    || savedCheckpoint.graphVersion !== GRAPH_VERSION
    || JSON.stringify(savedCheckpoint.checkpoint) !== JSON.stringify(projection)) {
    throw new Error('Deterministic in-memory checkpoint did not preserve the projection.');
  }

  return Object.freeze({
    projection,
    modelCalls: modelAdapter.calls.length,
    readCalls: Object.freeze(readCalls.map(({ name }) => name)),
    toolCalls: Object.freeze(toolCalls),
    ledgerEntry: await ledger.lookup(fixture.correlation.turnId),
  });
}

/**
 * Run a versioned deterministic fixture repeatedly through the compiled real
 * LangGraph StateGraph. The returned projection excludes answer text and tool
 * result payloads so replay compares paths, outcomes, counters, and decisions.
 * All model, read, checkpoint, clock, and ledger operations are local doubles.
 */
export async function replayDeterministicTurn({
  fixture = DETERMINISTIC_RUN_FIXTURES,
  pathName = 'toolThenAnswer',
  repetitions = 2,
} = {}) {
  if (!fixture || fixture.graphVersion !== GRAPH_VERSION) {
    throw new TypeError('A matching deterministic graph fixture is required.');
  }
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10) {
    throw new RangeError('Replay repetitions must be between one and ten.');
  }

  const pathFixture = fixture.paths?.[pathName];
  if (!pathFixture || !Array.isArray(pathFixture.modelResultKeys)) {
    throw new TypeError('An approved deterministic fixture path is required.');
  }

  const checkpoint = createMemoryCheckpointDouble();
  const ledger = createMemoryLedgerDouble();
  const ledgerResults = new Map();
  const clock = createMemoryClockDouble();
  const checkpointThreadId = `synthetic:${fixture.version}:${pathName}`;
  const runs = [];

  for (let index = 0; index < repetitions; index += 1) {
    runs.push(await runOneReplay({
      fixture,
      modelResultKeys: pathFixture.modelResultKeys,
      checkpoint,
      ledger,
      ledgerResults,
      clock,
      checkpointThreadId,
    }));
  }

  const projections = runs.map(({ projection }) => projection);
  const canonicalProjection = JSON.stringify(projections[0]);
  const stable = projections.every((projection) => JSON.stringify(projection) === canonicalProjection);

  return Object.freeze({
    fixtureVersion: fixture.version,
    pathName,
    stable,
    projection: projections[0],
    projections: Object.freeze(projections),
    runs: Object.freeze(runs),
  });
}
