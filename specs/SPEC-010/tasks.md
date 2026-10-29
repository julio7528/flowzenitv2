---
description: "Tarefas implementáveis propostas para SPEC-010; Draft, sem autorização de execução."
---

# Tarefas: SPEC-010 — LangSmith tracing e auditoria persistente

**Entradas**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md.  
**Pré-requisitos**: SPEC-001, SPEC-002 e SPEC-005. A implementação depende de lote SDD exato e explicitamente aprovado. DEC-001 bloqueia endpoints/ações privados; DEC-005 bloqueia retenção e exclusão de auditoria; DEC-006 bloqueia tracing de conteúdo real. DEC-010/012 continuam pendentes nos limites de runtime/abuso.  
**Estado**: tarefas propostas para futuro. Nenhuma tarefa é executada aqui. Sem provedores reais, Supabase remoto, dados reais, mudança no schema sdd ou nova autenticação.

## Convenções e bloqueios

- [P] só indica que a tarefa pode ocorrer em paralelo com caminhos graváveis independentes.
- [US1], [US2], [US3] correspondem às histórias em spec.md.
- Perfis são sugestões de competência, não atribuições de agente nem autorização de execução.
- Caminhos server/agent/observability/ e tests/ são destinos futuros; nenhum existe como implementação de produto neste checkout.
- A persistência candidata é um schema de produto privado separado de sdd.*. O nome/schema/grants e a migração exigem decisão e lote aprovados.
- Se audit-store failure/atomicidade não tiver política aprovada, ferramentas de mutação ficam desabilitadas. A falha do LangSmith é separada e não deve alterar autorização ou resultado de domínio já autorizado.

## Fase 1 — Contratos e estrutura compartilhada

- [ ] T001 [P] Criar fixtures sintéticas com IDs de request/turn/graph/tool, eventos allow/deny, estados de provider e segredos sentinela em tests/fixtures/observability/; perfil sugerido: QA; escopo: apenas fixtures.
- [ ] T002 [P] Definir DTOs versionados de trace, audit, redaction, provider health e token usage em server/agent/observability/event-contracts.js; perfil sugerido: backend; escopo: apenas contrato.
- [ ] T003 [P] Escrever testes de contrato para os cinco identificadores server-side, parent references e IDs de vendor separados em tests/contracts/observability/correlation-context.test.js; perfil sugerido: QA; escopo: correlação.
- [ ] T004 Implementar geração/propagação de requestId, turnId, correlationId, graphRunId e toolInvocationId sem confiar em IDs do browser em server/agent/observability/correlation.js; perfil sugerido: backend/LangGraph; depende de T002–T003; escopo: correlação.
- [ ] T005 [P] Escrever testes de allowlist/redação com sentinelas para conteúdo, headers, tool payload e exceções em tests/security/observability/redaction.test.js; perfil sugerido: segurança/QA; escopo: teste de privacidade.
- [ ] T006 Implementar allowlist e redação local antes de qualquer persistência/exportação em server/agent/observability/redaction.js; perfil sugerido: segurança/backend; depende de T002/T005; falha de redação não entrega payload a nenhum destino.
- [ ] T007 [P] Escrever testes de mapeamento de erro sem stack, body de provider, SQL ou configuração em tests/unit/observability/safe-errors.test.js; perfil sugerido: QA/segurança; escopo: erros sanitizados.
- [ ] T008 Implementar categorias de erro e logger allowlist em server/agent/observability/safe-errors.js; perfil sugerido: backend/segurança; depende de T002; escopo: logging sem conteúdo.

## Fase 2 — Fundacional: gates e auditoria durável

**Bloqueio**: nenhuma leitura privada ou mutação de produção começa nesta fase sem DEC-001 satisfeito. Não adicionar Supabase Auth, sessões, MFA, cadastro, owner UUID, tenant ou organização.

