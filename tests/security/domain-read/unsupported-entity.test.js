import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDomainReadTools,
  createUnsupportedEntityResponse,
  DOMAIN_READ_TOOL_NAMES,
} from '../../../server/domain/read/index.js';
import { isAgentAccessGateOpen } from '../../../server/security/accessGate.js';

const EXPECTED_READ_TOOLS = Object.freeze([
  'getHierarchy',
  'getItemById',
  'searchItems',
  'getDailySchedule',
  'getWeeklyAllocation',
  'getRoutineTemplates',
]);

function collectValues(value, result = []) {
  if (value === null || typeof value !== 'object') {
    result.push(value);
    return result;
  }

  for (const [key, child] of Object.entries(value)) {
    result.push(key);
    collectValues(child, result);
  }
  return result;
}

test('unsupported entity is a fixed pure response with no generated identifiers', () => {
  const response = createUnsupportedEntityResponse('commitment');

  assert.deepEqual(response, {
    error: {
      code: 'UNSUPPORTED_ENTITY',
      requestedEntity: 'commitment',
      message: 'The current domain model has no independent commitment or calendar entity.',
      supportedEntities: ['demand', 'task', 'subtask', 'routineTemplate'],
    },
  });
  assert.equal(Object.isFrozen(response), true);
  assert.equal(Object.isFrozen(response.error), true);
  assert.equal(Object.isFrozen(response.error.supportedEntities), true);

  const values = collectValues(response);
  assert.equal(values.some(value => typeof value === 'string' && /(?:^|_)id$/i.test(value)), false);
  assert.equal(values.some(value => typeof value === 'string' && /^\d{10,}$/.test(value)), false);
  assert.equal(values.some(value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)), false);

  assert.throws(
    () => createUnsupportedEntityResponse('commitment-9927026350032428'),
    error => error?.code === 'INVALID_INPUT',
  );
});

test('unsupported entity cannot become a seventh tool or change the fixed public gate', async () => {
  assert.equal(isAgentAccessGateOpen(), true);
  assert.deepEqual(DOMAIN_READ_TOOL_NAMES, EXPECTED_READ_TOOLS);

  let repositoryCalls = 0;
  const deniedRepository = new Proxy({}, {
    get() {
      return async () => {
        repositoryCalls += 1;
        return [];
      };
    },
  });
  const tools = createDomainReadTools(deniedRepository);
  assert.deepEqual(Object.keys(tools), EXPECTED_READ_TOOLS);
  assert.equal(Object.hasOwn(tools, 'createUnsupportedEntityResponse'), false);
  assert.equal(Object.hasOwn(tools, 'getCommitments'), false);
  assert.equal(Object.hasOwn(tools, 'getCalendar'), false);

  const unsupported = createUnsupportedEntityResponse('calendar');
  assert.equal(unsupported.error.code, 'UNSUPPORTED_ENTITY');
  assert.equal(repositoryCalls, 0);
  assert.equal(repositoryCalls, 0, 'unsupported entities never enter the typed read repository');
});
