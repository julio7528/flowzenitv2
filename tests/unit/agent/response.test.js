import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentResponseError, composeAgentResponse } from '../../../server/agent/runtime/response.js';

const CORRELATION_ID = '00000000-0000-4000-8000-000000000001';

function writeOutcome(overrides = {}) {
  return {
    outcome: 'COMMITTED',
    operation: 'create_task',
    operationVersion: 1,
    persistentId: '42',
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

test('response reports a persisted create as success only with a confirmed persistent ID', () => {
  const response = composeAgentResponse({
    text: 'The model answer is ignored after the write result.',
    writeOutcome: writeOutcome({ resultingValues: { name: 'Prepare the planning session' } }),
  });

  assert.equal(response.text, 'Cadastro confirmado: tarefa (ID 42).');
  assert.deepEqual(response.inference, []);
});

test('uncertain and dependency outcomes override optimistic model text with a safe non-success result', () => {
  for (const outcome of ['DEPENDENCY_UNAVAILABLE', 'FAILED', 'CONFLICT', 'IDEMPOTENCY_CONFLICT']) {
    const response = composeAgentResponse({
      text: 'A tarefa foi cadastrada com sucesso.',
      writeOutcome: writeOutcome({ outcome, reasonCategory: 'DEPENDENCY_UNAVAILABLE' }),
    });

    assert.equal(response.text, 'Não consegui confirmar se o cadastro foi gravado. Verifique o registro antes de tentar novamente.');
    assert.deepEqual(response.inference, []);
    assert.equal(response.text.includes('cadastrada com sucesso'), false);
  }
});

test('unverified COMMITTED outcomes without a persistent ID cannot produce a success message', () => {
  const missingId = writeOutcome({ operation: 'create_routine_series' });
  delete missingId.persistentId;
  const response = composeAgentResponse({
    text: 'A rotina foi criada.',
    writeOutcome: missingId,
  });

  assert.equal(response.text, 'O cadastro não foi confirmado.');
  assert.equal(response.text.includes('criada'), false);
});

test('raw database errors are rejected and never appear in a public response error', () => {
  const rawDatabaseMessage = 'synthetic-private-database-detail';
  assert.throws(() => composeAgentResponse({
    text: 'Do not expose internal error details.',
    writeOutcome: writeOutcome({
      outcome: 'DEPENDENCY_UNAVAILABLE',
      reasonCategory: 'DEPENDENCY_UNAVAILABLE',
      error: rawDatabaseMessage,
    }),
  }), (error) => {
    assert.ok(error instanceof AgentResponseError);
    assert.equal(error.message.includes(rawDatabaseMessage), false);
    return true;
  });
});
