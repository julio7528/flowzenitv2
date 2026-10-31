import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSearchRetrievalContext,
  serializeReadToolPromptContent,
} from '../../../server/agent/runtime/retrieval-context.js';

function candidate(id, name = `synthetic item ${id}`) {
  const sourceRef = { kind: 'demand', id };
  return {
    item: { id, sourceRef, kind: 'demand', parentId: null },
    candidate: { id, sourceRef, name, kind: 'demand', parentId: null, hierarchyContext: [] },
  };
}

function result(rows, overrides = {}) {
  const hasItems = rows.length > 0;
  const defaults = {
    items: rows.map((row) => row.item),
    metadata: {
      source: 'relational',
      resultState: hasItems ? 'nonEmpty' : 'empty',
      completeness: 'complete',
      freshness: 'fresh',
      readAt: '2026-10-30T17:00:00.000Z',
      nextCursor: null,
    },
    requiresNarrowing: rows.length > 1,
    candidates: rows.map((row) => row.candidate),
  };
  if (rows.length > 1) defaults.narrowingReason = 'multiple_candidates';
  return { ...defaults, ...overrides };
}

test('search prompt context deduplicates citations by persistent source and preserves parent chain', () => {
  const first = candidate('301');
  const duplicate = candidate('301');
  const context = createSearchRetrievalContext(result([first, duplicate]));

  assert.equal(context.state, 'ambiguous');
  assert.equal(context.evidence.length, 1);
  assert.deepEqual(context.evidence[0], {
    sourceType: 'demand',
    sourceId: '301',
    displayText: 'synthetic item 301',
    parentChain: [],
    citationRef: 'demand:301',
  });
});

test('search context discards invalid provenance as unavailable rather than empty', () => {
  const malformed = candidate('302');
  malformed.candidate.sourceRef = { kind: 'demand', id: '999' };
  const context = createSearchRetrievalContext(result([malformed]));

  assert.equal(context.state, 'unavailable');
  assert.deepEqual(context.evidence, []);
  assert.deepEqual(context.warnings, ['invalid_provenance']);
});

test('empty, stale, and bounded search contexts remain distinct', () => {
  assert.equal(createSearchRetrievalContext(result([])).state, 'empty');

  const stale = result([candidate('303')], {
    metadata: {
      source: 'relational',
      resultState: 'nonEmpty',
      completeness: 'complete',
      freshness: 'stale',
      readAt: '2026-10-30T17:00:00.000Z',
      nextCursor: null,
    },
  });
  assert.equal(createSearchRetrievalContext(stale).state, 'unavailable');
  assert.deepEqual(createSearchRetrievalContext(stale).warnings, ['stale_source']);

  const longName = candidate('304', 'x'.repeat(300));
  const bounded = createSearchRetrievalContext(result([longName]));
  assert.equal(bounded.state, 'ambiguous');
  assert.equal(Array.from(bounded.evidence[0].displayText).length, 257);
  assert.deepEqual(bounded.warnings, ['display_text_limited']);
});

test('tool output is serialized as data-only retrieval content with source labels', () => {
  const sourceRef = { kind: 'demand', id: '305' };
  const search = result([candidate('305')]);
  const serialized = serializeReadToolPromptContent('searchItems', search);
  const segment = JSON.parse(serialized);

  assert.equal(segment.kind, 'untrusted-content');
  assert.equal(segment.sourceKind, 'retrieval');
  assert.equal(segment.sourceRef, 'SPEC-008/searchItems');
  assert.equal(segment.trust, 'untrusted');
  assert.equal(segment.contentType, 'data');
  assert.equal(JSON.parse(segment.text).evidence[0].citationRef, 'demand:305');
  assert.equal(Object.hasOwn(segment, 'policyDecision'), false);

  const exact = JSON.parse(serializeReadToolPromptContent('getItemById', {
    id: '305', sourceRef, status: 'Backlog',
  }));
  assert.equal(exact.trust, 'untrusted');
  assert.equal(exact.contentType, 'data');
  assert.equal(exact.sourceRef, 'SPEC-004/getItemById');
  assert.equal(JSON.parse(exact.text).sourceRef.id, '305');
});
