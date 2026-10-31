import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActiveChatMessages, chatReducer, createChatState } from '../../../src/lib/chatState.js';

function submit(message = 'O que está pendente?') {
  return chatReducer(createChatState(), { type: 'submit', requestId: 'request-1', message });
}

function response({ outcome = 'completed', text = 'Há três tarefas pendentes.', evidence = [] } = {}) {
  return {
    outcome,
    answer: { text, evidence, missingEvidence: [], uncompletedActions: [] },
  };
}

test('active context contains only the eight most recent user and assistant messages', () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `Mensagem ${index + 1}`,
  }));

  assert.deepEqual(buildActiveChatMessages(messages), messages.slice(-8).map(({ role, text }) => ({
    role,
    content: text,
  })));
  assert.deepEqual(buildActiveChatMessages([
    { role: 'assistant', text: 'Resposta anterior' },
    { role: 'user', text: 'Pergunta atual' },
  ]), [
    { role: 'assistant', content: 'Resposta anterior' },
    { role: 'user', content: 'Pergunta atual' },
  ]);
});

test('chat reducer ignores duplicate submissions while a request is pending', () => {
  const pending = submit();
  const duplicate = chatReducer(pending, {
    type: 'submit',
    requestId: 'request-2',
    message: 'Outra pergunta',
  });

  assert.equal(pending.pending, true);
  assert.equal(pending.messages.length, 1);
  assert.strictEqual(duplicate, pending);
});

test('clarification stays a clarification and is not rendered as a completed action', () => {
  const pending = submit('Crie uma tarefa');
  const resolved = chatReducer(pending, {
    type: 'resolve',
    requestId: 'request-1',
    response: response({ outcome: 'needs-clarification', text: 'Qual é o nome da tarefa?' }),
  });

  assert.equal(resolved.pending, false);
  assert.equal(resolved.messages.at(-1).status, 'needs-clarification');
  assert.equal(resolved.messages.at(-1).text, 'Qual é o nome da tarefa?');
});

test('a create is confirmed only by the server-composed exact confirmation response', () => {
  const pending = submit('Crie a tarefa Revisar o plano');
  const noConfirmation = chatReducer(pending, {
    type: 'resolve',
    requestId: 'request-1',
    response: response({ text: 'A tarefa foi criada.' }),
  });
  assert.equal(noConfirmation.messages.at(-1).status, 'answered');

  const confirmed = chatReducer(pending, {
    type: 'resolve',
    requestId: 'request-1',
    response: response({ text: 'Cadastro confirmado: tarefa (ID 101).' }),
  });
  assert.equal(confirmed.messages.at(-1).status, 'confirmed');
});

test('empty, cancelled, and uncertain results remain distinct user-visible states', () => {
  const empty = chatReducer(submit(), {
    type: 'resolve',
    requestId: 'request-1',
    response: response({ evidence: [{
      queryKind: 'postgres_text_search',
      state: 'complete',
      completeness: 'complete',
      evidence: [],
    }] }),
  });
  assert.equal(empty.messages.at(-1).status, 'empty');

  const uncertain = chatReducer(submit('Crie uma tarefa'), {
    type: 'reject',
    requestId: 'request-1',
    error: { kind: 'uncertain' },
  });
  assert.equal(uncertain.messages.at(-1).status, 'uncertain');
  assert.match(uncertain.messages.at(-1).text, /verifique|confira/i);

  const cancelled = chatReducer(submit(), {
    type: 'reject',
    requestId: 'request-1',
    error: { kind: 'cancelled' },
  });
  assert.equal(cancelled.messages.at(-1).status, 'cancelled');
});

test('late responses from an old request do not overwrite the active conversation', () => {
  const pending = submit();
  const late = chatReducer(pending, {
    type: 'resolve',
    requestId: 'old-request',
    response: response(),
  });

  assert.strictEqual(late, pending);
});
