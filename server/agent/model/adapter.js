import {
  ModelAdapterResultSchema,
  SAFE_PROVIDER_ERROR_CATEGORIES,
} from '../runtime/state.js';
import { RUNTIME_LIMITS } from '../runtime/limits.js';

const SAFE_PROVIDER_CATEGORY_SET = new Set(SAFE_PROVIDER_ERROR_CATEGORIES);

function failureResult(providerErrorCategory) {
  return ModelAdapterResultSchema.parse({
    content: null,
    toolCalls: [],
    finishReason: 'unknown',
    providerErrorCategory,
  });
}

function categoryFromException(error) {
  try {
    const category = error && typeof error === 'object'
      ? error.providerErrorCategory
      : undefined;
    return SAFE_PROVIDER_CATEGORY_SET.has(category) ? category : 'unknown';
  } catch {
    return 'unknown';
  }
}

function normalizeResult(value) {
  const parsed = ModelAdapterResultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  return failureResult('unsupported_response');
}

function isAbortSignal(signal) {
  return signal === undefined || (
    signal !== null
    && typeof signal === 'object'
    && typeof signal.aborted === 'boolean'
    && typeof signal.addEventListener === 'function'
    && typeof signal.removeEventListener === 'function'
  );
}

/**
 * Build a provider-neutral model port. Invocation limits are fixed by the
 * approved runtime contract and are never read from the caller's turn object.
 */
export function createModelAdapter({ invoke }) {
  if (typeof invoke !== 'function') {
    throw new TypeError('A model invocation function is required.');
  }

  async function complete({ messages, tools = [], signal } = {}) {
    if (!Array.isArray(messages) || !Array.isArray(tools) || !isAbortSignal(signal)) {
      return failureResult('configuration');
    }

    if (signal?.aborted) return failureResult('cancelled');

    const controller = new AbortController();
    let timeoutId;
    let onCallerAbort;
    let timedOut = false;
    let callerCancelled = false;

    const timeoutResult = new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve({ kind: 'timeout' });
      }, RUNTIME_LIMITS.modelTimeoutMs);
    });

    const cancellationResult = new Promise((resolve) => {
      if (!signal) return;
      onCallerAbort = () => {
        callerCancelled = true;
        controller.abort();
        resolve({ kind: 'cancelled' });
      };
      signal.addEventListener('abort', onCallerAbort, { once: true });
    });

    try {
      const invocationResult = Promise.resolve()
        .then(() => invoke({
          messages,
          tools,
          signal: controller.signal,
          timeoutMs: RUNTIME_LIMITS.modelTimeoutMs,
          maxOutputTokens: RUNTIME_LIMITS.maxOutputTokens,
        }))
        .then(
          (value) => ({ kind: 'result', value }),
          (error) => ({ kind: 'error', error }),
        );

      const result = await Promise.race([
        invocationResult,
        timeoutResult,
        cancellationResult,
      ]);

      if (result.kind === 'timeout' || timedOut) return failureResult('timeout');
      if (result.kind === 'cancelled' || callerCancelled) return failureResult('cancelled');
      if (result.kind === 'error') return failureResult(categoryFromException(result.error));
      return normalizeResult(result.value);
    } catch {
      // Do not retain or expose exception messages, stacks, bodies, or headers.
      return failureResult('unknown');
    } finally {
      clearTimeout(timeoutId);
      if (signal && onCallerAbort) signal.removeEventListener('abort', onCallerAbort);
    }
  }

  return Object.freeze({ complete });
}
