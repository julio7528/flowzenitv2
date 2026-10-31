# SPEC-012 quickstart

## POC validation

1. Run `npm test`, focused chat contracts, `npm run lint`, and `npm run build`.
2. Start the existing app locally with `npm run dev` and open the chat page.
3. Check a question with source evidence, an empty result, a clarification, a confirmed create response, and an uncertain network outcome.
4. Check keyboard-only submission and focus, then inspect widths 1440, 820, and 390 pixels.
5. Confirm active chat is not written to localStorage, sessionStorage, URL, or Supabase; confirm the public POC and configured-model disclosure is visible.

Do not deploy. Record the commands and actual browser observations in the active SDD gates.

## Automated validation — 2026-10-30

| Check | Command | Result |
| --- | --- | --- |
| Full suite | `npm.cmd test` | Exit 0; 451 tests, 448 passed, 3 skipped, 0 failed. |
| Chat contracts | `node --test tests/unit/chat/agent-api.test.js tests/unit/chat/chat-state.test.js tests/unit/chat/chat-evidence.test.js` | Exit 0; 15 passed, 0 failed. |
| Lint | `npm.cmd run lint` | Exit 0 (`oxlint`), no warnings. |
| Production build | `npm.cmd run build` | Exit 0; Vite 8.3.5, 170 modules transformed; chat JS 14.60 kB and CSS 9.38 kB. |

The chat API contract verifies the same-origin endpoint, eight-message/8,192-byte request bounds, strict response shape, safe errors, and cancellation. Chat-state tests distinguish clarification, empty results, confirmed create, uncertain result, and cancellation. Source references are allowlisted data rendered as text.

## Browser smoke — 2026-10-30

Ran the chat in local headless Edge against Vite at `127.0.0.1:5173`. The browser intercepted all five `/api/agent/turn` requests and returned synthetic results; no real agent request, Supabase call, or database write occurred.

| Scenario | Observed result |
| --- | --- |
| Route and POC disclosure | `/interno/chat` loaded and the disclosure was visible. |
| Keyboard and pending | Composer received focus; Enter submitted; pending/disabled state appeared before the mocked response. |
| Source evidence | Expanded reference was visible; untrusted `<img...>` text rendered as text, with no image element. |
| Empty result | `Nenhum registro encontrado` label appeared for a complete empty result. |
| Clarification | `Preciso de um detalhe` state and follow-up question appeared. |
| Synthetic create | Confirmation UI appeared only for the mocked server response `Cadastro confirmado: tarefa (ID 810).`; this was not a real write. |
| Uncertain request | Network failure showed `Resultado incerto` and advised checking before retrying. |
| Responsive widths | 1440: document 1440 px; 820: document 805 px; 390: document 390 px. No horizontal overflow. |
| Mobile timer | Pomodoro dock uses normal flow on chat; no overlap with the last assistant message. |
| Persistence and calls | No chat keys in local/session storage, no query/hash transcript, five mocked endpoint calls, zero unexpected API calls, and zero Supabase calls. |

## Client boundary — 2026-10-30

`node --test tests/security/agent/client-boundary.test.js` passed (1/1). `node scripts/security/scan-client-assets.js dist` passed with a process-only synthetic sentinel: 24 assets scanned and zero sentinel hits. A targeted scan of the chat JS chunk found zero provider credential, server-agent, or Supabase client markers. `git diff --check` exited 0.
