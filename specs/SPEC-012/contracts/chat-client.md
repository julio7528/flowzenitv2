# Chat client contract — SPEC-012@2

The React chat sends same-origin JSON requests to POST /api/agent/turn. A request contains the current user message and at most 8 prior user/assistant messages from the active chat; the total body remains within the route's 8,192-byte limit.

The client keeps messages in React memory only. It does not write the transcript to localStorage, sessionStorage, URL parameters, analytics, or Supabase. It never calls DeepSeek or Supabase directly.

Render validated answer text, safe source references, and explicit loading, empty, clarification, failed, cancelled, and uncertain-write states. A disabled pending composer prevents duplicate submission. Show the public-access and provider data-flow notice beside the composer.
