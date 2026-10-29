import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';
import { createReadRepository } from '../../../server/domain/read/repository.js';

const RUN_FLAG = 'RUN_SPEC004_SUPABASE_CONTRACT';
const PROJECT_REF = 'twikxeloeftczwbpjvzr';
const RUN_MARKER = 'sdd-spec004-fdafac5f-7521-4e83-9051-c1b9badeec3e';
const TEST_DATE = '2099-11-10';
const BASE_ID = 9927026350032428n;
const FIXTURE_IDS = Object.freeze(
  Array.from({ length: 13 }, (_, index) => (BASE_ID + BigInt(index)).toString()),
);

function makeFixtureRows() {
  const [rootId, taskId, subtaskId, percentId, percentNearId,
    underscoreId, underscoreNearId, backslashId, backslashNearId,
    accentedId, plainId, sameNameIdA, sameNameIdB] = FIXTURE_IDS;
  const composedAccent = String.fromCodePoint(0x00e9);

  return [
    { id: rootId, demanda: `${RUN_MARKER}-hierarchy-root`, tipo: 1, raizid: null },
    {
      id: taskId,
      demanda: `${RUN_MARKER}-hierarchy-task`,
      tipo: 2,
      raizid: rootId,
      data_exec: TEST_DATE,
    },
    {
      id: subtaskId,
      demanda: `${RUN_MARKER}-hierarchy-subtask`,
      tipo: 3,
      raizid: taskId,
      status: 'Executando',
      data_exec: TEST_DATE,
      hora_inicio: '08:00:00',
      hora_fim: '09:00:00',
    },
    { id: percentId, demanda: `${RUN_MARKER}-pct%needle`, tipo: 1, raizid: null },
    { id: percentNearId, demanda: `${RUN_MARKER}-pctXneedle`, tipo: 1, raizid: null },
    { id: underscoreId, demanda: `${RUN_MARKER}-under_needle`, tipo: 1, raizid: null },
    { id: underscoreNearId, demanda: `${RUN_MARKER}-underXneedle`, tipo: 1, raizid: null },
    { id: backslashId, demanda: `${RUN_MARKER}-slash\\needle`, tipo: 1, raizid: null },
    { id: backslashNearId, demanda: `${RUN_MARKER}-slashXneedle`, tipo: 1, raizid: null },
    { id: accentedId, demanda: `${RUN_MARKER}-caf${composedAccent}`, tipo: 1, raizid: null },
    { id: plainId, demanda: `${RUN_MARKER}-cafe`, tipo: 1, raizid: null },
    { id: sameNameIdA, demanda: `${RUN_MARKER}-same-name`, tipo: 1, raizid: null },
    { id: sameNameIdB, demanda: `${RUN_MARKER}-same-name`, tipo: 1, raizid: null },
  ];
}

function assertSafeRequest(result, message) {
  if (result?.error) throw new Error(message);
  return result;
}

async function queryExactIds(client, tableName, ids) {
  return assertSafeRequest(
    await client.from(tableName).select('id::text').in('id', ids).limit(ids.length),
    'Synthetic collision preflight failed; no fixtures were written.',
  );
}

async function queryMarkerCount(client, tableName) {
  return assertSafeRequest(
    await client.from(tableName)
      .select('id::text', { count: 'exact', head: true })
      .ilike('demanda', `%${RUN_MARKER}%`),
    'Run-marker preflight failed; no fixtures were written.',
  );
}

async function queryDateCount(client) {
  return assertSafeRequest(
    await client.from('demandas')
      .select('id::text', { count: 'exact', head: true })
      .eq('data_exec', TEST_DATE),
    'Selected-date preflight failed; no fixtures were written.',
  );
}

async function capturePossibleAmbiguousInsert(client, row, capturedRows) {
  const { data, error } = await client.from('demandas')
    .select('id::text,demanda,tipo,raizid::text')
    .eq('id', row.id)
    .limit(1)
    .maybeSingle();

  if (error || !data) return;
  const expectedParentId = row.raizid;
  if (data.demanda === row.demanda
    && data.tipo === row.tipo
    && data.raizid === expectedParentId) {
    capturedRows.push({ id: row.id, parentId: expectedParentId });
  }
}

