# Implementation Plan: Agent Data Integration Foundation

**SPEC ID**: SPEC-001 | **Version**: 2 | **Manifest hash**: atribuído ao criar um lote  
**Branch**: main (preservada; nenhuma branch criada) | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)  
**Status**: Draft — planejamento da integração mínima, sem decisão técnica adicional.

## Summary

A SPEC-001 passa a cobrir a integração mínima do agente com o Supabase já usado pelo FlowZenit. O desenho preserva a aplicação React/Vite, o cliente e as permissões existentes, sem criar autenticação, sessão, MFA, tela, BFF de autenticação ou mudança de banco.

A SPEC-001 define as fronteiras entre a conexão de dados existente e as capacidades que serão entregues por outras SPECs: consultas tipadas em SPEC-004; execução do agente em SPEC-002; RAG em SPEC-008/SPEC-009; e escrita/recorrências em SPEC-005/SPEC-006/SPEC-007. Chaves privilegiadas e de provedores não podem ser expostas ao frontend. A confirmação de escrita permanece conforme DEC-009.

O acesso público/anônimo existente permanece inalterado nesta SPEC e é registrado como risco não resolvido. A passkey client-side é apenas um gate de navegação, não autentica o proprietário no servidor. Nenhuma capacidade de agente que leia dados privados ou execute operações privilegiadas pode ser exposta até que um controle de acesso adequado seja aprovado, implementado e verificado. Este plano não escolhe esse mecanismo.

## Technical Context

**Language/Version**: JavaScript ESM; React 19 e Vite 8.  
**Primary Dependencies**: @supabase/supabase-js 2.118.0 já instalado. Nenhuma dependência nova é proposta por SPEC-001.  
**Storage**: Supabase PostgreSQL existente, schema public e tabelas atuais; nenhuma tabela ou coluna alterada.  
**Testing**: npm test com node --test; npm run lint com oxlint; npm run build com Vite. Não há E2E/Playwright declarado no package.json.  
**Target Platform**: Aplicação React/Vite atual e a execução do agente definida em SPEC-002. Runtime, região e limites Vercel continuam conforme DEC-010 e não serão decididos por SPEC-001.  
**Project Type**: Aplicação web existente, sem migração de framework ou camada adicional de autenticação.  
**Performance Goals**: Nenhuma meta numérica nova. Consultas e recuperação devem manter os limites definidos pelas SPECs que as implementam.  
**Constraints**: Reutilizar projeto/conexão/grants atuais; não criar telas, autenticação, schema, grants ou RLS; proteger credenciais privilegiadas no servidor; preservar dados, rotas e confirmações existentes.

## Baseline Observado

- src/lib/supabase.js cria o cliente de navegador com @supabase/supabase-js, URL e chave publicável VITE_, schema public, persistSession=false, sem fluxo Supabase Auth.
- vite.config.js tem envPrefix VITE_; valores com esse prefixo podem chegar ao bundle e devem continuar sendo exclusivamente publicáveis.
- src/App.jsx mantém o gate de passkey na navegação interna por sessionStorage. Este mecanismo será preservado e não será elevado a autenticação de API.
- Não há API/server de produto identificado no checkout. Este plano propõe uma fronteira server-side para capacidades futuras do agente, mas a implementação dos handlers e do runtime continua com SPEC-002. A proposta não é uma decisão de runtime aprovada nem cria um BFF de autenticação.
- Migrações concedem operações de dados a anon em tabelas existentes. Essa exposição não foi resolvida nem é aceita como base de acesso por novas capacidades do agente; SPEC-001 não modifica grants, políticas ou schema.
- As chaves do LLM, embedding e observabilidade pertencem aos ambientes das capacidades que as usam e não podem ser embutidas no frontend.
- O status remoto do Supabase não foi alterado nem inspecionado nesta revisão documental.

## Architecture Decision and Boundaries

### Integração proposta

