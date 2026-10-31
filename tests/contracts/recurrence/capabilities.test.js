import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRecurrenceCapabilities,
  RECURRENCE_QUERY_TOOL_NAME,
  RECURRENCE_TOOL_VERSION,
} from '../../../server/agent/tools/recurrence-capabilities.js';

test('recurrence query capability delegates a strict explicit-date request to the typed read handler', async () => {
  const requests = [];
  const expected = Object.freeze({
    items: Object.freeze([]),
    metadata: Object.freeze({ resultState: 'empty' }),
  });
  const capabilities = createRecurrenceCapabilities({
    readTools: {
      async getRoutineTemplates(input) {
        requests.push(input);
        return expected;
      },
    },
  });
  const entry = capabilities.registry.get(RECURRENCE_QUERY_TOOL_NAME);

  assert.equal(entry.name, RECURRENCE_QUERY_TOOL_NAME);
  assert.equal(entry.version, RECURRENCE_TOOL_VERSION);
  assert.equal(entry.enabled, true);
  assert.equal(await entry.handler({ date: '2026-10-30', pageSize: 20 }), expected);
  assert.deepEqual(requests, [{ date: '2026-10-30', pageSize: 20 }]);
  assert.throws(() => capabilities.registry.set('createOccurrence', {}), /immutable/);
});

test('recurrence query capability rejects malformed, ambiguous, or expanded input before the database handler', async () => {
  let calls = 0;
  const capabilities = createRecurrenceCapabilities({
    readTools: {
      async getRoutineTemplates() { calls += 1; return { items: [], metadata: {} }; },
    },
  });
  const query = capabilities.registry.get(RECURRENCE_QUERY_TOOL_NAME).handler;

  await assert.rejects(query({ date: 'next week' }));
  await assert.rejects(query({ date: '2026-10-30', sql: 'select * from recorrente' }));
  assert.equal(calls, 0);
});
