import { RUNTIME_LIMITS } from './limits.js';
import { RETRY_DELAY_MS } from './retry.js';

const OPERATION_TIMEOUTS = Object.freeze({
  model: RUNTIME_LIMITS.modelTimeoutMs,
  tool: RUNTIME_LIMITS.toolTimeoutMs,
});

/** Safe categories emitted by bounded runtime operations. */
export const BOUNDED_OPERATION_CATEGORIES = Object.freeze(['timeout', 'cancelled']);

/** Generic error for turn deadline, operation timeout, or caller cancellation. */
export class BoundedOperationError extends Error {
  constructor(category) {
    const safeCategory = BOUNDED_OPERATION_CATEGORIES.includes(category) ? category : 'timeout';
    super('The bounded operation did not complete.');
    this.name = 'BoundedOperationError';
    this.category = safeCategory;
  }
}

function categoryForParentAbort(signal) {
  try {
    const reason = signal?.reason;
    return reason instanceof BoundedOperationError && reason.category === 'timeout'
      ? 'timeout'
      : 'cancelled';
  } catch {
    return 'cancelled';
  }
}

function assertSignal(signal) {
  if (signal === undefined) return;
  if (
    signal === null
    || typeof signal !== 'object'
    || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
  ) {
    throw new TypeError('A valid AbortSignal is required.');
  }
}

function assertDeadline(deadlineAt) {
  if (!Number.isSafeInteger(deadlineAt) || deadlineAt < 0) {
    throw new TypeError('A valid turn deadline is required.');
  }
}

/** Return the remaining milliseconds before a server-owned turn deadline. */
export function remainingTurnMs(deadlineAt, now = Date.now()) {
  assertDeadline(deadlineAt);
  if (!Number.isFinite(now)) throw new TypeError('A valid clock value is required.');
  return Math.max(0, deadlineAt - now);
}

function waitBoundedDuration({ durationMs, deadlineAt, signal }) {
  assertDeadline(deadlineAt);
  assertSignal(signal);

  const remainingMs = remainingTurnMs(deadlineAt);
  if (remainingMs < durationMs) return Promise.reject(new BoundedOperationError('timeout'));
  if (signal?.aborted) return Promise.reject(new BoundedOperationError('cancelled'));

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };

    const onAbort = () => settle(reject, new BoundedOperationError(categoryForParentAbort(signal)));

    timer = setTimeout(() => settle(resolve), durationMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

  });
}

/**
 * Invoke a model or tool port with its fixed timeout and the remaining turn
 * deadline. Parent cancellation aborts the child signal and rejects safely.
 */
export function runBoundedCall({ kind, deadlineAt, signal, operation } = {}) {
  if (!Object.hasOwn(OPERATION_TIMEOUTS, kind)) {
    throw new TypeError('A supported bounded operation kind is required.');
  }
  const timeoutMs = OPERATION_TIMEOUTS[kind];
  if (typeof operation !== 'function') throw new TypeError('A bounded operation is required.');
  assertDeadline(deadlineAt);
  assertSignal(signal);

  const boundedTimeoutMs = Math.min(timeoutMs, remainingTurnMs(deadlineAt));
  if (boundedTimeoutMs <= 0) return Promise.reject(new BoundedOperationError('timeout'));
  if (signal?.aborted) return Promise.reject(new BoundedOperationError('cancelled'));

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timer;

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };

    const onAbort = () => {
      const category = categoryForParentAbort(signal);
      controller.abort(signal.reason);
      settle(reject, new BoundedOperationError(category));
    };

    timer = setTimeout(() => {
      controller.abort();
      settle(reject, new BoundedOperationError('timeout'));
    }, boundedTimeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then((value) => settle(resolve, value))
      .catch((error) => settle(reject, error));
  });
}

/** Wait the fixed retry delay, unless cancellation or the turn deadline wins. */
export function waitForRetryDelay({ deadlineAt, signal } = {}) {
  return waitBoundedDuration({
    durationMs: RETRY_DELAY_MS,
    deadlineAt,
    signal,
  });
}
