const PUBLIC_MESSAGES = Object.freeze({
  INVALID_INPUT: 'Invalid input',
  NOT_FOUND: 'Item not found',
  ACCESS_DISABLED: 'Read capability unavailable',
  DEPENDENCY_UNAVAILABLE: 'Read dependency unavailable',
  INTERNAL: 'Internal error',
});

export const DOMAIN_READ_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  ACCESS_DISABLED: 'ACCESS_DISABLED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
});

const publicCodeByError = new WeakMap();

/**
 * A domain error with a fixed public message. Raw dependency errors, SQL,
 * credentials, and record payloads are deliberately not retained as causes.
 */
export class DomainReadError extends Error {
  constructor(code) {
    const message = Object.hasOwn(PUBLIC_MESSAGES, code) ? PUBLIC_MESSAGES[code] : undefined;
    if (!message) throw new TypeError('Unsupported domain read error code');

    super(message);
    this.name = 'DomainReadError';
    publicCodeByError.set(this, code);
  }

  get code() {
    return publicCodeByError.get(this) || DOMAIN_READ_ERROR_CODES.INTERNAL;
  }
}

export function isDomainReadError(error, code) {
  const knownCode = error && typeof error === 'object' ? publicCodeByError.get(error) : undefined;
  return code === undefined ? knownCode !== undefined : knownCode === code;
}

/**
 * Maps only errors created by this module. Unknown errors become a generic
 * INTERNAL response; their message and stack are never copied to the result.
 */
export function toPublicDomainError(error) {
  const code = error && typeof error === 'object'
    ? publicCodeByError.get(error) || DOMAIN_READ_ERROR_CODES.INTERNAL
    : DOMAIN_READ_ERROR_CODES.INTERNAL;

  return Object.freeze({
    code,
    message: PUBLIC_MESSAGES[code],
  });
}

export function mapDomainReadError(error) {
  return Object.freeze({ error: toPublicDomainError(error) });
}
