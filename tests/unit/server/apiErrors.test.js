import test from 'node:test';
import assert from 'node:assert/strict';
import {
  API_ERROR_CODES,
  ApiBoundaryError,
  mapApiError,
} from '../../../server/http/apiErrors.js';

const serverRequestId = '123e4567-e89b-42d3-a456-426614174000';

test('API boundary errors map to stable generic categories and messages', () => {
  const cases = [
    [API_ERROR_CODES.INVALID_REQUEST, 'Invalid request'],
    [API_ERROR_CODES.CONFIGURATION_UNAVAILABLE, 'Required configuration unavailable'],
    [API_ERROR_CODES.DEPENDENCY_UNAVAILABLE, 'Dependency unavailable'],
    [API_ERROR_CODES.CAPABILITY_DISABLED, 'Capability unavailable'],
    [API_ERROR_CODES.INTERNAL, 'Internal error'],
  ];

  for (const [code, message] of cases) {
    assert.deepEqual(mapApiError(new ApiBoundaryError(code), { requestId: serverRequestId }), {
      error: { code, message },
      requestId: serverRequestId,
    });
  }
});

test('an empty successful result is not converted into an integration error', () => {
  const success = { data: [] };

  assert.equal(mapApiError(null), null);
  assert.deepEqual(success, { data: [] });
});

test('unknown and mutated errors expose no raw message, stack, or attached payload', () => {
  const sentinel = 'synthetic-secret-sentinel-only';
  const error = new Error(`dependency detail ${sentinel}`);
  error.stack = `synthetic stack ${sentinel}`;
  error.providerPayload = { token: sentinel };

  const typed = new ApiBoundaryError(API_ERROR_CODES.INVALID_REQUEST);
  typed.message = sentinel;
  typed.code = API_ERROR_CODES.INTERNAL;

  for (const candidate of [error, typed]) {
    const response = mapApiError(candidate);
    const serialized = JSON.stringify(response);

    assert.equal(response.error.code, candidate === typed ? API_ERROR_CODES.INVALID_REQUEST : API_ERROR_CODES.INTERNAL);
    assert.match(response.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.doesNotMatch(serialized, /synthetic-secret-sentinel-only|stack|providerPayload|token/i);
  }
});

test('unrecognized error codes are rejected instead of becoming public messages', () => {
  assert.throws(() => new ApiBoundaryError('toString'), /Unsupported API error code/);
});
