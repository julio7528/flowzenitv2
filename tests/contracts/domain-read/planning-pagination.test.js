import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateReadQuery, READ_ORDERINGS } from '../../../server/domain/read/pagination.js';
import { DOMAIN_READ_ERROR_CODES, isDomainReadError } from '../../../server/domain/read/errors.js';

function createPageQuery(response) {
  const calls = [];
  const query = {
    order(column, options) { calls.push(['order', column, options]); return this; },
    range(from, to) { calls.push(['range', from, to]); return this; },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); },
  };
  return { calls, query };
}

test('pagination orders by the fixed key and persistent ID, then exposes truncation and a continuation cursor', async () => {
  const firstPageRows = [
    { id: '1001', demanda: 'Alpha' },
    { id: '1002', demanda: 'Alpha' },
    { id: '1003', demanda: 'Beta' },
  ];
  const firstPage = createPageQuery({ data: firstPageRows, error: null });
  const first = await paginateReadQuery(firstPage.query, {
    pageSize: 2,
    filters: { text: 'synthetic search phrase' },
    ordering: 'search',
  });

  assert.deepEqual(first.items, firstPageRows.slice(0, 2));
  assert.equal(first.hasMore, true);
  assert.equal(typeof first.nextCursor, 'string');
  assert.deepEqual(firstPage.calls.filter(([method]) => method === 'order').map(([, column]) => column),
    READ_ORDERINGS.search.map(({ column }) => column));
  assert.deepEqual(firstPage.calls.find(([method]) => method === 'range'), ['range', 0, 2]);
  assert.doesNotMatch(first.nextCursor, /synthetic search phrase|Alpha|1001/);

  const nextRows = [{ id: '1003', demanda: 'Beta' }];
  const nextPage = createPageQuery({ data: nextRows, error: null });
  const second = await paginateReadQuery(nextPage.query, {
    pageSize: 2,
    cursor: first.nextCursor,
    filters: { text: 'synthetic search phrase' },
    ordering: 'search',
  });
  assert.deepEqual(second.items, nextRows);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(nextPage.calls.find(([method]) => method === 'range'), ['range', 2, 4]);
});

test('continuation cursors reject changed filters or ordering instead of silently resuming another query', async () => {
  const firstPage = createPageQuery({ data: [{ id: '1' }, { id: '2' }], error: null });
  const first = await paginateReadQuery(firstPage.query, {
    pageSize: 1,
    filters: { parentId: '9007199254741001' },
    ordering: 'search',
  });

  const changedFilter = createPageQuery({ data: [], error: null });
  await assert.rejects(paginateReadQuery(changedFilter.query, {
    pageSize: 1,
    cursor: first.nextCursor,
    filters: { parentId: '9007199254741002' },
    ordering: 'search',
  }), (error) => isDomainReadError(error, DOMAIN_READ_ERROR_CODES.INVALID_INPUT));

  const changedOrder = createPageQuery({ data: [], error: null });
  await assert.rejects(paginateReadQuery(changedOrder.query, {
    pageSize: 1,
    cursor: first.nextCursor,
    filters: { parentId: '9007199254741001' },
    ordering: 'hierarchy',
  }), (error) => isDomainReadError(error, DOMAIN_READ_ERROR_CODES.INVALID_INPUT));
});

test('cursor is continuation metadata, not a promise of an immutable database snapshot', async () => {
  const firstRequest = createPageQuery({ data: [{ id: '1001' }, { id: '1002' }], error: null });
  const first = await paginateReadQuery(firstRequest.query, {
    pageSize: 1,
    filters: {},
    ordering: 'search',
  });
  assert.equal(first.hasMore, true);

  // The second database result represents its current state. Pagination carries
  // an offset/filter binding only; it does not promise a repeatable-read snapshot.
  const changedDataPage = createPageQuery({ data: [{ id: 'inserted-before-continuation' }], error: null });
  const second = await paginateReadQuery(changedDataPage.query, {
    pageSize: 1,
    cursor: first.nextCursor,
    filters: {},
    ordering: 'search',
  });
  assert.deepEqual(second.items, [{ id: 'inserted-before-continuation' }]);
  assert.deepEqual(changedDataPage.calls.find(([method]) => method === 'range'), ['range', 1, 2]);
  assert.equal(Object.hasOwn(second, 'snapshot'), false);
});
