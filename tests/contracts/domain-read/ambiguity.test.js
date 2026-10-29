import test from 'node:test';
import assert from 'node:assert/strict';
import { searchItems } from '../../../server/domain/read/search.js';
import { READ_ORDERINGS } from '../../../server/domain/read/pagination.js';

const rows = [
  {
    id: '9007199254743001',
    demanda: 'synthetic project alpha',
    tipo: 1,
    raizid: null,
    status: 'Em andamento',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  },
  {
    id: '9007199254743010',
    demanda: 'synthetic task alpha',
    tipo: 2,
    raizid: '9007199254743001',
    status: 'Em andamento',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  },
  {
    id: '9007199254743050',
    demanda: 'synthetic repeated title',
    tipo: 3,
    raizid: '9007199254743010',
    status: 'Aguardando',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  },
  {
    id: '9007199254743002',
    demanda: 'synthetic project beta',
    tipo: 1,
    raizid: null,
    status: 'Backlog',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  },
  {
    id: '9007199254743020',
    demanda: 'synthetic task beta',
    tipo: 2,
    raizid: '9007199254743002',
    status: 'Backlog',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  },
  {
    id: '9007199254743040',
    demanda: 'synthetic repeated title',
    tipo: 3,
    raizid: '9007199254743020',
    status: 'Executando',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  },
];

const candidateAlpha = rows[2];
const candidateBeta = rows[5];
const pageCursor = 'synthetic-search-continuation';

function createRepository({ visibleCandidates, hasMore = false, nextCursor = null }) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    async searchItems() {
      return {
        items: visibleCandidates,
        hasMore,
        nextCursor: hasMore ? nextCursor : null,
      };
    },
    async getItemById(id) {
      return byId.get(id) ?? null;
    },
    async getChildren() {
      return { items: [], hasMore: false, nextCursor: null };
    },
  };
}

function candidateIds(result) {
  assert.ok(Array.isArray(result.candidates), 'search result preserves candidate references');
  return result.candidates.map((candidate) => candidate.id);
}

test('repeated titles remain separate candidates with persistent IDs and hierarchy context', async () => {
  const result = await searchItems(createRepository({
    // The repository supplies the fixed demanda/type/ID order used by its
    // database cursor; the domain layer must preserve this page order.
    visibleCandidates: [candidateBeta, candidateAlpha],
  }), { text: 'synthetic repeated title' });

  assert.deepEqual(READ_ORDERINGS.search.map((sort) => sort.column), ['demanda', 'tipo', 'id']);
  assert.equal(result.requiresNarrowing, true);
  assert.equal(result.narrowingReason, 'multiple_candidates');
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(candidateIds(result), [candidateBeta.id, candidateAlpha.id]);
  assert.deepEqual(candidateIds(result), result.items.map((item) => item.id));
  assert.equal(new Set(candidateIds(result)).size, 2);
  assert.ok(result.candidates.every((candidate) => candidate.name === 'synthetic repeated title'));

  const alpha = result.candidates.find((candidate) => candidate.id === candidateAlpha.id);
  const beta = result.candidates.find((candidate) => candidate.id === candidateBeta.id);
  for (const [candidate, row] of [[alpha, candidateAlpha], [beta, candidateBeta]]) {
    assert.equal(typeof candidate.id, 'string');
    assert.match(candidate.id, /^\d+$/);
    assert.deepEqual(candidate.sourceRef, { kind: 'subtask', id: row.id });
    assert.equal(candidate.kind, 'subtask');
    assert.equal(candidate.parentId, row.raizid);
    assert.deepEqual(candidate.hierarchyContext.map((item) => item.sourceRef.id), [
      row.id === candidateAlpha.id ? '9007199254743001' : '9007199254743002',
      row.raizid,
    ]);
    assert.ok(candidate.hierarchyContext.every((item) => typeof item.name === 'string'));
  }
});

test('one visible candidate on a truncated page explicitly requires narrowing', async () => {
  const result = await searchItems(createRepository({
    visibleCandidates: [candidateBeta],
    hasMore: true,
    nextCursor: pageCursor,
  }), { text: 'synthetic repeated title', pageSize: 1 });

  assert.deepEqual(candidateIds(result), [candidateBeta.id]);
  assert.equal(result.requiresNarrowing, true);
  assert.equal(result.narrowingReason, 'results_truncated');
  assert.equal(result.metadata.completeness, 'truncated');
  assert.equal(result.metadata.nextCursor, pageCursor);
});

test('multiple visible candidates take precedence over truncation and no unique candidate is selected', async () => {
  const result = await searchItems(createRepository({
    visibleCandidates: [candidateAlpha, candidateBeta],
    hasMore: true,
    nextCursor: pageCursor,
  }), { text: 'synthetic repeated title', pageSize: 2 });

  assert.equal(result.requiresNarrowing, true);
  assert.equal(result.narrowingReason, 'multiple_candidates');
  assert.equal(result.metadata.completeness, 'truncated');
  assert.equal(result.metadata.nextCursor, pageCursor);
  assert.equal(result.candidates.length, 2);
  assert.equal(Object.hasOwn(result, 'selectedCandidate'), false);
});

test('a single complete search result does not request narrowing', async () => {
  const result = await searchItems(createRepository({
    visibleCandidates: [candidateAlpha],
  }), { text: 'synthetic repeated title' });

  assert.equal(result.requiresNarrowing, false);
  assert.equal(Object.hasOwn(result, 'narrowingReason'), false);
  assert.equal(result.metadata.completeness, 'complete');
  assert.equal(result.metadata.nextCursor, null);
});
