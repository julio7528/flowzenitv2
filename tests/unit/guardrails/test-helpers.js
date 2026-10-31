/**
 * Test-only primitives for guardrail tests. None performs I/O or retains input
 * arguments, so synthetic secret sentinels cannot escape into helper state.
 */
export function createSideEffectSpy({ result = Object.freeze({ status: 'synthetic-success' }) } = {}) {
  let total = 0;
  const counts = new Map();

  function invoke(operation = 'synthetic-operation') {
    total += 1;
    counts.set(operation, (counts.get(operation) || 0) + 1);
    return result;
  }

  return Object.freeze({
    invoke,
    handler(operation) {
      return () => invoke(operation);
    },
    get total() {
      return total;
    },
    count(operation) {
      return counts.get(operation) || 0;
    },
    snapshot() {
      return Object.freeze({ total, byOperation: Object.freeze(Object.fromEntries(counts)) });
    },
  });
}

export function createFakeClock(initialTime = 1_800_000_000_000) {
  if (!Number.isFinite(initialTime)) throw new TypeError('A finite synthetic time is required.');
  let currentTime = initialTime;
  return Object.freeze({
    now: () => currentTime,
    advance(milliseconds) {
      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        throw new TypeError('A non-negative finite duration is required.');
      }
      currentTime += milliseconds;
      return currentTime;
    },
    set(millisecondsSinceEpoch) {
      if (!Number.isFinite(millisecondsSinceEpoch)) {
        throw new TypeError('A finite synthetic time is required.');
      }
      currentTime = millisecondsSinceEpoch;
      return currentTime;
    },
  });
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}
