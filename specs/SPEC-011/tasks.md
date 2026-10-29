---
description: "Tarefas implementáveis propostas para SPEC-011; Draft, sem autorização de execução."
---

# Tarefas: SPEC-011 — Dashboard de observabilidade

**Entradas**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md.  
**Pré-requisitos**: SPEC-010 com read contracts estáveis; SPEC-001/002 mantêm o gate server-side. Implementação depende de lote SDD exato e explicitamente aprovado. DEC-001 bloqueia dados privados; DEC-005/006 limitam campos e lifecycle. DEC-010/012 mantêm limites e cache sem valores definidos.  
**Estado**: tarefas propostas para futuro. Nenhuma tarefa é executada nesta revisão. Não alterar o dashboard inicial, CRUD, dados reais, Supabase, SDD supervisor ou comportamento da passkey.

## Convenções e bloqueios

- [P] indica caminhos graváveis disjuntos e sem dependência direta.
- [US1], [US2], [US3] mapeiam as histórias do spec.md.
- Perfis são sugestões de competência, não atribuições nem autorização de agentes.
- A rota usa a navegação existente somente para consistência visual; passkey/sessionStorage não são autorização de API.
- Todas as respostas e testes usam fixtures sintéticas. RAG/evaluations são fontes opcionais, não habilitação de recursos.

## Fase 1 — Estrutura e contratos compartilhados

- [ ] T001 [P] Criar fixtures sintéticas de execuções, spans, audit events, providers e fontes opcionais em tests/fixtures/observability-dashboard/; perfil sugerido: QA; escopo: apenas fixtures.
- [ ] T002 [P] Escrever testes de schema/client para bounded query, exact audit event lookup, access_disabled, empty, partial e unavailable em tests/contracts/observability-dashboard/read-api.test.js; perfil sugerido: QA/segurança; escopo: resposta sintética.
- [ ] T003 [P] Escrever testes do view model para unavailable versus zero, timezone, counterpart e classificação em tests/unit/observability-dashboard/view-model.test.js; perfil sugerido: QA; escopo: projeção.
- [ ] T004 Implementar cliente same-origin tipado para execução, detalhe e lookup exato de evento usando os read contracts SPEC-010 em src/lib/observabilityApi.js; perfil sugerido: frontend/backend; não chamar Supabase/provedores no browser.
- [ ] T005 Implementar projeções e labels seguros para execução, saúde, guardrails e fontes opcionais em src/lib/observabilityViewModel.js; perfil sugerido: frontend; depende de T001/T003; nunca promover suspicious a confirmed.
- [ ] T006 [P] Escrever teste de page loading/empty/error/access-disabled em tests/unit/observability-dashboard/page-state.test.js; perfil sugerido: QA/frontend; escopo: estados visuais.
- [ ] T007 Adicionar página-base e estilos responsivos em src/pages/ObservabilidadePage.jsx e src/pages/ObservabilidadePage.css; perfil sugerido: frontend; depende de T004–T006; usar padrões e componentes existentes.
- [ ] T008 Integrar rota interna, navegação e título em src/App.jsx; perfil sugerido: frontend; rota somente aditiva, sem alterar RequireAccess nem criar autenticação.
- [ ] T009 [P] Escrever security test que verifica que o browser client não usa Supabase/LangSmith e que correlationId não autoriza acesso em tests/security/observability-dashboard/browser-boundary.test.js; perfil sugerido: segurança/QA; adapter falso.

## Fase 2 — US1: Localizar uma execução (P1)

**Objetivo**: filtrar execuções sintéticas, abrir detalhe e distinguir ausência/atraso de falha.  
**Teste independente**: resposta fake percorre filtro, página e detail com spans ordenados, erros redigidos e contraparte ausente.

- [ ] T010 [P] [US1] Escrever testes de filtros por período, correlation ID, outcome, tool, provider e classificação de segurança em tests/unit/observability-dashboard/execution-filters.test.js; perfil sugerido: QA; usar limites de configuração injetados.
- [ ] T011 [P] [US1] Escrever testes de lista/paginação e labels de fonte em tests/unit/observability-dashboard/execution-list.test.js; perfil sugerido: QA; distinguir empty, partial, stale e unavailable.
- [ ] T012 [US1] Implementar filtros acessíveis e ação de limpar em src/components/observability/ExecutionFilters.jsx; perfil sugerido: frontend; depende de T004/T010; incluir classificação e não persistir IDs em URL/storage.
- [ ] T013 [US1] Implementar lista resumida e cursor pagination em src/components/observability/ExecutionList.jsx; perfil sugerido: frontend; depende de T005/T011; não substituir falha por zero.
- [ ] T014 [US1] Implementar detalhe em timeline ordenada de nós/transições e tools com links internos para auditEventRef usando consulta exata bounded em src/components/observability/ExecutionDetail.jsx; perfil sugerido: frontend; dados limitados ao read model SPEC-010.
- [ ] T015 [US1] Montar fluxo de consulta e seleção local de execução em src/pages/ObservabilidadePage.jsx; perfil sugerido: frontend; depende de T012–T014; limpar conteúdo privado em access_disabled/erro de acesso.
- [ ] T016 [US1] Escrever integração sintética de filtros/lista/detail/partial source em tests/integration/observability-dashboard/execution-flow.test.js; perfil sugerido: QA; depende de T012–T015; sem API real.

## Fase 3 — US2: Verificar estado das integrações (P2)

