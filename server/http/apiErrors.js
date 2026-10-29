import { createRequestId, isValidRequestId } from '../observability/safeLogContext.js';

export const API_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  CONFIGURATION_UNAVAILABLE: 'CONFIGURATION_UNAVAILABLE',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  CAPABILITY_DISABLED: 'CAPABILITY_DISABLED',
  INTERNAL: 'INTERNAL',
});

const PUBLIC_MESSAGES = Object.freeze({
  [API_ERROR_CODES.INVALID_REQUEST]: 'Invalid request',
  [API_ERROR_CODES.CONFIGURATION_UNAVAILABLE]: 'Required configuration unavailable',
  [API_ERROR_CODES.DEPENDENCY_UNAVAILABLE]: 'Dependency unavailable',
  [API_ERROR_CODES.CAPABILITY_DISABLED]: 'Capability unavailable',
  [API_ERROR_CODES.INTERNAL]: 'Internal error',
});

const safeApiErrorCodes = new WeakMap();

export class ApiBoundaryError extends Error {
  constructor(code) {
    const message = Object.hasOwn(PUBLIC_MESSAGES, code) ? PUBLIC_MESSAGES[code] : undefined;
    if (!message) throw new TypeError('Unsupported API error code');

    super(message);
    this.name = 'ApiBoundaryError';
    safeApiErrorCodes.set(this, code);
  }
}

export function mapApiError(error, { requestId } = {}) {
  if (error === null || error === undefined) return null;

  const code = safeApiErrorCodes.get(error) || API_ERROR_CODES.INTERNAL;
  const resolvedRequestId = isValidRequestId(requestId) ? requestId : createRequestId();

  return {
    error: {
      code,
      message: PUBLIC_MESSAGES[code],
    },
    requestId: resolvedRequestId,
  };
}
