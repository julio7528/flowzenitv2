import { RUNTIME_LIMITS } from '../../../server/agent/runtime/limits.js';
import {
  GRAPH_VERSION,
  SPEC004_READ_TOOL_NAMES,
  TERMINAL_OUTCOMES,
} from '../../../server/agent/runtime/state.js';

export const DETERMINISTIC_RUN_FIXTURE_VERSION = 1;

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const syntheticItem = {
  id: '204',
  title: 'Synthetic planning item',
  parentId: '100',
  kind: 'task',
};

const syntheticReadResult = {
  operation: 'getItemById',
  item: syntheticItem,
  sourceRef: { id: 'synthetic-source-204' },
  complete: true,
};

const fixture = {
  version: DETERMINISTIC_RUN_FIXTURE_VERSION,
  graphVersion: GRAPH_VERSION,
  correlation: {
    requestId: '00000000-0000-4000-8000-000000000001',
    turnId: '00000000-0000-4000-8000-000000000002',
    correlationId: '00000000-0000-4000-8000-000000000003',
  },
  request: {
    message: 'Synthetic request for deterministic graph replay.',
    conversationId: 'synthetic-conversation-v1',
  },
  tool: {
    name: 'getItemById',
    version: '1.0.0',
    input: { itemId: syntheticItem.id },
    result: syntheticReadResult,
    allowedReadNames: SPEC004_READ_TOOL_NAMES,
  },
  modelResults: {
    answer: {
      content: 'Synthetic answer for replay.',
      toolCalls: [],
      finishReason: 'stop',
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    },
    toolProposal: {
      content: null,
      toolCalls: [{
        id: 'synthetic-call-204',
        name: 'getItemById',
        arguments: '{"itemId":"204"}',
      }],
      finishReason: 'tool_calls',
    },
    refusal: {
      content: 'Synthetic refusal fixture.',
      toolCalls: [],
      finishReason: 'content_filter',
    },
    malformed: {
      content: { unexpected: 'synthetic malformed content' },
      toolCalls: [{
        id: 'synthetic-call-malformed',
        name: 'getItemById',
        arguments: '{malformed-json',
      }],
      finishReason: 'tool_calls',
    },
    transientFailure: {
      content: null,
      toolCalls: [],
      finishReason: 'unknown',
      providerErrorCategory: 'transient',
    },
    unsupported: {
      content: null,
      toolCalls: [],
      finishReason: 'unknown',
      providerErrorCategory: 'unsupported_response',
    },
  },
  paths: {
    answerOnly: {
      modelResultKeys: ['answer'],
      toolResultKeys: [],
      expectedOutcome: 'completed',
    },
    toolThenAnswer: {
      modelResultKeys: ['toolProposal', 'answer'],
      toolResultKeys: ['result'],
      expectedOutcome: 'completed',
    },
    refusal: {
      modelResultKeys: ['refusal'],
      toolResultKeys: [],
      expectedOutcome: 'refused',
    },
    malformed: {
      modelResultKeys: ['malformed'],
      toolResultKeys: [],
      expectedOutcome: 'failed',
    },
    transientRetry: {
      modelResultKeys: ['transientFailure', 'answer'],
      toolResultKeys: [],
      expectedOutcome: 'completed',
    },
    unsupported: {
      modelResultKeys: ['unsupported'],
      toolResultKeys: [],
      expectedOutcome: 'failed',
    },
  },
  budgetExhaustion: {
    limits: RUNTIME_LIMITS,
    atLimit: {
      graphStepCount: RUNTIME_LIMITS.maxGraphSteps,
      modelCallCount: RUNTIME_LIMITS.maxModelCalls,
      toolCallCount: RUNTIME_LIMITS.maxToolCalls,
      retryCount: RUNTIME_LIMITS.maxRetries,
    },
    expectedOutcome: 'timed-out',
  },
  terminalOutcomes: TERMINAL_OUTCOMES,
};

/** Immutable, deterministic fixtures. Every identifier and record is synthetic. */
export const DETERMINISTIC_RUN_FIXTURES = deepFreeze(fixture);