1. Manter o cliente e o projeto Supabase existentes como a referência da conexão.
2. O runtime de SPEC-002 compõe as chamadas ao banco com os contratos tipados de SPEC-004; não recebe SQL, nome de tabela ou coluna arbitrária do modelo.
3. Consultas semânticas delegam ao índice/retriever de SPEC-008/SPEC-009. A fonte relacional existente continua sendo a autoridade para dados transacionais.
4. Escritas e interpretação temporal permanecem em SPEC-006/SPEC-007 e mantêm as confirmações definidas por DEC-009 e SPEC-005.
5. Configuração pública continua separada de credenciais privilegiadas: nenhuma chave administrativa ou de provedor entra em arquivos client-side, VITE_ variables, bundles, source maps ou logs do navegador.
6. Não se implementam Supabase Auth, novas sessões, MFA, cadastro, owner UUID ou outra autenticação nesta etapa; nenhum método futuro de controle de acesso é escolhido aqui. Endpoints do agente para dados privados e operações privilegiadas ficam indisponíveis até que um controle adequado seja aprovado, implementado e verificado.
7. O navegador manterá o acesso atual do produto e não encaminhará consultas existentes da aplicação para uma API nova nesta SPEC. A API proposta é uma fronteira futura para capacidades do agente, com chamadas de mesma origem e sem leitura/escrita privada enquanto o gate DEC-001 estiver fechado.

### Alternativas excluídas pela decisão atual

- Supabase Auth/IdP externo, nova passkey de identidade, login por senha/OTP, MFA, cadastro e novas sessões: não serão implementados nesta etapa. A forma de controle de acesso futuro permanece uma decisão em aberto e é pré-requisito para habilitar capacidades protegidas do agente.
- BFF dedicado exclusivamente a autenticação: fora do escopo. A execução de modelo e ferramentas permanece na arquitetura definida por SPEC-002.
- Nenhuma nova RLS, grant ou role é criada por este plano. As permissões existentes não são tratadas como controles adequados para expor dados privados por endpoints de agente; qualquer mudança futura exige planejamento e aprovação separados.
- Migração das tabelas funcionais para adicionar owner_id ou outro modelo de propriedade: fora do escopo e sem decisão aprovada.

## Dependencies and Contracts

- **Prerequisite SPECs**: nenhuma.
- **Execution**: SPEC-002 é responsável pelo runtime e por manter credenciais de provedor fora do navegador.
- **Domain queries**: SPEC-004 é responsável pelas operações de consulta tipadas.
- **Writes and confirmations**: SPEC-005/SPEC-006/SPEC-007 mantêm política e comportamento de confirmação aprovados.
- **RAG**: SPEC-008/SPEC-009 definem indexação e recuperação semântica; SPEC-001 não duplica essas capacidades.
- **External data**: DEC-006 continua a controlar quais campos podem ser enviados a provedores. Isso é uma decisão de divulgação de dados, não uma exigência de autenticação.
- **Runtime**: DEC-010 segue pendente para detalhes de ambiente e deploy; SPEC-001 não seleciona nova infraestrutura.
- **Database changes**: nenhuma migração ou alteração de grants/policies/tabelas nesta SPEC.
- **Access-control prerequisite**: o acesso anônimo atual e a passkey somente no frontend permanecem sem alteração e não são controles de identidade verificáveis pelo servidor. O método futuro não está escolhido; capacidades do agente com dados privados ou operações privilegiadas permanecem bloqueadas até aprovação, implementação e verificação de controle adequado.

## Technical Questions Still Needed by the Owning SPECs

Estas questões são de planejamento; nenhuma autoriza uma solução de autenticação. Antes de implementar qualquer endpoint protegido, o usuário deverá aprovar um controle de acesso adequado; este plano não escolhe o mecanismo:

