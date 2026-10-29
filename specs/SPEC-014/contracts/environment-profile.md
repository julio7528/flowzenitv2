# Environment Profile Contract: SPEC-014

**Status**: Draft configuration contract; it does not select Vercel settings, a CI host, region, plan, runtime, or database project.

## Logical profiles

| Profile | Intended use | Database/provider permissions |
| --- | --- | --- |
| `local-development` | UI and deterministic local development | Synthetic fixtures/local database only; no production secrets. |
| `ci-test` | CI lint/build/unit/contract/security/evaluation | No production DB/provider credentials; network denied by default; isolated target only after SPEC-013 guard. |
| `preview` | Future review of a built candidate | Dedicated non-production project and environment-scoped secrets only if approved. Private agent features stay disabled until DEC-001. |
| `staging` | Optional long-lived pre-production role | Availability/mapping depends on CI/Vercel plan and configuration; not assumed to exist. |
| `production` | User-facing deployment | Separate least-privilege secrets and explicit human publication; protected private features require verified DEC-001. |

## Variable classification

- **Public browser configuration**: only intentionally public `VITE_*` values (for example, the public Supabase URL/key). Their visibility is expected, not secret.
- **Server-only secrets**: Supabase Secret/service role, DeepSeek, Gemini, LangSmith, Tavily, CI artifact/signing and any future deploy credential. These must not use `VITE_*`, enter browser bundles/source maps, or be exposed to normal test jobs.
- **Synthetic CI values**: sentinel strings and fake adapter configuration. Never use a real credential to test redaction.

## Environment separation

- Scope values to one environment; do not copy production variables into Preview/Development by default.
- Secret change applies to future deployment/build according to platform behavior; a release report must identify the revision/deployment that received the value without recording it.
- Provider integration keys do not enable capabilities; DEC-006, DEC-010, DEC-012, owning SPEC gates, and feature flags still apply.
- Do not treat Vercel Deployment Protection as the agent's owner authentication. It may control deployment URL access but does not resolve DEC-001's server gate by itself.