- [ ] T009 [P] Escrever teste para gate fechado que verifica zero chamadas a repository/provider e zero efeitos em tests/security/observability/access-gate.test.js; perfil sugerido: QA/segurança; escopo: gate sintético.
- [ ] T010 Implementar integração do gate DEC-001 server-side antes de qualquer query privada em server/agent/observability/access-gate.js; perfil sugerido: segurança/backend; depende de SPEC-001 e T009; não criar mecanismo de autenticação.
- [ ] T011 [P] Definir testes de append, duplicate, ambiguous commit e bounded query em tests/contracts/observability/audit-writer.test.js; perfil sugerido: QA/Postgres; fixtures locais e sintéticas.
- [ ] T012 Definir porta de persistência append/query, deduplicação por sourceEventRef e acknowledgement de commit em server/agent/observability/audit-repository.js; perfil sugerido: backend/Postgres; depende de T002/T006/T011; não usar sdd.*.
- [ ] T013 [P] Escrever testes de integração em PostgreSQL local isolado para append idempotente, consulta temporal limitada e permissões privadas em tests/integration/observability/audit-repository.test.js; perfil sugerido: QA/Supabase; database isolado, sem executar neste planejamento.
- [ ] T014 Criar a migração aditiva da auditoria do produto em supabase/migrations/ somente após DEC-005, acesso, allowlist e estratégia de atomicidade aprovados; perfil sugerido: Supabase/Postgres; depende de T012–T013 e de revisão de segurança; não alterar sdd schema nem conceder acesso ao browser.
- [ ] T015 Implementar writer que só informa persistência após acknowledgement e reconcilia duplicatas/commit ambíguo em server/agent/observability/audit-writer.js; perfil sugerido: backend/Postgres; depende de T012–T014; não criar segunda ledger de ações.
- [ ] T016 Documentar e aplicar na camada de integração a política aprovada para auditoria indisponível antes de habilitar mutações em server/agent/observability/audit-failure-policy.js; perfil sugerido: segurança/backend; depende de decisão explícita sobre atomicidade e recuperação; enquanto pendente, mutações permanecem desabilitadas.

## Fase 3 — US1: Acompanhar uma execução de ponta a ponta (P1)

**Objetivo**: correlacionar nós, tools e resultados em um trace opcional, sem alterar guardrails ou resultado de domínio quando LangSmith falhar.  
**Teste independente**: graph fixture determinístico com adapters falsos verifica IDs, ordem, decisão de tool e falha do exporter.

- [ ] T017 [P] [US1] Escrever testes de contrato de spans, outcomes, retry count e IDs de trace separados em tests/contracts/observability/trace-export.test.js; perfil sugerido: QA/LangGraph; escopo: contrato do exportador.
- [ ] T018 [P] [US1] Escrever testes de falha/timeout/quota do LangSmith com autorização inalterada em tests/integration/observability/langsmith-outage.test.js; perfil sugerido: QA; usar adapter fake e nenhuma chamada externa.
- [ ] T019 [US1] Implementar exporter LangSmith opt-in que aceita somente DTO redigido e falha para estado safe em server/agent/observability/langsmith-adapter.js; perfil sugerido: LangGraph/backend; depende de T004/T006/T017; produção desabilitada até DEC-006.
- [ ] T020 [US1] Instrumentar callbacks dos nós, transições e tools do grafo mantendo parent/correlation refs em server/agent/observability/graph-instrumentation.js; perfil sugerido: LangGraph; depende de T004/T019 e dos contratos da SPEC-002.
- [ ] T021 [US1] Integrar toolInvocationId e referencias do ExecutionLedger da SPEC-002 sem substituir a autoridade de replay em server/agent/runtime/tool-execution.js; perfil sugerido: backend/LangGraph; depende de T004/T020; coordenar com SPEC-002 em implementação futura.
- [ ] T022 [US1] Escrever teste de integração sintético para spans de nó/tool e correlationId comum em tests/integration/observability/graph-correlation.test.js; perfil sugerido: QA/LangGraph; depende de T019–T021; confirmar zero conteúdo não aprovado.
- [ ] T023 [US1] Verificar que indisponibilidade/flush tardio do LangSmith não muda terminal outcome nem pula guardrails em tests/security/observability/export-failure-invariance.test.js; perfil sugerido: segurança/QA; depende de T018–T022.
- [ ] T024 [P] [US1] Escrever testes para versionamento independente de sampling externo, retention interna/externa e field policy, a decisao exportar/omitir e a garantia de que eventos criticos de auditoria nunca sao amostrados em tests/unit/observability/trace-policy.test.js; perfil sugerido: QA/seguranca; nao fixar valores de producao.
- [ ] T025 [US1] Implementar política independente e versionada de export/sampling sem definir valores de produção em server/agent/observability/trace-policy.js; perfil sugerido: backend/segurança; depende de T002/T006/T024 e das decisões DEC-005/006 aplicáveis; auditoria crítica nunca é amostrada.

