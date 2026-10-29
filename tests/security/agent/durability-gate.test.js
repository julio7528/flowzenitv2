import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertExecutionLedgerPort,
  LedgerAcknowledgementError,
  runSyntheticEffectWithLedger,
} from '../../../server/agent/persistence/ports.js';
import { createTrustedTurnContext } from '../../../server/agent/runtime/state.js';
import { createToolExecutor } from '../../../server/agent/tools/execute.js';
import {
  AGENT_READ_TOOL_NAMES,
  createAgentToolRegistry,
} from '../../../server/agent/tools/registry.js';

const LEDGER_CALL = Object.freeze({
  idempotencyKey: '2fffb7f2-b7ca-467f-8557-0ef02537b1e9',
  proposalHash: 'a'.repeat(64),
  safeOutcomeReference: 'synthetic:completed:once',
});

function createLedger(overrides = {}) {
  return {
    async reserve() {
      return { status: 'reserved' };
    },
    async recordStarted() {
      return { acknowledged: true };
    },
    async recordOutcome() {
      return { acknowledged: true };
    },
    async lookup() {
      return null;
    },
    ...overrides,
  };
}

function createEffectCounter() {
  const calls = [];
  return {
    calls,
    effect: async () => {
      calls.push('synthetic-effect');
      return Object.freeze({ result: 'synthetic-only' });
    },
  };
}

function runEffect({ ledger, effect }) {
  return runSyntheticEffectWithLedger({
    ledger,
    idempotencyKey: LEDGER_CALL.idempotencyKey,
    proposalHash: LEDGER_CALL.proposalHash,
    effect,
    safeOutcomeReference: LEDGER_CALL.safeOutcomeReference,
  });
}

test('missing ledger and invalid ledger ports fail before a synthetic effect', async () => {
  const counter = createEffectCounter();

  await assert.rejects(runEffect({ ledger: undefined, effect: counter.effect }));
  assert.throws(() => assertExecutionLedgerPort({ reserve() {} }), /missing a required method/);
  await assert.rejects(runEffect({
    ledger: { reserve() {} },
    effect: counter.effect,
  }));

  assert.equal(counter.calls.length, 0);
});

test('missing reservation acknowledgment fails closed before the effect', async () => {
  const counter = createEffectCounter();
  const ledger = createLedger({
    async reserve() {
      return { status: 'unacknowledged' };
    },
  });

  await assert.rejects(runEffect({ ledger, effect: counter.effect }));
  assert.equal(counter.calls.length, 0);
});

test('missing start acknowledgment fails closed before the effect', async () => {
  const counter = createEffectCounter();
  const ledger = createLedger({
    async recordStarted() {
      return false;
    },
  });

  await assert.rejects(runEffect({ ledger, effect: counter.effect }), LedgerAcknowledgementError);
  assert.equal(counter.calls.length, 0);
});

test('uncertain outcome acknowledgment blocks a duplicate synthetic effect on replay', async () => {
  const counter = createEffectCounter();
  let ledgerState = 'new';
  const ledger = createLedger({
    async reserve() {
      if (ledgerState === 'new') {
        ledgerState = 'reserved';
        return { status: 'reserved' };
      }
      // The outcome is durably known to the fake ledger, but its acknowledgment
      // was lost to the caller. Replay returns a safe reference and never reruns.
      if (ledgerState === 'outcome-uncertain') {
        return { status: 'prior-outcome', safeOutcomeReference: LEDGER_CALL.safeOutcomeReference };
      }
      return { status: 'reserved' };
    },
    async recordStarted() {
      return { acknowledged: true };
    },
    async recordOutcome() {
      ledgerState = 'outcome-uncertain';
      return false;
    },
  });

  await assert.rejects(runEffect({ ledger, effect: counter.effect }), LedgerAcknowledgementError);
  assert.equal(counter.calls.length, 1);

  const replay = await runEffect({ ledger, effect: counter.effect });
  assert.deepEqual(replay, {
    status: 'replayed',
    safeOutcomeReference: LEDGER_CALL.safeOutcomeReference,
  });
  assert.equal(counter.calls.length, 1);
});

test('the registry and executor reject mutation proposals and expose only six read tools', async () => {
  const handlerCalls = [];
  const handlers = Object.fromEntries(AGENT_READ_TOOL_NAMES.map((name) => [
    name,
    async () => {
      handlerCalls.push(name);
      return Object.freeze({ resultState: 'empty' });
    },
  ]));
  const { registry, modelTools } = createAgentToolRegistry(handlers);

  assert.equal(registry.size, 6);
  assert.equal(modelTools.length, 6);
  assert.deepEqual([...registry.keys()], [...AGENT_READ_TOOL_NAMES]);
  assert.equal(registry.has('createTask'), false);
  assert.throws(() => registry.set('createTask', {}), /immutable/);

  const toolExecutor = createToolExecutor({
    registry,
    clock: { now: () => 1_000 },
    capabilityPolicy: () => ({
      accessDecision: 'allow',
      disclosureDecision: 'allow',
      allowedToolNames: [...AGENT_READ_TOOL_NAMES],
    }),
  });
  const result = await toolExecutor.execute({
    proposal: {
      providerCallId: 'synthetic-mutation-proposal',
      toolName: 'createTask',
      toolVersion: '1.0.0',
      arguments: { title: 'Synthetic only' },
      policyDecision: 'not-evaluated',
    },
    context: createTrustedTurnContext(),
    budget: { toolCallsUsed: 0, deadlineAt: 5_000 },
  });

  assert.deepEqual(result, { status: 'denied', reason: 'invalid_proposal' });
  assert.equal(handlerCalls.length, 0);
});