1. SPEC-002 valida a fronteira proposta de API server-side, define os handlers e confirma em qual processo a conexão Supabase será usada pelo runtime do agente, sem incluir chaves privilegiadas no navegador. A opção Vercel Node Functions em `/api` é apenas uma recomendação para avaliação; DEC-010 segue pendente.
2. SPEC-004 define os contratos de consulta exatos, limites de resultado, filtros e tratamento de registros indisponíveis. Os grants atuais servem para caracterizar o comportamento existente em fixtures isoladas, mas não autorizam leituras privadas por endpoints do agente.
3. SPEC-008/SPEC-009 definem como RAG e os dados relacionais se combinam e como estado de índice desatualizado é comunicado.
4. SPEC-005/SPEC-006 definem os fluxos de confirmação para cada operação de escrita, conforme DEC-009.
5. DEC-006 define campos permitidos e tratamento externo antes de dados reais do FlowZenit serem enviados a DeepSeek, Gemini ou LangSmith.
6. DEC-010 define runtime/região/limites de produção quando a implementação exigir essa configuração.
7. DEC-012 define limites contra abuso e orçamento de chamadas; payload limits, timeouts e quotas numéricas permanecem com SPEC-002/DEC-012.

Não há solução aprovada para controle de acesso futuro, e esta SPEC não adiciona MFA, sessão, cadastro ou UUID do proprietário.

## Server-side API Design Proposal (not an approved runtime decision)

### Boundary and request flow

The proposed boundary is an agent-only, same-origin HTTP API separated from the existing React/Vite bundle. The existing FlowZenit pages may continue using the current browser Supabase client; this SPEC does not migrate those queries. A future agent request would flow through a thin HTTP adapter, strict request validation, a fail-closed DEC-001 capability gate, an owning SPEC's typed capability, and a sanitized response. No route or private capability is enabled by this plan.

Vercel Node.js Functions in a root `/api` directory are the recommended candidate because the project already uses Vercel and JavaScript ESM, and Vercel documents this integration for Vite projects. This is a technical recommendation only. SPEC-002 must validate the build/development integration and DEC-010 must settle runtime, region, duration, deployment settings, and any background-work need before implementation or activation. No Vercel configuration or dependency is changed by this plan.

The passkey and `sessionStorage` value are client-side navigation state only. The proposed server boundary must not accept them as evidence of owner identity. Until adequate access control is separately approved, implemented, and verified, the gate remains closed and handlers must not call Supabase for private data, invoke providers with private data, or perform writes.

### Proposed module organization

The layout below is a planning proposal, not a set of created files. SPEC-002 owns agent runtime and route handlers; SPEC-001 owns the cross-cutting integration/security contract. Shared server modules must remain outside Vite's client entry graph.

~~~text
api/                         # future thin Vercel HTTP entrypoints, owned by SPEC-002
server/http/                  # request parsing, response envelope, error mapping
server/security/              # fail-closed capability gate; no auth mechanism selected
server/observability/         # request correlation and redaction helpers
server/supabase/              # no private-data client until access gate is satisfied
server/capabilities/          # adapters to SPEC-004/005/006/007/008/009 contracts
src/lib/                      # current browser app; future same-origin API client only if needed
tests/unit/                   # validators, gate, errors, redaction
tests/contracts/              # API and cross-SPEC contracts
tests/security/               # asset secret scan and disabled-capability checks
~~~

Do not put shared helper modules as deployable function entrypoints under `/api` unless Vercel's routing/build behavior is explicitly verified. Do not import server modules from React components or any Vite client entry.

### Integration contracts

