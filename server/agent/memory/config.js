import { assertServerOnlyRuntime } from '../runtime/server-only.js';

const POLICY_VERSION = 'dec005-spec003-v1';
const HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
const CHECKPOINT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CURSOR_KEY_BYTES = 4096;
const CONFIG_KEYS = new Set(['pool', 'cursorHmacKey', 'now']);
const privateKeys = new WeakMap();

assertServerOnlyRuntime();

export class ConversationMemoryConfigurationError extends Error {
  constructor() {
    super('Conversation memory configuration is invalid.');
    this.name = 'ConversationMemoryConfigurationError';
    this.code = 'INVALID_MEMORY_CONFIGURATION';
  }
}

function invalidConfiguration() {
  return new ConversationMemoryConfigurationError();
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function readOwnValue(source, key) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(source, key);
  } catch {
    throw invalidConfiguration();
  }
  if (descriptor === undefined) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) throw invalidConfiguration();
  return descriptor.value;
}

function validateConfigKeys(source) {
  let keys;
  try {
    keys = Reflect.ownKeys(source);
  } catch {
    throw invalidConfiguration();
  }
  if (keys.some((key) => typeof key !== 'string' || !CONFIG_KEYS.has(key))) {
    throw invalidConfiguration();
  }
}

function copyCursorKey(value) {
  if (value === undefined) return undefined;
  if (!(value instanceof Uint8Array) || value.byteLength < 32 || value.byteLength > MAX_CURSOR_KEY_BYTES) {
    throw invalidConfiguration();
  }
  return Uint8Array.from(value);
}

/**
 * Build immutable server-only dependencies for the conversation adapters.
 * The options are injected by trusted server setup; this module never reads
 * process.env, accepts request values, or enables DEC-001.
 */
export function createConversationMemoryConfig(options = {}) {
  assertServerOnlyRuntime();
  if (!isPlainRecord(options)) throw invalidConfiguration();
  validateConfigKeys(options);

  const pool = readOwnValue(options, 'pool');
  const now = readOwnValue(options, 'now');
  const cursorKey = copyCursorKey(readOwnValue(options, 'cursorHmacKey'));

  if (pool !== undefined && (pool === null || typeof pool !== 'object' || Array.isArray(pool))) {
    throw invalidConfiguration();
  }
  if (now !== undefined && typeof now !== 'function') throw invalidConfiguration();

  const config = Object.freeze({
    policyVersion: POLICY_VERSION,
    historyRetentionMs: HISTORY_RETENTION_MS,
    checkpointRetentionMs: CHECKPOINT_RETENTION_MS,
    storageConfigured: pool !== undefined,
    cursorConfigured: cursorKey !== undefined,
    // This flag is immutable and has no configuration override in SPEC-003.
    privateAccessAllowed: false,
    pool,
    now: now ?? Date.now,
    getCursorHmacKey() {
      const key = privateKeys.get(config);
      return key === undefined ? undefined : Uint8Array.from(key);
    },
  });

  if (cursorKey !== undefined) privateKeys.set(config, cursorKey);
  return config;
}
