import { buildAgentTurnGraph } from './build-graph.js';
import { productionCapabilityPolicy } from './capabilities.js';
import { composeAgentResponse } from './response.js';
import {
  AgentTurnRequestSchema,
  GraphStateSchema,
  TrustedTurnContextSchema,
  TrustedTurnContextReferenceSchema,
  createInitialGraphState,
} from './state.js';
import { RUNTIME_LIMITS, assertResponseBodyWithinLimit } from './limits.js';
import { BoundedOperationError } from './cancellation.js';
import { assertServerOnlyRuntime } from './server-only.js';

assertServerOnlyRuntime();

function responseContext(context) {
  const validated = TrustedTurnContextSchema.parse(context);
  return TrustedTurnContextReferenceSchema.parse({
    requestId: validated.requestId,
    turnId: validated.turnId,
    correlationId: validated.correlationId,
    graphVersion: validated.graphVersion,
  });
}

function terminalState(state, outcome) {
  const terminal = outcome === 'cancelled' || outcome === 'timed-out' || outcome === 'failed'
    ? outcome
    : 'failed';
  return GraphStateSchema.parse({
    ...state,
    terminalOutcome: terminal,
    responseClassification: terminal,
  });
}

function outcomeForInvocationFailure(signal, deadlineReached) {
  if (deadlineReached || (
    signal?.reason instanceof BoundedOperationError
    && signal.reason.category === 'timeout'
  )) return 'timed-out';
  if (signal?.aborted) return 'cancelled';
  return 'failed';
}

function assistantText(state, collectedAssistantTexts) {
  if (Array.isArray(collectedAssistantTexts) && collectedAssistantTexts.length > 0) {
    return collectedAssistantTexts
      .filter((content) => typeof content === 'string' && content.trim().length > 0)
      .join('\n')
      .trim();
  }
  return state.messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content)
    .filter((content) => typeof content === 'string' && content.trim().length > 0)
    .join('\n')
    .trim();
}

function uncompletedActions(state) {
  const proposals = state.modelResult?.toolCalls ?? [];
  return proposals
    .slice(state.toolCallCount, RUNTIME_LIMITS.maxToolCalls)
    .map((proposal) => proposal.name)
    .filter((name) => [
      'getHierarchy',
      'getItemById',
      'searchItems',
      'getDailySchedule',
      'getWeeklyAllocation',
      'getRoutineTemplates',
    ].includes(name))
    .map((name) => `The ${name} read was not completed.`);
}

function safeAnswer({ state, toolResults, assistantTexts }) {
  try {
    return {
      answer: composeAgentResponse({
      text: assistantText(state, assistantTexts),
      toolResults,
      missingEvidence: [],
      uncompletedActions: uncompletedActions(state),
      }),
      failed: false,
    };
  } catch {
    return {
      answer: Object.freeze({
        text: '',
        evidence: Object.freeze([]),
        inference: Object.freeze([]),
        missingEvidence: Object.freeze([]),
        uncompletedActions: Object.freeze([]),
      }),
      failed: true,
    };
  }
}

function responseWithinLimit(value) {
  try {
    return assertResponseBodyWithinLimit(JSON.stringify(value)) >= 0;
  } catch {
    return false;
  }
}

/**
 * Create the server-only turn runner used by the HTTP handler and synthetic
 * integration tests. It exposes only a terminal result and composed answer;
 * raw tool results remain transient inside the graph/response composition.
 */
export function createAgentTurnRunner({
  modelAdapter,
  toolExecutor,
  capabilityPolicy = productionCapabilityPolicy,
  modelTools = [],
  toolRegistry,
} = {}) {
  const graph = buildAgentTurnGraph({
    modelAdapter,
    toolExecutor,
    capabilityPolicy,
    modelTools,
    toolRegistry,
  });

  return async function runAgentTurn({ request, trustedContext, signal } = {}) {
    const startedAt = Date.now();
    const deadlineController = new AbortController();
    const deadlineTimer = setTimeout(
      () => deadlineController.abort(new BoundedOperationError('timeout')),
      RUNTIME_LIMITS.deadlineMs,
    );
    let turnSignal = deadlineController.signal;

    if (signal !== undefined) {
      const validSignal = signal !== null
        && typeof signal === 'object'
        && typeof signal.aborted === 'boolean'
        && typeof signal.addEventListener === 'function'
        && typeof signal.removeEventListener === 'function';
      if (!validSignal) {
        clearTimeout(deadlineTimer);
        throw new TypeError('A valid request AbortSignal is required.');
      }
      turnSignal = AbortSignal.any([signal, deadlineController.signal]);
    }

    let initialState;
    try {
      const parsedRequest = AgentTurnRequestSchema.parse(request);
      initialState = createInitialGraphState(parsedRequest);
      if (trustedContext !== undefined) {
        initialState = GraphStateSchema.parse({
          ...initialState,
          trustedContext: TrustedTurnContextSchema.parse(trustedContext),
        });
      }
    } catch {
      clearTimeout(deadlineTimer);
      throw new TypeError('A valid agent turn request and server context are required.');
    }

    let finalState = initialState;
    let collected = { toolResults: [], safeToolReferences: [], assistantTexts: [] };
    try {
      finalState = await graph.invokeWithAgentResults(
        initialState,
        { signal: turnSignal },
        (resultSet) => { collected = resultSet; },
      );
    } catch {
      finalState = terminalState(
        initialState,
        outcomeForInvocationFailure(turnSignal, Date.now() - startedAt >= RUNTIME_LIMITS.deadlineMs),
      );
    } finally {
      clearTimeout(deadlineTimer);
    }

    let terminalOutcome = finalState.terminalOutcome ?? 'failed';
    const composition = safeAnswer({
      state: finalState,
      toolResults: collected.toolResults,
      assistantTexts: collected.assistantTexts,
    });
    let answer = composition.answer;
    if (composition.failed) terminalOutcome = 'failed';
    let result = Object.freeze({
      terminalOutcome,
      trustedContext: responseContext(finalState.trustedContext),
      answer,
    });

    if (!responseWithinLimit(result)) {
      terminalOutcome = 'failed';
      answer = composeAgentResponse({
        text: '',
        toolResults: [],
        missingEvidence: [],
        uncompletedActions: [],
      });
      result = Object.freeze({
        terminalOutcome,
        trustedContext: responseContext(finalState.trustedContext),
        answer,
      });
    }

    return result;
  };
}