- Browser-to-server: same-origin HTTPS request to an operation owned by SPEC-002; no direct provider call, privileged database key, SQL, table name, or arbitrary column selection from the browser/model. Exact paths, HTTP methods, DTOs, body limits, and streaming behavior remain for SPEC-002/SPEC-012 planning.
- Server request: parse JSON under a bounded, configurable limit; validate an allowlisted capability DTO before dispatch. Unknown fields and unsupported operations are rejected. Numeric body/time limits are not selected here.
- Server-to-domain: exact reads call SPEC-004's typed contract; semantic retrieval composes with SPEC-008/SPEC-009; writes remain in SPEC-006/SPEC-007 and preserve DEC-009 confirmation. The API does not create parallel query, RAG, or write logic.
- Server-to-Supabase: no service-role/Secret credential is an identity or authorization substitute. The current anonymous grants do not qualify as a private-data authorization path. Until the DEC-001 gate is satisfied, no private Supabase call is permitted from an agent handler. Any later client/factory must use the approved access context and least privilege; its exact construction belongs to SPEC-002/SPEC-004 and the approved security design.
- Time/domain: use the existing entities and rules from DEC-002; time values follow IANA `America/Cuiaba` from DEC-003. No independent commitment entity is introduced.
- Browser response: distinguish a successful empty result from configuration, dependency, validation, and disabled-capability outcomes. Return only fields allowed by the owning typed contract.

### Secrets and environment separation

`VITE_*` and the configured Vite `envPrefix` are client-visible build inputs; they may hold only intentionally public configuration. Provider credentials and any privileged database credential belong only in server runtime environment variables, never in `VITE_*`, client imports, browser storage, emitted assets, source maps, or client logs. The existing publishable Supabase key is not a privileged secret, but its presence does not grant safe server access to private records. Never use a Secret/service_role key to bypass the missing owner access control.

Server secrets should be read at runtime through the selected hosting environment's server-only configuration. Avoid copying production values into local `.env` files or test fixtures. Tests use sentinel values and synthetic credentials; logs and errors must not serialize environment objects, request headers, raw provider errors, or Supabase client configuration.

### Error handling and observability

The following error codes and envelope are proposed for validation in SPEC-002; they are not yet an approved public API contract:

~~~json
{ "error": { "code": "CAPABILITY_DISABLED", "message": "Capability unavailable" }, "requestId": "server-generated-id" }
~~~

Candidate codes are `INVALID_REQUEST`, `CONFIGURATION_UNAVAILABLE`, `DEPENDENCY_UNAVAILABLE`, `CAPABILITY_DISABLED`, and `INTERNAL`. A successful empty query remains a successful response with an empty collection. Exact HTTP status mapping is left to SPEC-002; raw stack traces, SQL, keys, provider response bodies, and private record values are never returned to the browser.

The server generates one correlation/request ID per invocation and passes it through internal layers. Logs may contain the request ID, operation identifier, outcome category, duration, and dependency category only. Do not log request/response bodies, prompts, chat transcripts, task text, credentials, cookies, authorization headers, or row contents. Persistent trace/audit fields, retention, external processing, and LangSmith disclosure remain subject to DEC-005/DEC-006 and SPEC-010; this plan approves no retention or external telemetry policy.

### Verification strategy

- Unit: strict DTO validation, capability gate default-closed behavior, error mapping, request-ID propagation, and redaction using synthetic inputs.
- Security/integration: exercise the internal boundary with synthetic requests and injected spies/doubles. Confirm malformed or unsupported input is rejected, error categories are distinct and secret-free, and the closed access gate stops before any Supabase/provider call or side effect. This is the required authorization/integration check for this security-sensitive SPEC.
- Security: assert that a request with the browser passkey state but no verified server control cannot read private data or cause side effects; assert arbitrary SQL/table/column inputs are rejected; scan built browser assets/source maps using unique synthetic secret sentinels.
- Product database: direct Supabase/database integration is NOT APPLICABLE to the current scope: no route, query/tool handler, server Supabase client, schema, grant, RLS policy, or persisted product behavior is introduced. The required synthetic security/integration test proves no database call occurs while the gate is closed. If implementation scope adds database interaction, this classification is invalidated and an isolated non-production test must be planned before that work.
- Cross-SPEC: T012 performs a repeatable documentation review of SPEC-002, SPEC-004, and SPEC-005 (and the other named owning SPECs) against `contracts/agent-api-boundary.md`; it records source paths, boundary findings, status, and follow-up in `checklists/requirements.md`. It does not require implementing another SPEC or use runtime contract doubles for capabilities that do not exist in this scope.
- UI: no new UI or existing route migration in SPEC-001. Run UI checks only if a later approved implementation changes a visible flow.