async function insertAndCapture(client, row, capturedRows) {
  const { data, error } = await client.from('demandas')
    .insert(row)
    .select('id::text,demanda,tipo,raizid::text')
    .single();

  if (error || !data) {
    await capturePossibleAmbiguousInsert(client, row, capturedRows);
    throw new Error('Synthetic fixture insert failed; cleanup was restricted to verified run records.');
  }

  // Explicit IDs were proven absent immediately before writes. Capture the exact
  // submitted ID and parent link before assertions so `finally` can clean up
  // even when the PostgREST bigint projection is the failing assertion.
  capturedRows.push({ id: row.id, parentId: row.raizid });
  assert.equal(data.id, row.id, 'PostgREST must project bigint IDs as exact decimal strings.');
  assert.equal(data.raizid, row.raizid, 'PostgREST must project parent bigint IDs as exact decimal strings.');
  return data;
}

async function verifyAndDeleteCapturedRows(client, capturedRows) {
  let deleteFailed = false;
  for (const row of [...capturedRows].reverse()) {
    const { error } = await client.from('demandas').delete().eq('id', row.id);
    if (error) deleteFailed = true;
  }

  const remainingIds = await queryExactIds(client, 'demandas', FIXTURE_IDS);
  const demandMarker = await queryMarkerCount(client, 'demandas');
  const routineMarker = await queryMarkerCount(client, 'recorrente');
  assert.equal(deleteFailed, false, 'Exact-ID synthetic cleanup returned an error.');
  assert.equal(remainingIds.data.length, 0, 'A captured synthetic ID remains after cleanup.');
  assert.equal(demandMarker.count, 0, 'A run-marker demand remains after cleanup.');
  assert.equal(routineMarker.count, 0, 'A run-marker routine remains after cleanup.');
}

