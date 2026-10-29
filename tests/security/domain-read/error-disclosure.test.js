import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMAIN_READ_ERROR_CODES,
  DomainReadError,
  mapDomainReadError,
  toPublicDomainError,
} from '../../../server/domain/read/errors.js';
import { createSafeLogContext } from '../../../server/observability/safeLogContext.js';

const requestId = '123e4567-e89b-42d3-a456-426614174000';

test('raw Supabase errors, SQL, credentials, and private values map to generic public errors', () => {
  const sentinel = 'SPEC004-SYNTHETIC-SENSITIVE-SENTINEL';
  const dependencyError = new Error(`select private payload ${sentinel}`);
  dependencyError.stack = `synthetic stack ${sentinel}`;
  dependencyError.details = { sql: `select ${sentinel}`, apiKey: sentinel, row: { title: sentinel } };

  const response = mapDomainReadError(dependencyError);
  assert.deepEqual(response, {
    error: { code: DOMAIN_READ_ERROR_CODES.INTERNAL, message: 'Internal error' },
  });
  assert.doesNotMatch(JSON.stringify(response), /SPEC004-SYNTHETIC|select|apiKey|stack|private payload/i);
  assert.equal(toPublicDomainError(new DomainReadError(DOMAIN_READ_ERROR_CODES.DEPENDENCY_UNAVAILABLE)).message,
    'Read dependency unavailable');
});

test('safe log context keeps approved correlation fields and omits credentials, query text, and row payloads', () => {
  const sentinel = 'SPEC004-SYNTHETIC-LOG-SENTINEL';
  const context = createSafeLogContext({
    requestId,
    operationId: 'domain.read.search',
    outcome: 'dependency_unavailable',
    durationMs: 7,
    dependency: 'supabase',
    authorization: `Bearer ${sentinel}`,
    apiKey: sentinel,
    SQL: `ilike private row ${sentinel}`,
    query: { text: sentinel },
    record: { demanda: sentinel },
    rawError: new Error(sentinel),
  });

  assert.deepEqual(context, {
    requestId,
    operationId: 'domain.read.search',
    outcome: 'dependency_unavailable',
    durationMs: 7,
    dependency: 'supabase',
  });
  assert.doesNotMatch(JSON.stringify(context), /SPEC004-SYNTHETIC|Bearer|ilike|demanda|apiKey/i);
});