## Fase 4 — US2: Preservar auditoria independente de traces (P1)

**Objetivo**: manter evidência operacional/security minimizada e idempotente mesmo sem LangSmith, sem confundir actor scope com identidade verificada.  
**Teste independente**: auditoria fixture com exporter desligado cobre decisão permitida/negada, confirmação, outcome, sinal suspeito e persistência indisponível.

- [ ] T026 [P] [US2] Escrever testes para eventos de guardrail, confirmação, mutação, terminal e classificação suspicious/confirmed em tests/unit/observability/audit-classification.test.js; perfil sugerido: QA/segurança; usar evidência sintética.
- [ ] T027 [P] [US2] Escrever testes de independência entre audit e trace, inclusive quando cada escrita falha separadamente, em tests/integration/observability/audit-trace-independence.test.js; perfil sugerido: QA; adapters falsos.
- [ ] T028 [US2] Implementar projeção de eventos de SPEC-005 para categorias allowlisted sem policy expression, prompt ou tool payload em server/agent/observability/guardrail-events.js; perfil sugerido: segurança/backend; depende de T002/T006/T015/T026.
- [ ] T029 [US2] Implementar registro de resultado de operação a partir do outcome confirmado da SPEC-002 ExecutionLedger em server/agent/observability/action-events.js; perfil sugerido: backend; depende de T015/T016 e do contrato de auditoria com SPEC-002; gravação não duplica ou substitui ledger.
- [ ] T030 [US2] Implementar classificação de evento que deixa sinal sem corroborar como suspicious_signal em server/agent/observability/event-classification.js; perfil sugerido: segurança; depende de T026 e da regra de evidência aprovada; não inferir confirmed_attack por saída do modelo.
- [ ] T031 [US2] Validar a matriz sintética de sentinelas e campos permitidos antes de persistência em tests/security/observability/audit-field-policy.test.js; perfil sugerido: QA/segurança; depende de T006/T015/T026–T030; campos reais continuam sujeitos a DEC-005/006.

## Fase 5 — US3: Consultar métricas sem expor conteúdo (P2)

**Objetivo**: fornecer métricas e health observations bounded, com valores ausentes explicitamente indisponíveis.  
**Teste independente**: span fixtures cobrem latência, erros, retries, usage exato/ausente e health stale.

