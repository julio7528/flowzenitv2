const MAX_PRIOR_MESSAGES = 8;

const SAFE_FAILURE_TEXT = Object.freeze({
  uncertain: 'Não consegui confirmar se esta solicitação foi processada. Se pediu um cadastro, confira o resultado antes de repetir.',
  cancelled: 'Solicitação cancelada. Nenhum sucesso foi confirmado.',
  'payload-too-large': 'A mensagem ficou grande demais. Envie uma mensagem mais curta.',
  'invalid-request': 'A solicitação não foi aceita. Revise a mensagem e tente novamente.',
  'invalid-response': 'O agente retornou uma resposta inválida. Tente novamente.',
  http: 'O agente não está disponível no momento.',
  failed: 'Não foi possível concluir esta solicitação.',
});

const SAFE_HTTP_MESSAGES = Object.freeze({
  METHOD_NOT_ALLOWED: 'Não foi possível concluir esta solicitação.',
  UNSUPPORTED_MEDIA_TYPE: 'Não foi possível concluir esta solicitação.',
  INVALID_REQUEST: SAFE_FAILURE_TEXT['invalid-request'],
  PAYLOAD_TOO_LARGE: SAFE_FAILURE_TEXT['payload-too-large'],
  CAPABILITY_DISABLED: SAFE_FAILURE_TEXT.http,
  INTERNAL_ERROR: SAFE_FAILURE_TEXT.failed,
});

function isCompleteEmptyResult(evidence) {
  if (!Array.isArray(evidence)) return false;
  return evidence.some(result => {
    if (result === null || typeof result !== 'object' || Array.isArray(result)) return false;
    const searchIsEmpty = result.queryKind === 'postgres_text_search'
      && result.state === 'complete'
      && result.completeness === 'complete'
      && Array.isArray(result.evidence)
      && result.evidence.length === 0;
    const queryIsEmpty = result.metadata?.completeness === 'complete'
      && Array.isArray(result.items)
      && result.items.length === 0;
    return searchIsEmpty || queryIsEmpty;
  });
}

function statusForResponse(response) {
  if (response.outcome === 'needs-clarification') return 'needs-clarification';
  if (response.outcome === 'cancelled') return 'cancelled';
  if (response.outcome === 'denied') return 'denied';
  if (response.outcome === 'refused') return 'refused';
  if (response.outcome === 'timed-out') return 'timed-out';
  if (response.outcome !== 'completed') return 'failed';

  if (response.answer.text.startsWith('Não consegui confirmar se o cadastro foi gravado')) {
    return 'uncertain';
  }
  if (/^Cadastro confirmado: [^\r\n(]+ \(ID [1-9]\d*\)\.$/u.test(response.answer.text)) {
    return 'confirmed';
  }
  if (isCompleteEmptyResult(response.answer.evidence)) return 'empty';
  return 'answered';
}

function assistantMessage(requestId, text, status, evidence = []) {
  return {
    id: `assistant-${requestId}`,
    role: 'assistant',
    text,
    status,
    evidence,
  };
}

function safeFailure(error) {
  if (error?.kind === 'uncertain') {
    return { status: 'uncertain', text: SAFE_FAILURE_TEXT.uncertain };
  }
  if (error?.kind === 'cancelled') {
    return { status: 'cancelled', text: SAFE_FAILURE_TEXT.cancelled };
  }
  if (error?.kind === 'http-error') {
    return {
      status: 'failed',
      text: SAFE_HTTP_MESSAGES[error.code] ?? SAFE_FAILURE_TEXT.failed,
    };
  }
  if (error?.kind === 'payload-too-large') {
    return { status: 'failed', text: SAFE_FAILURE_TEXT['payload-too-large'] };
  }
  if (error?.kind === 'invalid-request') {
    return { status: 'failed', text: SAFE_FAILURE_TEXT['invalid-request'] };
  }
  if (error?.kind === 'invalid-response') {
    return { status: 'failed', text: SAFE_FAILURE_TEXT['invalid-response'] };
  }
  return { status: 'failed', text: SAFE_FAILURE_TEXT.failed };
}

export function createChatState() {
  return Object.freeze({ messages: Object.freeze([]), pending: false, requestId: null });
}

export function buildActiveChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.text === 'string'
      && message.text.trim().length > 0)
    .slice(-MAX_PRIOR_MESSAGES)
    .map(message => ({ role: message.role, content: message.text }));
}

export function chatReducer(state, action) {
  if (!state || !action || typeof action !== 'object') return state;

  if (action.type === 'clear') {
    return state.pending ? state : createChatState();
  }

  if (action.type === 'submit') {
    if (state.pending
      || typeof action.requestId !== 'string'
      || typeof action.message !== 'string'
      || action.message.trim().length === 0) return state;
    const userMessage = {
      id: `user-${action.requestId}`,
      role: 'user',
      text: action.message,
    };
    return Object.freeze({
      messages: Object.freeze([...state.messages, Object.freeze(userMessage)]),
      pending: true,
      requestId: action.requestId,
    });
  }

  if (!state.pending || action.requestId !== state.requestId) return state;

  if (action.type === 'resolve') {
    const response = action.response;
    if (!response || typeof response.outcome !== 'string'
      || !response.answer || typeof response.answer.text !== 'string'
      || !Array.isArray(response.answer.evidence)) {
      const message = assistantMessage(action.requestId, SAFE_FAILURE_TEXT['invalid-response'], 'failed');
      return Object.freeze({
        messages: Object.freeze([...state.messages, Object.freeze(message)]),
        pending: false,
        requestId: null,
      });
    }
    const status = statusForResponse(response);
    const message = assistantMessage(action.requestId, response.answer.text, status, response.answer.evidence);
    return Object.freeze({
      messages: Object.freeze([...state.messages, Object.freeze(message)]),
      pending: false,
      requestId: null,
    });
  }

  if (action.type === 'reject') {
    const failure = safeFailure(action.error);
    const message = assistantMessage(action.requestId, failure.text, failure.status);
    return Object.freeze({
      messages: Object.freeze([...state.messages, Object.freeze(message)]),
      pending: false,
      requestId: null,
    });
  }

  return state;
}