### Entry and completion criteria

**Entry for any implementation run**: the exact SPEC-001 version must be included in a user-approved batch manifest and admitted by `$sdd-run`; the implementation must stay within this scope. Before any private/privileged capability is enabled, adequate access control must be separately approved, implemented, and verified. DEC-010 must be resolved before selecting production runtime/deployment details; DEC-005/006/009 apply to retention, provider disclosure, and writes respectively.

**Completion for the closed-gate foundation**: existing React routes, passkey navigation behavior, browser Supabase client, schema, grants, and policies remain unchanged; server/client boundaries and error/log contracts are implemented only within approved scope; the secret-sentinel build scan is clean; automated tests pass for validation, fail-closed behavior, error/log redaction, and the applicable synthetic boundary checks; T012 records documentary contract consistency and follow-ups; direct product-database integration is recorded as NOT APPLICABLE with the scope-based justification above. SC-001 remains NOT VERIFIED until its separate access-control prerequisite and isolated typed-query test are actually satisfied. SC-004/SC-005 documentary ownership may be confirmed, but their runtime delegation/confirmation behavior remains NOT VERIFIED until owning capabilities and tests exist. Never treat foundation completion as proof of server-side owner authentication or as authorization to enable protected capabilities. If the supervisor requires every success criterion to be PASS before completion, stop with any such criterion unresolved and obtain the user's decision rather than bypassing that rule.

### Capability readiness matrix

| State | Capabilities |
| --- | --- |
| Can be prepared without private access | API/module boundary documentation; request and error DTO validation; closed-by-default gate; synthetic unit/contract/security tests; server/client secret separation; correlation and redaction helpers. Any implementation still requires an approved batch. |
| Can function safely with current approval | Existing React/Vite application and its current access path; local unit/build checks and synthetic doubles. These do not establish server identity. |
| Must remain disabled | Agent endpoints returning private FlowZenit data; private Supabase reads; writes or other privileged operations; private RAG/index retrieval; private chat history/memory; provider calls carrying private FlowZenit content; dashboard/private trace access. |
| Depends on future decisions/gates | Access-control mechanism and verification (DEC-001 follow-up, mechanism unselected); runtime/region/duration/background processing (DEC-010); retention/deletion/export (DEC-005); external provider fields and handling (DEC-006); write confirmations (DEC-009); abuse/request/tool-call limits (DEC-012); exact provider/model configuration (DEC-011 and owning SPECs). |

## Quality Gates

### Quality-gate matrix

