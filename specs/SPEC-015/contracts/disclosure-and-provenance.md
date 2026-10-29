# Disclosure, Provenance, and Injection Boundary — SPEC-015

**Status:** Draft proposal; follows DEC-001, DEC-005, and DEC-006 without resolving them.

## Preflight policy order

1. Resolve the server-registered search capability; default to disabled.
2. Confirm a current public-web intent. Internal facts route to their owning SPEC or deny if that capability is blocked.
3. Classify query fields and origin. Remove no content silently: reject/rephrase if private or ambiguous content is present.
4. Require the SPEC-001 access gate and applicable DEC-006 policy before any FlowZenit-derived content could be considered. While DEC-006 is pending, the allowlist contains no FlowZenit data.
5. Validate bounded request shape, then dispatch only through the server adapter.
6. Validate and sanitize provider response, retain provenance in the turn, and return a safe outcome.

Explicit user consent is not a substitute for DEC-006 approval. The model cannot decide that a field is public, erase its provenance, or grant itself permission to send it.

## Retrieved-content treatment

- Provider text, snippets, titles, and external pages are untrusted content, separated from server-authored policy and domain instructions.
- Prompt-injection screening is defense in depth. A detection signal may cause safe refusal or omission but absence of a signal never grants trust.
- External content cannot request secrets, private records, SQL, new capabilities, confirmation bypass, or writes. No HTML or script interpretation is allowed.
- Each displayed source links only to its validated URL and is labeled external with retrieval time where available.
- External facts are not re-described as FlowZenit-verified facts. If source evidence conflicts or is insufficient, report the limitation.

## Evidence event fields

Proposed SPEC-010 event fields: correlation reference, registered tool/version, query class, policy version, decision/outcome category, elapsed time, source count, and safe provider category. Raw query, snippets, credentials, response bodies, and sensitive URL parameters are excluded unless a future DEC-005/006 decision explicitly approves a narrowly scoped field.

## Test cases

Use synthetic public queries and provider doubles. Include indirect/direct prompt injection, private-name and schedule sentinels, disabled feature, ambiguous/mixed request, invalid URL, malformed fields, empty/duplicate sources, timeout, provider failure, throttling, and insufficient/conflicting evidence. Capture outbound payloads in the fake adapter and assert the allowlist. No live provider call or production data is used.

