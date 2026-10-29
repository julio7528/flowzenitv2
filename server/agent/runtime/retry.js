import { RUNTIME_LIMITS } from './limits.js';

export const RETRY_DELAY_MS = 250;

/**
 * The only eligible retry classes are transient provider failures and
 * explicitly verified idempotent read-tool dependency failures. One retry
 * is shared by the whole turn and the fixed delay must fit inside its budget.
 */
export function isRetryEligible({
  source,
  category,
  retryCount,
  remainingMs,
  verifiedIdempotentRead = false,
} = {}) {
  if (
    !Number.isSafeInteger(retryCount)
    || retryCount < 0
    || retryCount >= RUNTIME_LIMITS.maxRetries
    || !Number.isFinite(remainingMs)
    || remainingMs < RETRY_DELAY_MS
  ) {
    return false;
  }

  if (source === 'provider') return category === 'transient';
  return source === 'tool'
    && category === 'dependency_failure'
    && verifiedIdempotentRead === true;
}