test('PostgREST preserves synthetic bigint IDs and literal ILIKE pattern behavior', {
  skip: process.env[RUN_FLAG] !== '1'
    ? `Set ${RUN_FLAG}=1 to run the owner-authorized SPEC-004 development Supabase contract.`
    : false,
}, async () => {
  const environment = loadEnv('test', process.cwd(), 'VITE_');
  const url = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  assert.ok(url && publishableKey, 'VITE Supabase URL and publishable key are required.');

  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.hostname, `${PROJECT_REF}.supabase.co`, 'Refusing writes to an unexpected Supabase project.');

  const client = createClient(url, publishableKey, {
    db: { schema: 'public' },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const repository = createReadRepository(client);
  const rows = makeFixtureRows();
  const capturedRows = [];
  let writePhaseStarted = false;

  // Read-only preflight is constrained to the exact candidate ID range,
  // run-specific marker, and a date confirmed empty before fixture insertion.
  const schemaProbes = await Promise.all([
    client.from('demandas')
      .select('id::text,demanda,tipo,raizid::text,status,data_exec,hora_inicio,hora_fim')
      .limit(0),
    client.from('recorrente')
      .select('id::text,demanda,hora,hora_fim,dias_semana,data_inicial,data_final')
      .limit(0),
  ]);
  assert.ok(schemaProbes.every((result) => !result.error), 'Required public table projections are unavailable.');

  const demandIds = await queryExactIds(client, 'demandas', FIXTURE_IDS);
  const routineIds = await queryExactIds(client, 'recorrente', FIXTURE_IDS);
  const demandMarker = await queryMarkerCount(client, 'demandas');
  const routineMarker = await queryMarkerCount(client, 'recorrente');
  const dateProbe = await queryDateCount(client);
  assert.equal(demandIds.data.length, 0, 'Synthetic bigint ID candidate already exists in demandas.');
  assert.equal(routineIds.data.length, 0, 'Synthetic bigint ID candidate already exists in recorrente.');
  assert.equal(demandMarker.count, 0, 'Run marker already exists in demandas.');
  assert.equal(routineMarker.count, 0, 'Run marker already exists in recorrente.');
  assert.equal(dateProbe.count, 0, 'Selected synthetic date already contains demand records.');

  try {
    writePhaseStarted = true;
    for (const row of rows) await insertAndCapture(client, row, capturedRows);

    const root = await repository.getItemById(FIXTURE_IDS[0]);
    const task = await repository.getItemById(FIXTURE_IDS[1]);
    const subtask = await repository.getItemById(FIXTURE_IDS[2]);
    assert.equal(root.id, FIXTURE_IDS[0]);
    assert.equal(root.raizid, null);
    assert.equal(task.id, FIXTURE_IDS[1]);
    assert.equal(task.raizid, FIXTURE_IDS[0]);
    assert.equal(subtask.id, FIXTURE_IDS[2]);
    assert.equal(subtask.raizid, FIXTURE_IDS[1]);

    const hierarchyChildren = await repository.getChildren(FIXTURE_IDS[0], {
      kind: 'task',
      pageSize: 10,
    });
    assert.deepEqual(hierarchyChildren.items.map((item) => item.id), [FIXTURE_IDS[1]]);

    const daily = await repository.getDailySchedule({ date: TEST_DATE, pageSize: 10 });
    assert.deepEqual(daily.items.map((item) => item.id), [FIXTURE_IDS[2]]);
    assert.equal(daily.items[0].data_exec, TEST_DATE);

    const filteredSubtask = await repository.searchItems({
      text: `${RUN_MARKER}-hierarchy-subtask`,
      kinds: ['subtask'],
      statuses: ['Executando'],
      parentId: FIXTURE_IDS[1],
    });
    assert.deepEqual(filteredSubtask.items.map((item) => item.id), [FIXTURE_IDS[2]]);

    const markerSearch = await repository.searchItems({ text: RUN_MARKER, pageSize: 50 });
    assert.deepEqual(markerSearch.items.map((item) => item.id).sort(), [...FIXTURE_IDS].sort());

    const percentSearch = await repository.searchItems({
      text: `${RUN_MARKER}-pct%needle`,
      kinds: ['demand'],
    });
    assert.deepEqual(percentSearch.items.map((item) => item.id), [FIXTURE_IDS[3]]);
    const underscoreSearch = await repository.searchItems({
      text: `${RUN_MARKER}-under_needle`,
      kinds: ['demand'],
    });
    assert.deepEqual(underscoreSearch.items.map((item) => item.id), [FIXTURE_IDS[5]]);
    const backslashSearch = await repository.searchItems({
      text: `${RUN_MARKER}-slash\\needle`,
      kinds: ['demand'],
    });
    assert.deepEqual(backslashSearch.items.map((item) => item.id), [FIXTURE_IDS[7]]);

    const sameNameSearch = await repository.searchItems({
      text: `${RUN_MARKER}-same-name`,
      kinds: ['demand'],
      pageSize: 10,
    });
    assert.deepEqual(sameNameSearch.items.map((item) => item.id), [FIXTURE_IDS[11], FIXTURE_IDS[12]]);

    const caseInsensitiveSearch = await repository.searchItems({
      text: RUN_MARKER.toUpperCase(),
      pageSize: 50,
    });
    assert.deepEqual(caseInsensitiveSearch.items.map((item) => item.id).sort(), [...FIXTURE_IDS].sort());

    const accent = String.fromCodePoint(0x00e9);
    const accentedSearch = await repository.searchItems({
      text: `${RUN_MARKER}-caf${accent}`,
      kinds: ['demand'],
    });
    const plainSearch = await repository.searchItems({
      text: `${RUN_MARKER}-cafe`,
      kinds: ['demand'],
    });
    assert.deepEqual(accentedSearch.items.map((item) => item.id), [FIXTURE_IDS[9]]);
    assert.deepEqual(plainSearch.items.map((item) => item.id), [FIXTURE_IDS[10]]);

    await assert.rejects(
      repository.searchItems({ text: RUN_MARKER, query: 'select * from demandas' }),
      (error) => error?.code === 'INVALID_INPUT',
    );
  } finally {
    if (writePhaseStarted) await verifyAndDeleteCapturedRows(client, capturedRows);
  }
});
