const SPEC004_READ_TOOLS = Object.freeze([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

/** A deterministic model port that consumes one supplied result per call. */
export function createDeterministicModelDouble(responses) {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new TypeError('A deterministic model double needs at least one response.');
  }

  let responseIndex = 0;
  const calls = [];

  return Object.freeze({
    calls,
    async complete(request) {
      if (request?.signal?.aborted) {
        throw request.signal.reason ?? new Error('Model call cancelled.');
      }
      calls.push(Object.freeze({ call: calls.length + 1 }));
      if (responseIndex >= responses.length) {
        throw new Error('Deterministic model responses were exhausted.');
      }

      const response = responses[responseIndex++];
      if (response instanceof Error) throw response;
      return typeof response === 'function'
        ? response(request)
        : clone(response);
    },
  });
}

/** Synthetic SPEC-004 handlers; no database client or network is created. */
export function createSyntheticReadToolDouble(handlers = {}) {
  const calls = [];
  const allowed = new Set(SPEC004_READ_TOOLS);

  return Object.freeze({
    calls,
    names: SPEC004_READ_TOOLS,
    async invoke(name, input, { signal } = {}) {
      if (!allowed.has(name)) throw new Error('Synthetic read tool is not registered.');
      if (signal?.aborted) throw signal.reason ?? new Error('Tool call cancelled.');
      const handler = handlers[name];
      if (typeof handler !== 'function') {
        throw new Error(`Synthetic handler is not configured for ${name}.`);
      }

      calls.push(Object.freeze({ name }));
      return clone(await handler(clone(input)));
    },
  });
}

/** In-memory checkpoint fake for single-process deterministic tests only. */
export function createMemoryCheckpointDouble(initialEntries = []) {
  const entries = new Map(initialEntries.map(([threadId, value]) => [threadId, clone(value)]));

  return Object.freeze({
    async load(threadId) {
      return clone(entries.get(threadId));
    },
    async save(threadId, graphVersion, checkpoint) {
      entries.set(threadId, { graphVersion, checkpoint: clone(checkpoint) });
      return Object.freeze({ threadId, graphVersion });
    },
  });
}
