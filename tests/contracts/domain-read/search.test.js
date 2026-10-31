import test from 'node:test';
import assert from 'node:assert/strict';
import { searchItems } from '../../../server/domain/read/search.js';
import { createReadRepository } from '../../../server/domain/read/repository.js';
import { toPublicDomainError } from '../../../server/domain/read/errors.js';
import { createDomainReadFixtures } from '../../fixtures/domain-read/records.js';

const fixtures = createDomainReadFixtures({ marker: 't010-search-synthetic' });

async function publicError(operation) {
  try {
    await operation();
  } catch (error) {
    return toPublicDomainError(error);
  }
  return null;
}

test('search forwards only validated, allowlisted typed filters to the repository', async () => {
  let forwarded;
  const repository = {
    async searchItems(request) {
      forwarded = request;
      return { items: [], hasMore: false, nextCursor: null };
    },
  };

  await searchItems(repository, {
    kinds: ['task'],
    statuses: ['Em andamento'],
    dateFrom: '2026-10-26',
    dateTo: '2026-11-01',
    parentId: fixtures.ids.demandWithHierarchy,
    pageSize: 12,
  });

  assert.deepEqual(forwarded, {
    kinds: ['task'],
    statuses: ['Em andamento'],
    dateFrom: '2026-10-26',
    dateTo: '2026-11-01',
    parentId: fixtures.ids.demandWithHierarchy,
    pageSize: 12,
  });
  assert.deepEqual(Object.keys(forwarded).sort(), [
    'dateFrom', 'dateTo', 'kinds', 'pageSize', 'parentId', 'statuses',
  ]);
});

test('unknown query-expression fields are rejected before repository access', async () => {
  let repositoryCalls = 0;
  const error = await publicError(() => searchItems({
    async searchItems() {
      repositoryCalls += 1;
      return { items: [], hasMore: false, nextCursor: null };
    },
  }, {
    text: 'synthetic literal',
    query: 'unrecognized filter text',
  }));

  assert.equal(error?.code, 'INVALID_INPUT');
  assert.equal(repositoryCalls, 0);
});

test('empty searches return current complete metadata without requesting narrowing', async () => {
  const result = await searchItems({
    async searchItems() {
      return { items: [], hasMore: false, nextCursor: null };
    },
  }, { text: 'synthetic no match' });

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.requiresNarrowing, false);
  assert.equal(result.metadata.completeness, 'complete');
  assert.equal(result.metadata.freshness, 'fresh');
  assert.equal(typeof result.metadata.readAt, 'string');
});

test('search dependency errors become bounded public errors', async () => {
  const error = await publicError(() => searchItems({
    async searchItems() {
      throw new Error('synthetic private database detail');
    },
  }, { text: 'synthetic query' }));

  assert.equal(error?.code, 'DEPENDENCY_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(error), /private database detail/);
});

test('search candidates preserve persistent identity and current hierarchy provenance', async () => {
  const row = fixtures.demandas.find((candidate) => candidate.id === fixtures.ids.overlappingSubtaskA);
  const rowsById = new Map(fixtures.demandas.map((candidate) => [candidate.id, candidate]));
  const result = await searchItems({
    async searchItems() {
      return { items: [row], hasMore: false, nextCursor: null };
    },
    async getItemById(id) {
      return rowsById.get(id) ?? null;
    },
  }, { text: row.demanda });

  assert.equal(result.items[0].id, row.id);
  assert.deepEqual(result.candidates[0].sourceRef, { kind: 'subtask', id: row.id });
  assert.equal(result.candidates[0].kind, 'subtask');
  assert.equal(result.candidates[0].parentId, row.raizid);
  assert.deepEqual(result.candidates[0].hierarchyContext.map((ancestor) => ancestor.sourceRef), [
    { kind: 'demand', id: fixtures.ids.demandWithHierarchy },
    { kind: 'task', id: fixtures.ids.taskWithSchedule },
  ]);
  assert.equal(result.metadata.freshness, 'fresh');
});

test('ambiguous literal search keeps duplicate-name records as separate candidates', async () => {
  const duplicateRows = fixtures.demandas.filter((row) => row.id === fixtures.ids.overlappingSubtaskA
    || row.id === fixtures.ids.overlappingSubtaskB);
  const result = await searchItems({
    async searchItems() {
      return { items: duplicateRows, hasMore: false, nextCursor: null };
    },
  }, { text: 't010-search-synthetic-ambiguous-subtask' });

  assert.deepEqual(result.items.map((item) => item.id), [
    fixtures.ids.overlappingSubtaskA,
    fixtures.ids.overlappingSubtaskB,
  ]);
});

function createQueryRecorder() {
  const calls = [];
  const query = {
    select(projection) { calls.push(['select', projection]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    in(column, value) { calls.push(['in', column, value]); return this; },
    gte(column, value) { calls.push(['gte', column, value]); return this; },
    lte(column, value) { calls.push(['lte', column, value]); return this; },
    ilike(column, pattern) { calls.push(['ilike', column, pattern]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    range(from, to) { calls.push(['range', from, to]); return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };
  return {
    calls,
    client: { from(table) { calls.push(['from', table]); return query; } },
  };
}

test('repository emits only a fixed ILIKE substring pattern and escapes literal pattern characters', async () => {
  const { calls, client } = createQueryRecorder();
  const repository = createReadRepository(client);

  await repository.searchItems({ text: 'a%_\\b', kinds: ['task'] });

  assert.ok(calls.some(([method, column, pattern]) => method === 'ilike'
    && column === 'demanda'
    && pattern === '%a\\%\\_\\\\b%'));
  assert.equal(calls.some(([method]) => method === 'or'), false);
  assert.equal(calls.some(([method, column]) => method === 'select' && column === '*'), false);
});

test('repository passes composed and decomposed Unicode text through unchanged to ILIKE', async () => {
  for (const text of ['café', 'cafe\u0301']) {
    const { calls, client } = createQueryRecorder();
    await createReadRepository(client).searchItems({ text });
    const ilike = calls.find(([method]) => method === 'ilike');
    assert.equal(ilike[2], `%${text}%`);
  }
});
