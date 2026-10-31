import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnCoordinator } from '../../../server/agent/memory/turn-coordinator.js';

const conversationId = '00000000-0000-4000-8000-000000000801';
const turnId = '00000000-0000-4000-8000-000000000802';
const correlationId = '00000000-0000-4000-8000-000000000803';
const ledgerRef = 'ledger-synthetic-read-801';

class SyntheticConversationRepository {
  constructor() {
    this.reservations = new Map();
    this.activeTurnId = null;
    this.appendCalls = 0;
  }

  async getConversationMetadata() {
    return null;
  }

  async getHistory() {
    return { outcome: 'empty', messages: [], nextCursor: null, snapshotMaxMessageSeq: '0' };
  }

  async reserveTurn(request) {
    const key = `${request.conversationId}:${request.idempotencyKey}`;
    const existing = this.reservations.get(key);
    if (existing) {
      if (existing.payloadHash !== request.payloadHash) return { outcome: 'conflict' };
      if (existing.status === 'completed') {
        return { outcome: 'replayed', messages: existing.messages };
      }
      return { outcome: 'conflict' };
    }
    if (this.activeTurnId !== null) return { outcome: 'conflict' };

    this.reservations.set(key, {
      conversationId: request.conversationId,
      turnId: request.turnId,
      payloadHash: request.payloadHash,
      status: 'reserved',
      messages: null,
    });
    this.activeTurnId = request.turnId;
    return { outcome: 'reserved' };
  }

  async appendTurn(request) {
    const reservation = [...this.reservations.values()].find((item) => (
      item.conversationId === request.conversationId && item.turnId === request.turnId
    ));
    if (!reservation || reservation.status !== 'reserved' || this.activeTurnId !== request.turnId) {
      return { outcome: 'conflict' };
    }
    reservation.status = 'completed';
    reservation.messages = request.messages.map((message) => Object.freeze({ ...message }));
    this.activeTurnId = null;
    this.appendCalls += 1;
    return { outcome: 'appended', messages: reservation.messages };
  }
}

function createHarness({ ledgerStatus = 'not_started' } = {}) {
  const repository = new SyntheticConversationRepository();
  let lookups = 0;
  const ledger = {
    async reserve() { return { status: 'reserved' }; },
    async recordStarted() { return { acknowledged: true }; },
    async recordOutcome() { return { acknowledged: true }; },
    async lookup(reference) {
      assert.equal(reference, ledgerRef);
      lookups += 1;
      return ledgerStatus === 'completed'
        ? { status: 'completed', safeOutcomeReference: 'synthetic-outcome-801' }
        : { status: ledgerStatus };
    },
  };
  const accessGate = { run: (operation) => operation() };
  const coordinator = createTurnCoordinator({
    conversationRepository: repository,
    executionLedger: ledger,
    accessGate,
  });
  return { coordinator, repository, get lookups() { return lookups; } };
}

function request(message, idempotencyKey = 'synthetic-idempotency-801') {
  return { conversationId, turnId, correlationId, idempotencyKey, message };
}

function successfulTurn(message = 'Synthetic deterministic response.') {
  return async () => ({
    messages: [{ role: 'assistant', content: message }],
  });
}

test('simultaneous identical turns execute and append once, then replay the canonical result', async () => {
  const harness = createHarness();
  const { coordinator, repository } = harness;
  let executions = 0;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  let releaseExecution;
  const executionBarrier = new Promise((resolve) => { releaseExecution = resolve; });
  const executor = async () => {
    executions += 1;
    markStarted();
    await executionBarrier;
    return { messages: [{ role: 'assistant', content: 'Synthetic one-time result.' }] };
  };

  const first = coordinator.run(request('Synthetic duplicate input.'), executor);
  await started;
  const duplicate = coordinator.run(request('Synthetic duplicate input.'), successfulTurn('Should not execute.'));
  releaseExecution();
  const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);

  assert.equal(firstResult.outcome, 'COMPLETED');
  assert.equal(duplicateResult.outcome, 'REPLAYED');
  assert.equal(executions, 1);
  assert.equal(repository.appendCalls, 1);
  assert.equal(repository.reservations.size, 1);
  assert.deepEqual(duplicateResult.messages.map(({ role, content }) => ({ role, content })), [
    { role: 'user', content: 'Synthetic duplicate input.' },
    { role: 'assistant', content: 'Synthetic one-time result.' },
  ]);
  assert.equal(harness.lookups, 0);
});

test('same idempotency key with divergent payload conflicts without another execution or append', async () => {
  const { coordinator, repository } = createHarness();
  let executions = 0;
  const executor = async () => {
    executions += 1;
    return { messages: [{ role: 'assistant', content: 'Synthetic first result.' }] };
  };

  const original = await coordinator.run(request('Synthetic original payload.'), executor);
  const divergent = await coordinator.run(request('Synthetic different payload.'), executor);

  assert.equal(original.outcome, 'COMPLETED');
  assert.equal(divergent.outcome, 'CONFLICT');
  assert.equal(executions, 1);
  assert.equal(repository.appendCalls, 1);
  assert.equal(repository.reservations.size, 1);
});

test('an uncertain ledger state prevents executor and canonical append side effects', async () => {
  const harness = createHarness({ ledgerStatus: 'uncertain' });
  const { coordinator, repository } = harness;
  let executions = 0;
  const result = await coordinator.run(
    request('Synthetic ledger-protected input.'),
    async () => {
      executions += 1;
      return { messages: [{ role: 'assistant', content: 'Must not be reached.' }] };
    },
    { ledgerRefs: [ledgerRef] },
  );

  assert.equal(result.outcome, 'LEDGER_UNRESOLVED');
  assert.equal(executions, 0);
  assert.equal(repository.appendCalls, 0);
  assert.equal(repository.reservations.size, 1);
  assert.equal(harness.lookups, 1);
});

test('ledger references cannot be supplied inside the untrusted request body', async () => {
  const { coordinator, repository } = createHarness();
  let executions = 0;
  const result = await coordinator.run({
    ...request('Synthetic input.'),
    ledgerRefs: [ledgerRef],
  }, async () => {
    executions += 1;
    return { messages: [{ role: 'assistant', content: 'Must not be reached.' }] };
  });

  assert.equal(result.outcome, 'INVALID_REQUEST');
  assert.equal(executions, 0);
  assert.equal(repository.reservations.size, 0);
  assert.equal(repository.appendCalls, 0);
});
