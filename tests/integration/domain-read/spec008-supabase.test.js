import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { createReadRepository } from '../../../server/domain/read/repository.js';
import { searchItems } from '../../../server/domain/read/search.js';

const RUN_FLAG = 'RUN_SPEC008_SUPABASE_CONTRACT';
const PREFLIGHT_FLAG = 'RUN_SPEC008_SUPABASE_PREFLIGHT';
const PROJECT_REF = 'twikxeloeftczwbpjvzr';
const RUN_MARKER = 'sdd-spec008-46a17bc7-20261030';
const BASE_ID = 9927026350067000n;
const FIXTURE_IDS = Object.freeze(
  Array.from({ length: 9 }, (_, index) => (BASE_ID + BigInt(index)).toString()),
);

function makeFixtureRows() {
  const [rootId, taskId, subtaskId, percentId, percentNearId,
    underscoreId, underscoreNearId, backslashId, backslashNearId] = FIXTURE_IDS;
  return [
    { id: rootId, demanda: `${RUN_MARKER}-hierarchy-root`, tipo: 1, raizid: null },
    { id: taskId, demanda: `${RUN_MARKER}-hierarchy-task`, tipo: 2, raizid: rootId },
    { id: subtaskId, demanda: `${RUN_MARKER}-hierarchy-subtask`, tipo: 3, raizid: taskId, status: 'Executando' },
    { id: percentId, demanda: `${RUN_MARKER}-literal%needle`, tipo: 1, raizid: null },
    { id: percentNearId, demanda: `${RUN_MARKER}-literalXneedle`, tipo: 1, raizid: null },
    { id: underscoreId, demanda: `${RUN_MARKER}-under_score`, tipo: 1, raizid: null },
    { id: underscoreNearId, demanda: `${RUN_MARKER}-underXscore`, tipo: 1, raizid: null },
    { id: backslashId, demanda: `${RUN_MARKER}-back\\slash`, tipo: 1, raizid: null },
    { id: backslashNearId, demanda: `${RUN_MARKER}-backXslash`, tipo: 1, raizid: null },
  ];
}

function assertSafeRequest(result, message) {
  if (result?.error) throw new Error(message);
  return result;
}

async function queryExactIds(client) {
  return assertSafeRequest(
    await client.from('demandas')
      .select('id::text')
      .in('id', FIXTURE_IDS)
      .limit(FIXTURE_IDS.length),
    'Exact-ID preflight or cleanup verification failed.',
  );
}

async function queryMarkerCount(client) {
  return assertSafeRequest(
    await client.from('demandas')
      .select('id::text', { count: 'exact', head: true })
      .ilike('demanda', `%${RUN_MARKER}%`),
    'Run-marker preflight or cleanup verification failed.',
  );
}

async function capturePossibleInsert(client, row, capturedRows) {
  const { data, error } = await client.from('demandas')
    .select('id::text,demanda,tipo,raizid::text')
    .eq('id', row.id)
    .limit(1)
    .maybeSingle();
  if (error || !data) return;
  if (data.demanda === row.demanda && data.tipo === row.tipo && data.raizid === row.raizid) {
    capturedRows.push({ id: row.id, parentId: row.raizid, kind: row.tipo });
  }
}

async function insertAndCapture(client, row, capturedRows) {
  const { data, error } = await client.from('demandas')
    .insert(row)
    .select('id::text,demanda,tipo,raizid::text')
    .single();
  if (error || !data) {
    await capturePossibleInsert(client, row, capturedRows);
    throw new Error('Synthetic fixture insert failed; cleanup remains restricted to verified run IDs.');
  }

  capturedRows.push({ id: row.id, parentId: row.raizid, kind: row.tipo });
  assert.equal(data.id, row.id, 'PostgREST must preserve the exact decimal bigint ID.');
  assert.equal(data.demanda, row.demanda);
  assert.equal(data.tipo, row.tipo);
  assert.equal(data.raizid, row.raizid, 'PostgREST must preserve the parent ID.');
}

async function verifyAndDeleteCapturedRows(client, capturedRows) {
  let cleanupFailed = false;
  for (const row of [...capturedRows].reverse()) {
    const { data, error } = await client.from('demandas')
      .select('id::text,demanda,tipo,raizid::text')
      .eq('id', row.id)
      .limit(1)
      .maybeSingle();
    if (error) {
      cleanupFailed = true;
      continue;
    }
    if (!data) continue;
    if (!data.demanda.startsWith(RUN_MARKER)
      || data.tipo !== row.kind
      || data.raizid !== row.parentId) {
      cleanupFailed = true;
      continue;
    }
    const { error: deleteError } = await client.from('demandas').delete().eq('id', row.id);
    if (deleteError) cleanupFailed = true;
  }

  const remainingIds = await queryExactIds(client);
  const markerCount = await queryMarkerCount(client);
  assert.equal(cleanupFailed, false, 'Exact-ID synthetic cleanup encountered a mismatch or error.');
  assert.equal(remainingIds.data.length, 0, 'A run-specific fixture ID remains after cleanup.');
  assert.equal(markerCount.count, 0, 'A run-specific marker remains after cleanup.');
}

