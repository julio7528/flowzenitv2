# Local Development Agent API Contract

## Route

- **Method**: `POST`
- **Path**: `/api/agent/turn`
- **Origin**: Same origin as the Vite development UI
- **Handler**: Existing `api/agent/turn.js`

## Request and response

- The request body and JSON shape remain the SPEC-012 chat-client contract.
- The bridge adapts the incoming Node HTTP request to the handler's existing Fetch `Request` contract.
- The handler's HTTP status, JSON response body, and safe response headers are passed back to the browser.
- Unsupported methods and invalid input use the handler's existing safe JSON error response.
- A bridge/import failure produces a generic safe JSON failure without a stack trace, credential, or raw exception.

## Scope and configuration

- The bridge exists only in the Vite development server and does not change the Vercel function.
- Only this exact route is intercepted; all other requests continue through Vite.
- Server configuration remains in the Node process. The client prefix stays `VITE_`; provider secrets are never provided via `define` or `import.meta.env`.
- The handler continues to use the currently configured Supabase project and existing access policy.
