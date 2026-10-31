import test from 'node:test';
import assert from 'node:assert/strict';
import productionAgentTurnHandler from '../../../api/agent/turn.js';

const SYNTHETIC_ENVIRONMENT = Object.freeze({
  SUPABASE_URL: 'https://synthetic-project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key',
  DEEPSEEK_API_KEY: 'synthetic-deepseek-test-key',
});
const SYNTHETIC_DEMAND_ID = '900000000000000001';
const SYNTHETIC_CREATED_TASK_ID = '900000000000000004';

test('production route composes its server graph and reaches a mocked DeepSeek response', async () => {
  const environmentNames = Object.keys(SYNTHETIC_ENVIRONMENT);
  const previousEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const providerRequests = [];

  for (const [name, value] of Object.entries(SYNTHETIC_ENVIRONMENT)) process.env[name] = value;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.deepseek.com');
    providerRequests.push({ path: url.pathname, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({
      id: 'chatcmpl-synthetic-production-route',
      object: 'chat.completion',
      created: 1,
      model: 'deepseek-flash',
      choices: [{
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'Synthetic production route answer.' },
      }],
      usage: { prompt_tokens: 5, completion_tokens: 4, total_tokens: 9 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const isolatedRoute = (await import('../../../api/agent/turn.js?spec006-write-route-test')).default;
    const response = await isolatedRoute(new Request('http://localhost/api/agent/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Synthetic production route question.' }),
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.outcome, 'completed');
    assert.equal(body.answer.text, 'Synthetic production route answer.');
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0].path, '/chat/completions');
    assert.equal(providerRequests[0].body.model, 'deepseek-flash');
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of environmentNames) {
      const previousValue = previousEnvironment.get(name);
      if (previousValue === undefined) delete process.env[name];
      else process.env[name] = previousValue;
    }
  }
});