- [ ] T032 [P] [US3] Escrever testes para latência, retry, usage disponível/indisponível e health stale em tests/unit/observability/metrics-health.test.js; perfil sugerido: QA; escopo: métricas sintéticas.
- [ ] T033 [US3] Implementar medição e agregação de contadores/latências sem labels de conteúdo em server/agent/observability/metrics.js; perfil sugerido: backend; depende de T002/T032; nenhum orçamento ou threshold é criado.
- [ ] T034 [US3] Implementar ProviderHealthObservation com checkedAt/freshness e categorias seguras para DeepSeek, Gemini, Supabase e LangSmith em server/agent/observability/provider-health.js; perfil sugerido: backend/SRE; depende de T002/T032; probes reais dependem de gates.
- [ ] T035 [US3] Implementar token usage como exato somente quando o ModelAdapter devolver contagens; outros casos são unavailable em server/agent/observability/usage.js; perfil sugerido: LangGraph/backend; depende dos contratos SPEC-002 e T032.
- [ ] T036 [US3] Escrever teste que prova que health desconhecido ou dado ausente nunca vira healthy ou zero em tests/contracts/observability/unknown-metrics.test.js; perfil sugerido: QA; depende de T033-T035.

## Fase 6 — Integração e conformidade

- [ ] T037 [P] Validar os read contracts consumidos por SPEC-011, incluindo bounded fields, freshness e ausencia de counterpart, em specs/SPEC-010/contracts/audit-query.md, specs/SPEC-010/contracts/provider-health.md e specs/SPEC-010/contracts/trace-summary.md; perfil sugerido: documentacao/auditoria; escopo: contratos de leitura.
- [ ] T038 [P] Verificar que nenhuma integração lê/escreve sdd.* ou usa seu ledger/checkpoints para dados do agente em tests/security/observability/no-sdd-reuse.test.js; perfil sugerido: segurança/QA; somente fixtures/schemas isolados.
- [ ] T039 Revisar FR-001–FR-013 e SC-001–SC-004, contratos SPEC-001/002/003/005 e as decisões DEC-001/005/006/010/012; registrar PASS/FAIL/NOT VERIFIED somente com evidência futura em specs/SPEC-010/quickstart.md; perfil sugerido: auditoria/QA; depende das tarefas aplicáveis.
- [ ] T040 Executar npm test, npm run lint e npm run build depois de implementação autorizada e registrar saídas reais no fechamento do lote em specs/SPEC-010/quickstart.md; perfil sugerido: QA; não executar nesta fase documental.

## Dependências e rastreabilidade

- T001–T008 estabelecem DTOs, IDs e redação. T009–T016 formam a fundação de acesso/auditoria; T014/T016 ficam bloqueadas pelas decisões e revisão indicadas.
- US1 depende de correlação/redação e da SPEC-002; trace export real também depende de DEC-006 e runtime de DEC-010. US2 depende de audit store, policy de falha/atomicidade e SPEC-005/ExecutionLedger. US3 pode ser testada com fixtures, mas não define orçamento nem faz probe privado.
- **Cobertura**: FR-001: T003/T004/T020/T022; FR-002: T017/T019/T020/T032-T035; FR-003: T012/T015/T027/T038; FR-004: T026/T028/T029; FR-005/006: T005/T006/T008/T019/T031; FR-007: T026/T030; FR-008: T018/T023/T027/T029; FR-009: T019; FR-010: T014/T016/T024/T025/T037; FR-011/013: T009/T010/T015/T038; FR-012: T011/T012/T015/T027; SC-001: T003/T004/T020/T022; SC-002: T005/T006/T031; SC-003: T018/T023/T027; SC-004: T032/T035/T036.
- Usuários/histórico e checkpoints permanecem em SPEC-003; regras de ação e evidência permanecem em SPEC-002/SPEC-005; SPEC-011 consome o read model depois de DEC-001.

## Estratégia futura

1. Implementar primeiro os contratos, fixtures, IDs e redação.
2. Validar auditoria sintética e política de falha antes de qualquer ação de produção.
3. Integrar tracing externo somente após decisão de dados; testar seu desligamento primeiro.
4. Integrar o dashboard somente após o gate de acesso e o contrato de leitura.
5. Fechar a SPEC com lint/build/testes de verdade e evidência registrada. Tarefas propostas não aprovam SPEC, lote, política de dados ou capacidade.
