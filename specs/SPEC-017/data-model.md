# Data Model: Local Vite Agent API

This feature introduces no persisted data and no database changes.

| Transient item | Fields | Lifecycle |
| --- | --- | --- |
| Agent request | Existing chat request JSON, method, URL, and headers | Forwarded in memory to the existing `api/agent/turn.js` handler for one HTTP request. |
| Agent response | Existing status, headers, and JSON body | Forwarded in memory back to the chat client for one HTTP response. |
| Local server configuration | Existing provider and Supabase environment values | Read by the Node development process only; never returned or added to browser runtime values. |

No transcript, credential, new Supabase row, migration, grant, or RLS policy is part of this model.