| Gate | Required | Task owner | Verification method | Required evidence | Pass condition | Applicability |
| --- | --- | --- | --- | --- | --- | --- |
| QG-01 Lint | Yes | T013 | `npm run lint` | Exact command, exit code, concise result in the authorized SDD run | Exit code `0`; no new lint violations | Applicable to this SPEC |
| QG-02 Production build | Yes | T013 | `npm run build` | Exact command, exit code, concise result in the authorized SDD run | Exit code `0` | Applicable to this SPEC |
| QG-03 Unit tests | Yes | T002–T007, T009, T011, T013 | `npm test` using Node's test runner and synthetic fixtures | Exact command, exit code, and test summary; no private data in output | Exit code `0`; all in-scope unit assertions pass | Applicable to this SPEC |
| QG-04 Fail-closed security/integration | Yes | T001–T003, T008, T013 | Send synthetic requests through the gate/helper boundary with spies for Supabase, providers, and side effects; include absent/disabled/unverified gate and browser passkey state | Test output and assertion summary proving no downstream calls, no private result, and no side effect | All denied cases stop before any Supabase/provider call; zero private records and zero side effects | Applicable and mandatory under Constitution Principle IV's proportional checks for security-sensitive work |
| QG-05 Client-asset secret scan | Yes | T009, T010, T013 | Build with a synthetic `SPEC001_SCAN_SENTINEL`; run `node scripts/security/scan-client-assets.js dist`; scan assets and source maps when present | Exact commands, exit codes, scan summary, and confirmation that matched values are not printed | Build succeeds and the unique sentinel is absent from all scanned client assets/maps | Applicable to this SPEC |
| QG-06 Cross-SPEC contract consistency | Yes | T012 | Read the named SPEC documents and owning contracts; compare responsibility, access-gate order, typed-read ownership, and policy/confirmation boundary against `contracts/agent-api-boundary.md`; record the result table in `checklists/requirements.md` | Document paths and relevant headings/requirement IDs; `PASS`, `FAIL`, or `NOT VERIFIED` for each boundary; concise follow-up for version drift | No behavioral/security contradiction; missing DTO/runtime detail is `NOT VERIFIED`; stale version references are explicitly recorded and assigned to their owning SPEC, not silently fixed here | Applicable as documentary review; does not require downstream implementation |
| QG-07 Direct product-database integration | No — NOT APPLICABLE | T008 (negative-path evidence); T014 (record classification) | Confirm scope introduces no route, Supabase query, server database client, persistence, schema/grant/RLS change; the QG-04 spies prove zero database calls with the gate closed | Scope-based checklist rationale plus QG-04 test evidence; no live database connection is made | Classify as `NOT APPLICABLE`, never `PASS`; if database behavior enters scope, re-plan an isolated non-production test before proceeding | Not applicable to this SPEC's current scope. Constitution Principle IV requires proportional checks, and its authorization/integration requirement is met by QG-04; AGENTS.md isolation rules govern any future database test |
| QG-08 SC-001 post-gate query equivalence | Conditional | No task in this closed-gate foundation; follow-up only after the DEC-001 prerequisite | After adequate access control is separately approved, implemented, and verified, compare approved typed-query fixtures against persisted values in an isolated target | Actual isolated-target test command/result and source comparison, recorded only after execution | Exact values match the existing Supabase source and app behavior | Not applicable while the gate is closed; current criterion status is `NOT VERIFIED`, not `PASS` and not removed |
| QG-09 UI/E2E/accessibility | Conditional | No task unless visible UI changes are separately added to scope | Existing UI smoke/E2E only if a visible flow or route is changed | Exact command and result if triggered | Relevant regression checks pass; no new UI is introduced by this SPEC | Not applicable to the current no-UI scope |
| QG-10 SC-004/SC-005 runtime delegation and confirmation | Conditional | T012 verifies documentary ownership only; runtime verification belongs to the owning SPEC tasks | Once the owning runtime/query/retrieval/write capabilities exist, run their contract tests to prove delegation without duplication and preserve confirmation behavior | Actual owner-SPEC test command/result and contract evidence, recorded when those tasks execute | Runtime calls delegate to the owning capabilities and write confirmations remain enforced | NOT VERIFIED by SPEC-001's document review; not implemented in this SPEC. Do not mark SC-004/SC-005 runtime behavior PASS from T012 alone |

The matrix describes planned obligations, not results from this documentation turn. In the future SDD run, record command/method, actual exit code, concise non-sensitive evidence, and gate state in the persisted SDD evidence. Never mark an unexecuted or conditional check as PASS. Record QG-07's non-applicability and its reason in the checklist; do not convert it into a passing database test. Do not record credentials, private rows, prompts, transcripts, or raw provider payloads.

Testes não devem criar tenants, organizações ou usuários adicionais. Testes de banco continuam isolados e nunca devem apontar para produção ou limpar dados amplos. O acesso público/anônimo existente é um risco não resolvido; testes devem comprovar que ele não habilita endpoints de agente para dados privados sem o controle de acesso pré-requisitado.