**Objetivo**: mostrar estado observado e freshness sem revelar secrets nem prometer disponibilidade.  
**Teste independente**: fixtures healthy, degraded, stale, unavailable e not_configured mantêm labels e tempos corretos.

- [ ] T017 [P] [US2] Escrever testes de health state, last-checked, stale, duracao e token usage ausente em tests/unit/observability-dashboard/provider-health.test.js; perfil sugerido: QA; sem valores de configuracao secreta.
- [ ] T018 [US2] Implementar painel de saúde para DeepSeek, Gemini, Supabase e LangSmith em src/components/observability/IntegrationHealth.jsx; perfil sugerido: frontend; depende de T005/T017; sem endpoint URL, key ou body de erro.
- [ ] T019 [US2] Integrar health parcial e queriedAt ao resumo da página em src/pages/ObservabilidadePage.jsx; perfil sugerido: frontend; depende de T015/T018; manter falha de cada fonte explícita.

## Fase 4 — US3: Distinguir sinais de segurança (P2)

**Objetivo**: apresentar suspicious e confirmed como categorias diferentes e expor limitações da evidência.  
**Teste independente**: fixture suspeita sem evidência permanece suspeita; fixture confirmada mantém evidência source-owned.

- [ ] T020 [P] [US3] Escrever testes de classificação, evidência parcial/redigida e semântica sem depender de cor em tests/unit/observability-dashboard/guardrail-events.test.js; perfil sugerido: QA/segurança; usar eventos sintéticos.
- [ ] T021 [US3] Implementar painel de eventos de guardrail com labels textuais e evidência permitida em src/components/observability/GuardrailEvents.jsx; perfil sugerido: frontend/segurança; depende de T005/T020; UI não classifica ataques.
- [ ] T022 [P] [US3] Escrever testes para fonte RAG/eval disabled, stale, missing, unavailable, measured e not-run em tests/unit/observability-dashboard/optional-source.test.js; perfil sugerido: QA/RAG; valores sintéticos e source-versioned.
- [ ] T023 [US3] Implementar painel opcional de índice/outbox/recuperação/evaluation summaries em src/components/observability/OptionalSourceStatus.jsx; perfil sugerido: frontend/RAG; depende de T005/T022; não habilitar vetor RAG ou aprovar qualidade.
- [ ] T024 [US3] Integrar painéis de guardrails e fontes opcionais com resumo da página em src/pages/ObservabilidadePage.jsx; perfil sugerido: frontend; depende de T019/T021/T023; absent/unrun não vira zero/pass.

## Fase 5 — Acessibilidade, segurança e conformidade

- [ ] T025 Implementar E2E sintético cronometrado para localizar run/correlation ID em menos de 30 segundos e cobrir 1440/820/390, keyboard, loading/empty/partial/error e access_disabled em tests/e2e/observability-dashboard/dashboard.spec.js; perfil sugerido: QA/frontend; Playwright só após runner aprovado/disponível.
- [ ] T026 [P] Verificar remoção de dado visível após access_disabled, nenhum ID persistido e nenhum conteúdo/secrets em DOM em tests/security/observability-dashboard/private-fields.test.js; perfil sugerido: segurança/QA; sem endpoint privado real.
- [ ] T027 Verificar comportamento America/Cuiaba para instantes e filtros em tests/contracts/observability-dashboard/timezone.test.js; perfil sugerido: QA; fixtures com timezones explícitos.
- [ ] T028 Executar npm test, npm run lint e npm run build depois de implementação autorizada e registrar saídas reais em specs/SPEC-011/quickstart.md; perfil sugerido: QA; não executar nesta fase documental.
- [ ] T029 Revisar FR-001–FR-015 e SC-001–SC-006, access gate, visibilidade DEC-005/006, fontes opcionais e separação de SDD; registrar PASS/FAIL/NOT VERIFIED em specs/SPEC-011/quickstart.md; perfil sugerido: auditoria/QA; depende das tarefas aplicáveis.

## Dependências e rastreabilidade

- T001–T009 estabelecem fixtures, API client, página e fronteira. SPEC-010 fornece o formato das respostas; SPEC-001/002 continuam proprietários do gate e endpoint.
- US1 depende da página-base e read model estável; US2 e US3 usam o mesmo view model e podem usar componentes independentes após a fundação. A integração final de painéis é sequencial porque usa o mesmo page file.
- DEC-001 fecha toda leitura privada; DEC-005/006 limitam fields; DEC-010/012 mantêm bounds/cache/polling e probes sem valores. SPEC-008/009/013 são feeds opcionais, não pré-condições da página básica.
- **Cobertura**: FR-001/013: T002/T004/T009/T026; FR-002/008: T010/T012/T013/T015; FR-003/006/011: T011/T013/T014/T016/T019; FR-004/012: T017/T018/T019; FR-005/007: T020/T021/T026; FR-009: T008/T029; FR-010: T006/T025/T027; FR-014/015: T022/T023/T024; SC-001: T025; SC-002/003: T002/T009/T026; SC-004: T020/T021; SC-005: T025; SC-006: T022/T023/T024.

## Estratégia futura

1. Implementar primeiro a fronteira de API, view model e estados seguros.
2. Entregar US1 com respostas sintéticas e gate fechado.
3. Adicionar health e categorias de segurança usando SPEC-010.
4. Integrar RAG/eval somente quando existirem contratos source-owned; valores ausentes permanecem explícitos.
5. Confirmar Playwright antes da E2E; não declarar qualidade sem evidência real. A lista não aprova implementação ou capacidade privada.