test('SPEC-008 search reads current Supabase rows and preserves literal matching and provenance', {
  skip: process.env[RUN_FLAG] !== '1'
    ? `Set ${RUN_FLAG}=1 to run the synthetic SPEC-008 Supabase/PostgREST contract.`
    : false,
}, async () => {
  const environment = loadEnv('test', process.cwd(), 'VITE_');
  const url = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  assert.ok(url && publishableKey, 'VITE Supabase URL and publishable key are required.');
  assert.equal(new URL(url).hostname, `${PROJECT_REF}.supabase.co`, 'Refusing an unexpected Supabase project.');

  const client = createClient(url, publishableKey, {
    db: { schema: 'public' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const repository = createReadRepository(client);
  const rows = makeFixtureRows();
  const capturedRows = [];
  let writePhaseStarted = false;

  const schemaProbe = await client.from('demandas')
    .select('id::text,demanda,tipo,raizid::text,status,data_exec,hora_inicio,hora_fim')
    .limit(0);
  assert.ok(!schemaProbe.error, 'The existing public.demandas PostgREST projection is unavailable.');
  const exactIds = await queryExactIds(client);
  const markerCount = await queryMarkerCount(client);
  assert.equal(exactIds.data.length, 0, 'A synthetic fixture ID candidate already exists.');
  assert.equal(markerCount.count, 0, 'The run-specific fixture marker already exists.');

  if (process.env[PREFLIGHT_FLAG] === '1') return;

  try {
    writePhaseStarted = true;
    for (const row of rows) await insertAndCapture(client, row, capturedRows);

    const markerResult = await searchItems(repository, { text: RUN_MARKER, pageSize: 20 });
    assert.deepEqual(markerResult.items.map((item) => item.id).sort(), [...FIXTURE_IDS].sort());
    const byId = new Map(markerResult.candidates.map((candidate) => [candidate.id, candidate]));
    const root = byId.get(FIXTURE_IDS[0]);
    const task = byId.get(FIXTURE_IDS[1]);
    const subtask = byId.get(FIXTURE_IDS[2]);
    assert.deepEqual(root.sourceRef, { kind: 'demand', id: FIXTURE_IDS[0] });
    assert.deepEqual(task.sourceRef, { kind: 'task', id: FIXTURE_IDS[1] });
    assert.deepEqual(task.hierarchyContext.map((entry) => entry.sourceRef), [root.sourceRef]);
    assert.deepEqual(subtask.sourceRef, { kind: 'subtask', id: FIXTURE_IDS[2] });
    assert.deepEqual(subtask.hierarchyContext.map((entry) => entry.sourceRef), [
      root.sourceRef,
      task.sourceRef,
    ]);

    const percent = await searchItems(repository, { text: `${RUN_MARKER}-literal%needle`, kinds: ['demand'] });
    assert.deepEqual(percent.items.map((item) => item.id), [FIXTURE_IDS[3]]);
    const underscore = await searchItems(repository, { text: `${RUN_MARKER}-under_score`, kinds: ['demand'] });
    assert.deepEqual(underscore.items.map((item) => item.id), [FIXTURE_IDS[5]]);
    const backslash = await searchItems(repository, { text: `${RUN_MARKER}-back\\slash`, kinds: ['demand'] });
    assert.deepEqual(backslash.items.map((item) => item.id), [FIXTURE_IDS[7]]);

    const updatedName = `${RUN_MARKER}-literal-updated`;
    const updateResult = await client.from('demandas')
      .update({ demanda: updatedName })
      .eq('id', FIXTURE_IDS[3])
      .select('id::text,demanda')
      .single();
    assertSafeRequest(updateResult, 'Synthetic fixture update failed.');
    assert.equal(updateResult.data.id, FIXTURE_IDS[3]);
    assert.equal(updateResult.data.demanda, updatedName);
    const oldQuery = await searchItems(repository, { text: `${RUN_MARKER}-literal%needle`, kinds: ['demand'] });
    assert.deepEqual(oldQuery.items.map((item) => item.id), []);
    const updatedQuery = await searchItems(repository, { text: updatedName, kinds: ['demand'] });
    assert.deepEqual(updatedQuery.items.map((item) => item.id), [FIXTURE_IDS[3]]);

    const deletedId = FIXTURE_IDS[8];
    const deleteResult = await client.from('demandas').delete()
      .eq('id', deletedId)
      .select('id::text')
      .single();
    assertSafeRequest(deleteResult, 'Synthetic fixture delete failed.');
    assert.equal(deleteResult.data.id, deletedId);
    const capturedIndex = capturedRows.findIndex((row) => row.id === deletedId);
    assert.notEqual(capturedIndex, -1);
    capturedRows.splice(capturedIndex, 1);
    const deletedQuery = await searchItems(repository, { text: `${RUN_MARKER}-backXslash`, kinds: ['demand'] });
    assert.deepEqual(deletedQuery.items.map((item) => item.id), []);
  } finally {
    if (writePhaseStarted) await verifyAndDeleteCapturedRows(client, capturedRows);
  }
});
