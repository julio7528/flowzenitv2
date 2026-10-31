import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createAgentApiDevMiddleware } from '../../../server/dev/agentApiDevMiddleware.js';

async function withMiddleware(loadHandler, run) {
  const middleware = createAgentApiDevMiddleware({ loadHandler });
  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end('vite fallback');
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
  }
}

test('development middleware adapts the chat request and forwards the handler response', async () => {
  let observedRequest;

  await withMiddleware(async () => async request => {
    observedRequest = {
      method: request.method,
      pathname: new URL(request.url).pathname,
      search: new URL(request.url).search,
      contentType: request.headers.get('content-type'),
      body: await request.json(),
    };
    return new Response(JSON.stringify({ outcome: 'completed' }), {
      status: 202,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-agent-response': 'forwarded',
      },
    });
  }, async origin => {
    const response = await fetch(`${origin}/api/agent/turn?source=chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'O que está pendente?' }),
    });

    assert.equal(response.status, 202);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-agent-response'), 'forwarded');
    assert.deepEqual(await response.json(), { outcome: 'completed' });
    assert.deepEqual(observedRequest, {
      method: 'POST',
      pathname: '/api/agent/turn',
      search: '?source=chat',
      contentType: 'application/json',
      body: { message: 'O que está pendente?' },
    });
  });
});

test('development middleware returns a safe JSON error when loading the handler fails', async () => {
  await withMiddleware(async () => {
    throw new Error('deepseek-private-error sentinel');
  }, async origin => {
    const response = await fetch(`${origin}/api/agent/turn`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Oi' }),
    });
    const bodyText = await response.text();

    assert.equal(response.status, 500);
    assert.match(response.headers.get('content-type'), /application\/json/i);
    assert.match(bodyText, /INTERNAL_ERROR/);
    assert.doesNotMatch(bodyText, /deepseek-private-error|sentinel|stack/i);
  });
});

test('development middleware leaves unrelated Vite paths to the next middleware', async () => {
  let handlerLoads = 0;

  await withMiddleware(async () => {
    handlerLoads += 1;
    return async () => new Response('unexpected');
  }, async origin => {
    const response = await fetch(`${origin}/interno/chat`);

    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /text\/plain/i);
    assert.equal(await response.text(), 'vite fallback');
    assert.equal(handlerLoads, 0);
  });
});