test('production route inserts a task through Supabase JS and reports only the confirmed read-back ID', async () => {
  const environmentNames = Object.keys(SYNTHETIC_ENVIRONMENT);
  const previousEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const requests = [];
  const parent = {
    id: SYNTHETIC_DEMAND_ID,
    demanda: 'Synthetic demand',
    tipo: 1,
    raizid: null,
    status: 'Backlog',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  };
  const created = {
    id: SYNTHETIC_CREATED_TASK_ID,
    demanda: 'Prepare the planning session',
    tipo: 2,
    raizid: SYNTHETIC_DEMAND_ID,
    status: 'Backlog',
    data_exec: null,
    hora_inicio: null,
    hora_fim: null,
  };

  for (const [name, value] of Object.entries(SYNTHETIC_ENVIRONMENT)) process.env[name] = value;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    requests.push({ origin: url.origin, path: url.pathname, search: url.search, method, body: init.body ?? null });

    if (url.origin === 'https://api.deepseek.com') {
      return new Response(JSON.stringify({
        id: 'chatcmpl-synthetic-create-task',
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-flash',
        choices: [{
          index: 0,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'synthetic-create-task',
              type: 'function',
              function: {
                name: 'create_task',
                arguments: JSON.stringify({ name: 'Prepare the planning session', parentId: SYNTHETIC_DEMAND_ID }),
              },
            }],
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    assert.equal(url.origin, 'https://synthetic-project.supabase.co');
    assert.equal(url.pathname, '/rest/v1/demandas');
    if (method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), {
        demanda: 'Prepare the planning session',
        tipo: 2,
        raizid: SYNTHETIC_DEMAND_ID,
      });
      return new Response(JSON.stringify([{ id: SYNTHETIC_CREATED_TASK_ID }]), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }

    const idFilter = url.searchParams.get('id');
    if (idFilter === `eq.${SYNTHETIC_DEMAND_ID}`) {
      return new Response(JSON.stringify([parent]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (idFilter === `eq.${SYNTHETIC_CREATED_TASK_ID}`) {
      return new Response(JSON.stringify([created]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.fail(`Unexpected synthetic Supabase query: ${url.search}`);
  };

  try {
    const isolatedRoute = (await import('../../../api/agent/turn.js?spec007-create-routine-route-test')).default;
    const response = await isolatedRoute(new Request('http://localhost/api/agent/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: `Crie uma tarefa na demanda ${SYNTHETIC_DEMAND_ID}.` }),
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.outcome, 'completed');
    assert.equal(body.answer.text, `Cadastro confirmado: tarefa (ID ${SYNTHETIC_CREATED_TASK_ID}).`);
    assert.equal(requests.filter(item => item.origin === 'https://api.deepseek.com').length, 1);
    const supabaseRequests = requests.filter(item => item.origin === 'https://synthetic-project.supabase.co');
    assert.deepEqual(supabaseRequests.map(item => item.method), ['GET', 'POST', 'GET']);
    assert.ok(supabaseRequests.every(item => item.path === '/rest/v1/demandas'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of environmentNames) {
      const previousValue = previousEnvironment.get(name);
      if (previousValue === undefined) delete process.env[name];
      else process.env[name] = previousValue;
    }
  }
});

test('production route creates one routine template through Supabase JS and confirms its exact ID', async () => {
  const environmentNames = Object.keys(SYNTHETIC_ENVIRONMENT);
  const previousEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const requests = [];
  const created = {
    id: '900000000000000021',
    demanda: 'Study planning',
    hora: '09:00:00',
    hora_fim: null,
    dias_semana: [1, 5],
    data_inicial: '2026-10-30',
    data_final: '2026-11-06',
  };

  for (const [name, value] of Object.entries(SYNTHETIC_ENVIRONMENT)) process.env[name] = value;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    if (url.origin === 'https://api.deepseek.com') {
      const body = JSON.parse(init.body);
      requests.push({ origin: url.origin, path: url.pathname, body });
      assert.ok(body.tools.some(({ function: definition }) => definition.name === 'create_routine_series'));
      return new Response(JSON.stringify({
        id: 'chatcmpl-synthetic-create-routine',
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-flash',
        choices: [{
          index: 0,
          finish_reason: 'tool_calls',
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'synthetic-create-routine',
              type: 'function',
              function: {
                name: 'create_routine_series',
                arguments: JSON.stringify({
                  name: 'Study planning',
                  weekdaysISO: [5, 1],
                  startDate: '2026-10-30',
                  endDate: '2026-11-06',
                  startTime: '09:00',
                }),
              },
            }],
          },
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    assert.equal(url.origin, 'https://synthetic-project.supabase.co');
    assert.equal(url.pathname, '/rest/v1/recorrente');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('apikey'), SYNTHETIC_ENVIRONMENT.SUPABASE_PUBLISHABLE_KEY);
    requests.push({ origin: url.origin, path: url.pathname, method, search: url.search });
    if (method === 'POST') {
      assert.deepEqual(JSON.parse(init.body), {
        demanda: 'Study planning',
        hora: '09:00:00',
        hora_fim: null,
        dias_semana: [1, 5],
        data_inicial: '2026-10-30',
        data_final: '2026-11-06',
      });
      return new Response(JSON.stringify([{ id: created.id }]), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    assert.equal(url.searchParams.get('id'), `eq.${created.id}`);
    return new Response(JSON.stringify([created]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const isolatedRoute = (await import('../../../api/agent/turn.js?spec007-query-routine-route-test')).default;
    const response = await isolatedRoute(new Request('http://localhost/api/agent/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Crie uma rotina de estudo nas segundas e sextas, de 30/10/2026 a 06/11/2026, às 09:00.',
      }),
    }));
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify({ body, requests }));
    assert.equal(body.outcome, 'completed');
    assert.equal(body.answer.text, `Cadastro confirmado: rotina (ID ${created.id}).`);
    const supabaseRequests = requests.filter(item => item.origin === 'https://synthetic-project.supabase.co');
    assert.deepEqual(supabaseRequests.map(item => item.method), ['POST', 'GET']);
    assert.ok(supabaseRequests.every(item => item.path === '/rest/v1/recorrente'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of environmentNames) {
      const previousValue = previousEnvironment.get(name);
      if (previousValue === undefined) delete process.env[name];
      else process.env[name] = previousValue;
    }
  }
});

test('production route exposes the typed routine query and reads applicable templates without writes', async () => {
  const environmentNames = Object.keys(SYNTHETIC_ENVIRONMENT);
  const previousEnvironment = new Map(environmentNames.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const providerRequests = [];
  const supabaseRequests = [];
  const routine = {
    id: '900000000000000022',
    demanda: 'Synthetic routine',
    hora: '09:00:00',
    hora_fim: null,
    dias_semana: [5],
    data_inicial: '2026-10-30',
    data_final: '2026-10-30',
  };

  for (const [name, value] of Object.entries(SYNTHETIC_ENVIRONMENT)) process.env[name] = value;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === 'https://api.deepseek.com') {
      const body = JSON.parse(init.body);
      providerRequests.push({ body });
      assert.ok(body.tools.some(({ function: definition }) => definition.name === 'getRoutineTemplates'));
      assert.ok(body.tools.some(({ function: definition }) => definition.name === 'create_routine_series'));
      assert.ok(body.tools.every(({ function: definition }) => (
        !['edit_routine_series', 'delete_routine_series', 'create_occurrence'].includes(definition.name)
      )));
      const message = providerRequests.length === 1
        ? {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'synthetic-query-routines',
            type: 'function',
            function: {
              name: 'getRoutineTemplates',
              arguments: JSON.stringify({ date: '2026-10-30' }),
            },
          }],
        }
        : { role: 'assistant', content: 'Há uma rotina aplicável nesta data.' };
      return new Response(JSON.stringify({
        id: `chatcmpl-synthetic-routine-query-${providerRequests.length}`,
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-flash',
        choices: [{
          index: 0,
          finish_reason: providerRequests.length === 1 ? 'tool_calls' : 'stop',
          message,
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    assert.equal(url.origin, 'https://synthetic-project.supabase.co');
    assert.equal(url.pathname, '/rest/v1/recorrente');
    supabaseRequests.push({ method: init.method ?? 'GET', search: url.search });
    assert.equal(init.method ?? 'GET', 'GET');
    assert.equal(url.searchParams.get('data_inicial'), 'lte.2026-10-30');
    assert.equal(url.searchParams.get('data_final'), 'gte.2026-10-30');
    assert.equal(url.searchParams.get('dias_semana'), 'cs.{5}');
    return new Response(JSON.stringify([routine]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await productionAgentTurnHandler(new Request('http://localhost/api/agent/turn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Quais rotinas se aplicam em 30/10/2026?' }),
    }));
    const body = await response.json();

    assert.equal(response.status, 200, JSON.stringify({ body, providerRequests, supabaseRequests }));
    assert.equal(body.outcome, 'completed');
    assert.equal(body.answer.text, 'Há uma rotina aplicável nesta data.');
    assert.equal(providerRequests.length, 2);
    assert.equal(supabaseRequests.length, 1);
    assert.deepEqual(supabaseRequests.map(item => item.method), ['GET']);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of environmentNames) {
      const previousValue = previousEnvironment.get(name);
      if (previousValue === undefined) delete process.env[name];
      else process.env[name] = previousValue;
    }
  }
});
