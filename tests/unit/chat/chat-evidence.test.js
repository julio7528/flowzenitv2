import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getChatSourceReferences } from '../../../src/lib/chatEvidence.js';

test('chat evidence extracts bounded source citations from retrieval and query results', () => {
  const references = getChatSourceReferences([
    {
      queryKind: 'postgres_text_search',
      state: 'complete',
      evidence: [{
        sourceType: 'demand',
        sourceId: '101',
        displayText: 'Revisar o plano trimestral',
        citationRef: 'demand:101',
      }],
    },
    {
      items: [{
        sourceRef: { kind: 'routine_template', id: 202 },
        displayText: 'Revisar a agenda diária',
      }],
    },
  ]);

  assert.deepEqual(references, [
    {
      key: 'demand:101',
      label: 'Demanda',
      citation: 'demand:101',
      displayText: 'Revisar o plano trimestral',
    },
    {
      key: 'routine_template:202',
      label: 'Rotina',
      citation: 'Rotina 202',
      displayText: 'Revisar a agenda diária',
    },
  ]);
});

test('chat evidence renders untrusted display text only as data and never creates a URL', () => {
  const references = getChatSourceReferences([{
    evidence: [{
      sourceType: 'demand',
      sourceId: '303',
      displayText: '<img src=x onerror=alert(1)>',
      citationRef: 'demand:303',
      url: 'javascript:alert(1)',
    }],
  }]);
  const source = readFileSync(new URL('../../../src/pages/ChatPage.jsx', import.meta.url), 'utf8');

  assert.equal(references[0].displayText, '<img src=x onerror=alert(1)>');
  assert.deepEqual(Object.keys(references[0]).sort(), ['citation', 'displayText', 'key', 'label']);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|href=|window\.open/iu);
});

test('chat evidence is capped at six references and rejects non-reference records', () => {
  const evidence = [{
    items: Array.from({ length: 10 }, (_, index) => ({
      sourceRef: { kind: 'task', id: String(index + 1) },
    })),
  }];
  const references = getChatSourceReferences(evidence);

  assert.equal(references.length, 6);
  assert.deepEqual(getChatSourceReferences([{ sourceId: 'without-type-or-citation' }]), []);
});
