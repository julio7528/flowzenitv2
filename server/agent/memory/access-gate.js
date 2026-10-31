import { assertServerOnlyRuntime } from '../runtime/server-only.js';

assertServerOnlyRuntime();

const ACCESS_DISABLED = Object.freeze({
  error: Object.freeze({
    code: 'ACCESS_DISABLED',
    message: 'Conversation memory unavailable',
  }),
});

/**
 * SPEC-003 deliberately has no authorization path while DEC-001 is closed.
 * This gate never inspects request data or invokes a supplied operation. The
 * repository and checkpoint adapters remain directly injectable for isolated
 * synthetic tests, but no runtime request can use this object to reach them.
 */
export class MemoryAccessGate {
  constructor() {
    assertServerOnlyRuntime();
    Object.freeze(this);
  }

  isOpen() {
    return false;
  }

  check() {
    return ACCESS_DISABLED;
  }

  run(_operation) {
    return ACCESS_DISABLED;
  }
}

export const memoryAccessGate = Object.freeze(new MemoryAccessGate());

/** Return a fresh shallow envelope whose nested error remains immutable. */
export function accessDisabledResult() {
  return { error: ACCESS_DISABLED.error };
}
