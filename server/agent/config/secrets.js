import { assertServerOnlyRuntime } from '../runtime/server-only.js';

const DEEPSEEK_API_KEY_ENV = 'DEEPSEEK_API_KEY';
const HIERARCHY_CURSOR_SECRET_ENV = 'HIERARCHY_CURSOR_SECRET';
const MAX_DEEPSEEK_API_KEY_LENGTH = 4096;
const MAX_CURSOR_SECRET_LENGTH = 8192;

/** A configuration error whose message and code never contain the rejected value. */
export class AgentConfigurationError extends Error {
  constructor(code) {
    const safeCode = code === 'INVALID_SECRET' ? code : 'INVALID_CONFIGURATION';
    super('Agent server configuration is invalid.');
    this.name = 'AgentConfigurationError';
    this.code = safeCode;
  }
}

function configurationError(code = 'INVALID_CONFIGURATION') {
  return new AgentConfigurationError(code);
}

function assertServerConfigurationContext() {
  try {
    assertServerOnlyRuntime();
  } catch {
    throw configurationError();
  }
}

function readOwnEnvironmentValue(environment, name) {
  if (environment === null || typeof environment !== 'object') {
    throw configurationError();
  }

  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(environment, name);
  } catch {
    throw configurationError();
  }

  if (descriptor === undefined) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) throw configurationError('INVALID_SECRET');
  return descriptor.value;
}

function hasControlCharacters(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function getEnvironment(environment) {
  assertServerConfigurationContext();
  const selectedEnvironment = environment === undefined
    ? (typeof process === 'undefined' ? undefined : process.env)
    : environment;
  if (!selectedEnvironment || typeof selectedEnvironment !== 'object') {
    throw configurationError();
  }
  return selectedEnvironment;
}

/**
 * Read the provider credential only from server configuration. Missing values
 * remain undefined so deterministic tests and closed-gate requests need no key.
 */
export function getDeepSeekApiKey(environment) {
  const selectedEnvironment = getEnvironment(environment);
  const value = readOwnEnvironmentValue(selectedEnvironment, DEEPSEEK_API_KEY_ENV);
  if (value === undefined || value === '') return undefined;
  if (
    typeof value !== 'string'
    || value.length > MAX_DEEPSEEK_API_KEY_LENGTH
    || value.trim() !== value
    || hasControlCharacters(value)
  ) {
    throw configurationError('INVALID_SECRET');
  }
  return value;
}

function decodeCursorSecret(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_CURSOR_SECRET_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw configurationError('INVALID_SECRET');
  }

  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url');
  } catch {
    throw configurationError('INVALID_SECRET');
  }

  if (decoded.toString('base64url') !== value || decoded.byteLength < 32) {
    throw configurationError('INVALID_SECRET');
  }

  // Copy away from Buffer so callers receive a plain, independently mutable key.
  return Uint8Array.from(decoded);
}

/**
 * Decode the server-only, canonical unpadded base64url cursor key. A new byte
 * array is returned on each call; there is no source-code fallback key.
 */
export function getHierarchyCursorSecret(environment) {
  const selectedEnvironment = getEnvironment(environment);
  const value = readOwnEnvironmentValue(selectedEnvironment, HIERARCHY_CURSOR_SECRET_ENV);
  if (value === undefined || value === '') return undefined;
  return decodeCursorSecret(value);
}

/**
 * Disable both current and legacy LangSmith tracing switches for this process.
 * No tracing configuration is inherited from caller-provided request data.
 */
export function enforceLangSmithTracingOff() {
  assertServerConfigurationContext();
  try {
    if (typeof process === 'undefined' || !process.env) throw configurationError();
    process.env.LANGSMITH_TRACING = 'false';
    process.env.LANGCHAIN_TRACING_V2 = 'false';
  } catch {
    throw configurationError();
  }
  return false;
}

assertServerConfigurationContext();
enforceLangSmithTracingOff();
