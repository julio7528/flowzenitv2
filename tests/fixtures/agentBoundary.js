/**
 * Reusable synthetic inputs for the SPEC-001 server-boundary tests.
 * These fixtures model untrusted browser hints and inert downstream doubles.
 * They do not represent an authenticated owner or contain product data.
 */

export function createSyntheticAgentRequest(overrides = {}) {
  return {
    method: 'POST',
    path: '/__synthetic__/agent',
    headers: {},
    body: { operation: 'synthetic-query', input: { query: 'fixture-only request' } },
    browserState: {
      passkeyUnlocked: true,
      sessionStorage: { passkeyVerified: 'true' },
    },
    ...overrides,
  };
}

function createSyntheticDouble(result, calls) {
  let callCount = 0;

  const invoke = async () => {
    callCount += 1;
    return result;
  };

  Object.defineProperty(invoke, 'callCount', { get: () => callCount });
  calls.push(invoke);
  return invoke;
}

export function createSyntheticAgentDependencies() {
  const tracked = [];
  const supabaseRequest = createSyntheticDouble({ data: null, error: null }, tracked);
  const providerRequest = createSyntheticDouble({ ok: true }, tracked);
  const sideEffect = createSyntheticDouble({ ok: true }, tracked);

  return {
    supabase: { request: supabaseRequest },
    provider: { request: providerRequest },
    sideEffect,
    getCallCounts() {
      return {
        supabase: supabaseRequest.callCount,
        provider: providerRequest.callCount,
        sideEffect: sideEffect.callCount,
        total: tracked.reduce((total, invoke) => total + invoke.callCount, 0),
      };
    },
  };
}
