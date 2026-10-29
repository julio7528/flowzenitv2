/** Fail fast if a server-only agent module is imported into a browser runtime. */
export function assertServerOnlyRuntime() {
  if (typeof globalThis.window !== 'undefined' || typeof globalThis.document !== 'undefined') {
    throw new Error('The agent runtime is server-only.');
  }
}
