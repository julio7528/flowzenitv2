import { Readable } from 'node:stream';
import { createSafeErrorResponse, SAFE_ERROR_CODES } from '../agent/http/errors.js';

export const AGENT_API_DEV_PATH = '/api/agent/turn';

const LOCAL_ORIGIN = 'http://vite.local';
const FORWARDED_REQUEST_HEADERS = Object.freeze(['accept', 'content-length', 'content-type']);
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

function requestUrl(request) {
  try {
    return new URL(request.url || '/', LOCAL_ORIGIN);
  } catch {
    return null;
  }
}

function createFetchRequest(incoming, url, signal) {
  const method = String(incoming.method || 'GET').toUpperCase();
  const headers = new Headers();

  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = incoming.headers?.[headerName];
    if (typeof value === 'string') headers.set(headerName, value);
    else if (Array.isArray(value)) headers.set(headerName, value.join(', '));
  }

  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? Readable.toWeb(incoming) : undefined;
  const init = { method, headers, signal };
  if (body) {
    init.body = body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

function safeBridgeFailureResponse() {
  const failure = createSafeErrorResponse(SAFE_ERROR_CODES.INTERNAL_ERROR, 'unavailable');
  return new Response(JSON.stringify(failure.body), {
    status: failure.status,
    headers: JSON_HEADERS,
  });
}

async function writeFetchResponse(outgoing, response) {
  if (outgoing.destroyed || outgoing.writableEnded) return;

  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  const body = Buffer.from(await response.arrayBuffer());
  outgoing.end(body);
}

/**
 * Adapt one Node HTTP request to the existing Fetch-style agent handler.
 * `loadHandler` is injected so the adapter contract can be tested without
 * importing model, Supabase, or provider configuration.
 */
export function createAgentApiDevMiddleware({ loadHandler } = {}) {
  if (typeof loadHandler !== 'function') {
    throw new TypeError('A development agent handler loader is required.');
  }

  return async function agentApiDevMiddleware(incoming, outgoing, next) {
    const url = requestUrl(incoming);
    if (!url || url.pathname !== AGENT_API_DEV_PATH) {
      next();
      return;
    }

    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    const abortResponse = () => {
      if (!outgoing.writableEnded) controller.abort();
    };
    incoming.once('aborted', abortRequest);
    outgoing.once('close', abortResponse);

    try {
      const handler = await loadHandler();
      if (typeof handler !== 'function') throw new TypeError('Agent handler unavailable.');
      const request = createFetchRequest(incoming, url, controller.signal);
      const response = await handler(request);
      if (!(response instanceof Response)) throw new TypeError('Agent handler returned an invalid response.');
      await writeFetchResponse(outgoing, response);
    } catch {
      try {
        await writeFetchResponse(outgoing, safeBridgeFailureResponse());
      } catch {
        if (!outgoing.destroyed && !outgoing.writableEnded) outgoing.end();
      }
    } finally {
      incoming.removeListener('aborted', abortRequest);
      outgoing.removeListener('close', abortResponse);
    }
  };
}

/** Register the existing Vercel-style handler only in Vite's dev server. */
export function createAgentApiDevPlugin() {
  return {
    name: 'flowzenit-agent-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createAgentApiDevMiddleware({
        loadHandler: async () => {
          const module = await server.ssrLoadModule('/api/agent/turn.js');
          return module.default;
        },
      }));
    },
  };
}