## Decisions and Risks

### Decisão aprovada

DEC-001 revisada: aplicação pessoal de usuário único, passkey e acesso existentes preservados, sem nova autenticação nesta etapa. A passkey client-side não valida o proprietário no servidor. O risco anon permanece não resolvido e não autoriza endpoints de agente para dados privados ou operações privilegiadas; um controle de acesso adequado é requisito futuro, ainda sem solução escolhida.

### Riscos e bloqueios de acesso

- A passkey atual protege apenas a navegação do frontend e não valida chamadas de API.
- Migrações existentes permitem operações anon em dados do produto. O acesso pode ser feito fora da interface.
- Enquanto um controle de acesso adequado não for aprovado, implementado e verificado, nenhum endpoint de agente pode expor dados privados ou executar operações privilegiadas.
- Nenhuma credencial Secret/service_role pode substituir a verificação de acesso do proprietário; credenciais privilegiadas continuam server-only.
- Dados enviados a provedores externos permanecem sujeitos a DEC-006; manter a passkey atual não aprova divulgação externa de conteúdo.
- A escolha do controle de acesso futuro não é parte desta decisão nem está aprovada por este plano.

## Execution and Recovery Plan

A SPEC continua Draft e não inicia execução. Quando aprovada em lote:

1. SPEC-002 implementa o runtime na arquitetura existente e usa a conexão Supabase aprovada.
2. SPEC-004 fornece consultas tipadas baseadas nas tabelas e permissões atuais.
3. SPEC-008/SPEC-009 fornecem indexação e recuperação semântica sem duplicação em SPEC-001.
4. SPEC-005/SPEC-006/SPEC-007 mantêm política e confirmação de escrita.
5. Quality gates verificam compatibilidade, segredos e o bloqueio de endpoints privados sem aplicar migrações de autenticação ou RLS.
6. Evidências registram separadamente o risco existente e os controles não implementados. Nenhum teste deve alegar que o acesso público foi resolvido ou que a passkey identifica o proprietário no servidor.

O lote SDD continuará sujeito às regras de execução sequencial, limites e autorização do usuário. `tasks.md` registra apenas o trabalho planejado e não constitui aprovação nem autorização de implementação.

## Project Structure

### Documentation (this feature)

~~~text
specs/SPEC-001/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── contracts/agent-api-boundary.md
└── checklists/requirements.md
~~~

Somente documentos de planejamento são criados/atualizados por este trabalho. Nenhum código, schema, política, dependência ou configuração funcional será alterado.

### Source Code

The current checkout has no product `api/` or server module. The proposed future source layout is `api/` for thin SPEC-002 entrypoints, `server/http/`, `server/security/`, `server/observability/`, `server/supabase/`, and `server/capabilities/` for shared server modules, `src/lib/` for browser-only calls, and `tests/unit/`, `tests/contracts/`, and `tests/security/` for verification. These are design paths only; no source files are created by this planning task. Existing browser Supabase use remains with the current application until another approved SPEC changes it.

## Official References

- Supabase API key distinctions and RLS behavior: [API keys](https://supabase.com/docs/guides/getting-started/api-keys).
- PostgreSQL grants and exposed API behavior: [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).
- Vite client environment exposure: [Env Variables and Modes](https://vite.dev/guide/env-and-mode) and [Shared Options](https://vite.dev/config/shared-options).
- Vercel functions with Vite and the root `api/` convention: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js), and [local development](https://vercel.com/docs/cli/dev).
- Vercel runtime choices, region, and duration remain a pending DEC-010 decision: [runtime configuration](https://vercel.com/docs/functions/configuring-functions), [regions](https://vercel.com/docs/functions/configuring-functions/region), and [maximum duration](https://vercel.com/docs/functions/configuring-functions/duration).

