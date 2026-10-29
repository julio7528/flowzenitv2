import test from 'node:test';
import assert from 'node:assert/strict';
import { getItemById } from '../../../server/domain/read/lookup.js';
import {
  toPublicDomainError,
} from '../../../server/domain/read/errors.js';
import { createDomainReadFixtures } from '../../fixtures/domain-read/records.js';

const fixtures = createDomainReadFixtures({ marker: 't009-lookup-synthetic' });

function createRepository(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const requestedIds = [];
  return {
    requestedIds,
    async getItemById(id) {
      requestedIds.push(id);
      return byId.get(id) ?? null;
    },
  };
}

async function publicOutcome(operation) {
  try {
    return { value: await operation() };
  } catch (error) {
    return { error: toPublicDomainError(error) };
  }
}

test('exact lookup passes and preserves a bigint ID as its decimal string', async () => {
  const row = fixtures.demandas.find((candidate) => candidate.id === fixtures.ids.overlappingSubtaskA);
  const repository = createRepository([row]);
  const result = await getItemById(repository, fixtures.ids.overlappingSubtaskA);
  const item = result?.item ?? result;

  assert.deepEqual(repository.requestedIds, [fixtures.ids.overlappingSubtaskA]);
  assert.equal(item.id, '9007199254741003');
  assert.equal(item.sourceRef.id, '9007199254741003');
  assert.equal(typeof item.id, 'string');
});

test('different absent IDs share the same public NOT_FOUND result without exposing unrelated rows', async () => {
  const repository = createRepository([fixtures.demandas[0]]);
  const first = await publicOutcome(() => getItemById(repository, '9007199254742991'));
  const second = await publicOutcome(() => getItemById(repository, '9007199254742992'));

  assert.deepEqual(first, { error: { code: 'NOT_FOUND', message: 'Item not found' } });
  assert.deepEqual(second, first);
  assert.doesNotMatch(JSON.stringify(first), /t009-lookup-synthetic|9007199254741001/);
});
