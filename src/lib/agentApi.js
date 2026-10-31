const MAX_REQUEST_BYTES = 8_192;
const MAX_PRIOR_MESSAGES = 8;
const API_PATH = '/api/agent/turn';

const TERMINAL_OUTCOMES = new Set([
  'completed',
  'needs-clarification',
  'denied',
  'refused',
  'timed-out',
  'cancelled',
  'failed',
]);

const SAFE_ERROR_MESSAGES = Object.freeze({
  METHOD_NOT_ALLOWED: 'Não foi possível concluir esta solicitação.',
  UNSUPPORTED_MEDIA_TYPE: 'Não foi possível concluir esta solicitação.',
  INVALID_REQUEST: 'A solicitação não foi aceita. Revise a mensagem e tente novamente.',
  PAYLOAD_TOO_LARGE: 'A mensagem ficou grande demais. Envie uma mensagem mais curta.',
  CAPABILITY_DISABLED: 'O agente não está disponível no momento.',
  INTERNAL_ERROR: 'Não foi possível concluir esta solicitação.',
});

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasOnlyKeys(value, allowed, required) {
  if (!isRecord(value)) return false;
  try {
    const keys = Object.keys(value);
    return keys.every(key => allowed.includes(key))
      && required.every(key => Object.hasOwn(value, key));
  } catch {
    return false;
  }
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

export class AgentApiError extends Error {
  constructor(kind, message, code = null) {
    super(message);
    this.name = 'AgentApiError';
    this.kind = kind;
    this.code = code;
  }
}

function validatePriorMessages(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PRIOR_MESSAGES) {
    throw new AgentApiError('invalid-request', 'O contexto da conversa é inválido.');
  }

  return value.map(message => {
    if (!hasOnlyKeys(message, ['role', 'content'], ['role', 'content'])
      || !['user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string'
      || message.content.trim().length === 0) {
      throw new AgentApiError('invalid-request', 'O contexto da conversa é inválido.');
    }
    return { role: message.role, content: message.content };
  });
}

function makeRequestBody({ message, activeChatMessages }) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new AgentApiError('invalid-request', 'Digite uma mensagem para continuar.');
  }

  const body = {
    message,
    activeChatMessages: validatePriorMessages(activeChatMessages),
  };
  let serialized;
  try {
    serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).byteLength > MAX_REQUEST_BYTES) {
      throw new AgentApiError('payload-too-large', SAFE_ERROR_MESSAGES.PAYLOAD_TOO_LARGE);
    }
  } catch (error) {
    if (error instanceof AgentApiError) throw error;
    throw new AgentApiError('invalid-request', 'A solicitação não pôde ser preparada.');
  }
  return serialized;
}

function validateAnswer(value) {
  const required = ['text', 'evidence', 'missingEvidence', 'uncompletedActions'];
  const allowed = [...required, 'inference'];
  if (!hasOnlyKeys(value, allowed, required)
    || typeof value.text !== 'string'
    || !Array.isArray(value.evidence)
    || !Array.isArray(value.missingEvidence)
    || !Array.isArray(value.uncompletedActions)
    || (Object.hasOwn(value, 'inference') && !Array.isArray(value.inference))) {
    throw new AgentApiError('invalid-response', 'O agente retornou uma resposta inválida.');
  }

  return Object.freeze({
    text: value.text,
    evidence: value.evidence,
    missingEvidence: value.missingEvidence,
    uncompletedActions: value.uncompletedActions,
  });
}

function validateTurnResponse(value) {
  const required = ['turnId', 'conversationId', 'graphVersion', 'outcome', 'correlationId', 'answer'];
  if (!hasOnlyKeys(value, required, required)
    || !isUuid(value.turnId)
    || !(value.conversationId === null || typeof value.conversationId === 'string')
    || value.graphVersion !== 'agent-turn-v1'
    || !TERMINAL_OUTCOMES.has(value.outcome)
    || !isUuid(value.correlationId)) {
    throw new AgentApiError('invalid-response', 'O agente retornou uma resposta inválida.');
  }

  return Object.freeze({
    turnId: value.turnId,
    conversationId: value.conversationId,
    graphVersion: value.graphVersion,
    outcome: value.outcome,
    correlationId: value.correlationId,
    answer: validateAnswer(value.answer),
  });
}

function safeHttpError(value) {
  if (!hasOnlyKeys(value, ['error', 'correlationId'], ['error'])
    || !hasOnlyKeys(value.error, ['code', 'message'], ['code', 'message'])
    || typeof value.error.code !== 'string') {
    return new AgentApiError('http-error', 'Não foi possível concluir esta solicitação.', 'REQUEST_FAILED');
  }

  const code = Object.hasOwn(SAFE_ERROR_MESSAGES, value.error.code)
    ? value.error.code
    : 'REQUEST_FAILED';
  return new AgentApiError(
    'http-error',
    SAFE_ERROR_MESSAGES[code] ?? 'Não foi possível concluir esta solicitação.',
    code,
  );
}

function isAbortError(error) {
  return error !== null && typeof error === 'object' && error.name === 'AbortError';
}

export function createAgentApi({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  async function sendTurn({ message, activeChatMessages, signal } = {}) {
    const body = makeRequestBody({ message, activeChatMessages });
    let response;
    try {
      response = await fetchImpl(API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw new AgentApiError('cancelled', 'Solicitação cancelada. Nenhum sucesso foi confirmado.');
      }
      throw new AgentApiError(
        'uncertain',
        'Não consegui confirmar se esta solicitação foi processada. Confira antes de repeti-la.',
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new AgentApiError(
        response.ok ? 'invalid-response' : 'http-error',
        'Não foi possível concluir esta solicitação.',
        'REQUEST_FAILED',
      );
    }

    if (isRecord(payload) && Object.hasOwn(payload, 'outcome')) {
      return validateTurnResponse(payload);
    }
    if (!response.ok) throw safeHttpError(payload);
    throw new AgentApiError('invalid-response', 'O agente retornou uma resposta inválida.');
  }

  return Object.freeze({ sendTurn });
}

export const CHAT_API_LIMITS = Object.freeze({
  maxRequestBytes: MAX_REQUEST_BYTES,
  maxPriorMessages: MAX_PRIOR_MESSAGES,
});
