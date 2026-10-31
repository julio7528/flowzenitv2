# Research: Local Vite Agent API

## Findings

- `package.json` runs plain Vite for `npm run dev`.
- `vite.config.js` currently registers only the React plugin and keeps `envPrefix` set to `VITE_`.
- The chat calls same-origin `POST /api/agent/turn`; the existing route is a Fetch-style handler that uses the configured DeepSeek and Supabase integration.
- Vite's development server supports a `configureServer` plugin hook for middleware. The hook is not called for production builds, which keeps a development-only bridge out of production behavior. [Vite Plugin API](https://vite.dev/guide/api-plugin.html)
- Vite does not place `.env*` values into `process.env` while evaluating the config. If the Node handler needs those values, the config must load them explicitly with `loadEnv`. `envPrefix` controls which values are exposed through `import.meta.env`; it must remain restricted to `VITE_`. [Vite Config](https://vite.dev/config/), [Vite Shared Options](https://vite.dev/config/shared-options)
- Read-only probe on 2026-10-30: the current Vite server returned `404` without a JSON content type for a malformed `POST /api/agent/turn`. The separate temporary handler returned `400 application/json` for the same invalid input. No provider call or database operation was made by these malformed-input probes.

## Decisions

### Use a Vite-only development middleware around the existing handler

- **Decision**: Add a development plugin/middleware that adapts the local HTTP request and response to the existing Fetch handler at `api/agent/turn.js`.
- **Rationale**: This makes the requested `npm run dev` workflow use the chat's current same-origin route and avoids a second backend command, added package, Docker, or local database.
- **Alternatives considered**: `vercel dev` would require a separate CLI workflow; implementing a second agent server would duplicate the existing handler and response rules.

### Load only the handler's server environment and retain Vite's client boundary

- **Decision**: Load the existing local environment for the Node-side handler and make only the required values available in the server process. Keep `envPrefix: 'VITE_'` and do not add secret values to `define` or browser-facing configuration.
- **Rationale**: The existing agent reads provider/Supabase configuration from `process.env`; Vite's standard browser env exposure is a separate boundary.
- **Alternatives considered**: Renaming server secrets to `VITE_*` would expose them to client code and is rejected.

### Validate with a read-only real chat question

- **Decision**: Use one read-only question against the configured Supabase project as the live acceptance smoke; use test doubles for malformed requests and error handling.
- **Rationale**: This demonstrates the real local route end to end while avoiding any fixture or test writes in the POC database.
- **Alternatives considered**: Docker/local PostgreSQL and direct database URLs are unnecessary for this route bridge and were explicitly excluded by the owner.
