---
description: "Tarefas implementáveis propostas para SPEC-009; Draft, sem autorização de execução."
---

# Tarefas: SPEC-009 — RAG híbrido, RRF e grounding

**Entradas**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.

**Pré-requisitos**: SPEC-002, SPEC-004, SPEC-005 e SPEC-008. Implementação depende de lote SDD exato aprovado e gates DEC-001/006/007/010/011/012. Query embedding e retrieval privado permanecem desabilitados enquanto algum gate aplicável estiver pendente. Não enviar dados reais a provedores; testes usam corpus artificial e adapters fake.

**Estado**: tarefas propostas para futuro. Não executar nesta revisão documental.

## Convenção e escopo

- `[P]` significa caminhos graváveis disjuntos sem dependência direta.
- `[US1]`, `[US2]`, `[US3]` mapeiam às histórias da SPEC.
- Perfis sugeridos não são atribuições nem autorização de agentes.
- `server/agent/retrieval/`, `tests/...` e `supabase/migrations/` são destinos propostos; todos os arquivos abaixo são futuros.

## Fase 1 — Fundação tipada

- [ ] T001 [P] Criar corpus artificial e casos de consulta em `tests/fixtures/retrieval/` (pt-BR, hierarquia, filtros, exact facts, aliases, no-result, stale/deleted e injection); perfil sugerido: QA; escopo: fixtures.
- [ ] T002 [P] Definir DTO de query, intent, filtros permitidos, limites e erros em `server/agent/retrieval/request-schema.js`; perfil sugerido: backend; escopo: contrato de request.
- [ ] T003 [P] Implementar gate fail-closed para leitura semântica antes de repository/provider em `server/agent/retrieval/access-gate.js`; perfil sugerido: segurança/backend; não implementar autenticação nova.
- [ ] T004 [P] Definir resultados de canais, estado de degradação, provenance e citation refs em `server/agent/retrieval/result-contracts.js`; perfil sugerido: backend; escopo: DTOs.
- [ ] T005 [P] Escrever contract tests de scope e ausência de SQL/arbitrary table/filter input em `tests/contracts/retrieval/request-scope.test.js`; perfil sugerido: segurança/QA; escopo: schemas.

## Fase 2 — US1: Encontrar itens semanticamente relacionados (P1)

**Objetivo**: responder descoberta semântica com filtros, hierarquia e ranking reproduzível; exatidão continua em SPEC-004.

**Teste independente**: corpus sintético verifica rota structured versus semantic, scope uniforme, candidate ranks e exclusão de source stale.

- [ ] T006 [P] [US1] Escrever testes de roteamento para IDs/status/datas/counts exatos, perguntas semânticas, mistas e ambíguas em `tests/unit/retrieval/query-router.test.js`; perfil sugerido: QA; escopo: classificação/route.
- [ ] T007 [P] [US1] Escrever testes unitários de RRF, dedupe, rank ausente, tie-break e config versionada em `tests/unit/retrieval/rrf.test.js`; perfil sugerido: QA; escopo: somente fusão.
- [ ] T008 [P] [US1] Escrever testes de FTS português, acentos, siglas, query vazia/malformada e parametrização em `tests/integration/retrieval/lexical-portuguese.test.js`; perfil sugerido: QA/Postgres; usar DB isolado e comparar configs sem selecionar parâmetro de produção.
- [ ] T009 [P] [US1] Escrever testes de compatibilidade de query embedding com generation ativa e filtro seletivo de vetor em `tests/integration/retrieval/vector-scope.test.js`; perfil sugerido: QA/Supabase; vector/model fake e index local isolado.
- [ ] T010 [US1] Implementar query router que envia fatos exatos à SPEC-004 e limita semantic/mixed a retrievers tipados em `server/agent/retrieval/query-router.js`; perfil sugerido: backend/guardrails; depende de T002/T006, sem classificação por SQL generativo.
- [ ] T011 [US1] Implementar FTS parametrizado por campos de DEC-007 e parser de busca em `server/agent/retrieval/postgres-lexical.js`; perfil sugerido: backend/Postgres; depende de T002/T008 e gate DEC-001 para dados privados.
- [ ] T012 [US1] Adicionar coluna/expressão `tsvector` e GIN lexical index em migration aditiva após revisão de campos/idioma e lote autorizado; perfil sugerido: Supabase/Postgres; depende de T008/T011 e SPEC-008/DEC-007; não expor função/view pública.
- [ ] T013 [US1] Implementar adapter vector que usa exclusivamente generation compatível SPEC-008 e valida filtros tipados em `server/agent/retrieval/pgvector-semantic.js`; perfil sugerido: backend/RAG; depende de T004/T009 e gates DEC-001/006/007/010/011/012.
- [ ] T014 [US1] Implementar validação idempotente de scope, lifecycle, freshness, parent chain e fonte atual em `server/agent/retrieval/freshness.js`; perfil sugerido: backend/Postgres; depende de T004/T011/T013 e contrato SPEC-008; nenhum candidato stale passa.
- [ ] T015 [US1] Implementar RRF de ranking ordinal por `(sourceType, sourceId)` com parâmetro versionado em `server/agent/retrieval/rrf.js`; perfil sugerido: backend; depende de T004/T007; nenhum score bruto somado e nenhum default numérico novo.
- [ ] T016 [US1] Implementar orquestração de dois canais, mesmo scope, bounds e degraded states em `server/agent/retrieval/retrieve.js`; perfil sugerido: backend; depende de T010–T015; gate de acesso precede ambos os canais.
- [ ] T017 [US1] Escrever integration tests de filtros compartilhados, duplicatas, exclusões, staleness e falha isolada/dos canais em `tests/integration/retrieval/hybrid-freshness-degraded.test.js`; perfil sugerido: QA/segurança; depende de T011–T016; somente fixtures sintéticas.

## Fase 3 — US2: Explicar evidência e incerteza (P1)

**Objetivo**: respostas record-based citam fonte atual, abstenção ocorre sem evidência e retrieval content nunca vira instrução.

**Teste independente**: model fake responde a candidates sintéticos; citações inválidas/stale e prompt injection são recusadas sem tool/permission changes.

- [ ] T018 [P] [US2] Escrever unit tests de montagem de contexto, budget truncation e estados partial/degraded/no-result em `tests/unit/retrieval/context-builder.test.js`; perfil sugerido: QA; escopo: contexto.
- [ ] T019 [P] [US2] Escrever security tests de prompt injection, instrução de SQL e pedido de tool write em retrieved text em `tests/security/retrieval/untrusted-content.test.js`; perfil sugerido: segurança/QA; sem provider real.
- [ ] T020 [P] [US2] Escrever contract tests de citações presentes/no retrieved set, source freshness e claim sem suporte em `tests/contracts/retrieval/citation-validation.test.js`; perfil sugerido: QA; escopo: citations.
- [ ] T021 [US2] Implementar context builder budget-aware que serializa retrieved text como dado não confiável em `server/agent/retrieval/context-builder.js`; perfil sugerido: LangGraph/backend; depende de T004/T014/T018 e SPEC-002/DEC-010/011/012.
- [ ] T022 [US2] Implementar citation/claim validator que limita refs ao conjunto atual e exige SPEC-004 facts para exact fields em `server/agent/retrieval/citation-validator.js`; perfil sugerido: backend/segurança; depende de T014/T020.
- [ ] T023 [US2] Conectar retrieval evidence ao pipeline SPEC-005/SPEC-002 sem transferir autoridade para texto retornado em `server/agent/retrieval/evidence-adapter.js`; perfil sugerido: LangGraph/guardrails; depende de T019/T021/T022 e não habilita escrita.
- [ ] T024 [US2] Escrever integration tests para status/data/hora/count exatos via SPEC-004, citations, unknowns e semântica mista em `tests/integration/retrieval/grounded-answer.test.js`; perfil sugerido: QA; depende de T010/T021–T023; model fake.

## Fase 4 — US3: Medir contribuição e regressão (P2)

**Objetivo**: recomendar uso ou não uso de vector/RRF comparando métodos em casos versionados e relevantes ao domínio.

**Teste independente**: mesma coleção artificial roda structured, lexical, vector e RRF; metrics repetíveis por idioma, query class e entity kind.

- [ ] T025 [P] [US3] Definir fixture versionada de relevância sintética com queries portuguesas, expected sourceRefs e expected routing em `tests/evaluation/retrieval/dataset-v1.json`; perfil sugerido: avaliação/QA; nenhuma conversa real.
- [ ] T026 [P] [US3] Implementar cálculo de Recall@k/Recall@5, MRR, nDCG@k, no-result, exact routing e citation coverage em `tests/evaluation/retrieval/metrics.js`; perfil sugerido: QA/RAG; `k`/baselines além do critério SPEC ficam configuráveis, sem threshold inventado.
- [ ] T027 [US3] Executar comparação lexical-only, vector-only, RRF e structured-tool baseline em `tests/evaluation/retrieval/retrieval-ablation.test.js`; perfil sugerido: QA/RAG; fake embeddings/model e database isolado.
- [ ] T028 [US3] Registrar recomendação de utilidade RAG, baseline/mínimos a aprovar, RRF params, evidências e riscos em `specs/SPEC-009/quickstart.md`; perfil sugerido: documentação/auditoria; resultados precisam ser executados e aprovados em etapa futura.
- [ ] T029 [US3] Testar que gate DEC-001 ou decisões DEC-006/007/010/011/012 pendentes resultam em zero private read/context/provider calls em `tests/security/retrieval/private-data-gates.test.js`; perfil sugerido: segurança; nenhum owner/non-owner ou tenant fixture.

## Fase 5 — Conformidade

- [ ] T030 [P] Verificar consulta lexical/vector com mesma hierarquia, período, atributo, lifecycle e status de frescor em DB isolado; registrar `EXPLAIN` e Recall sob filtros em `tests/integration/retrieval/filter-quality.test.js`; perfil sugerido: Supabase/Postgres; não consultar DB remoto.
- [ ] T031 [P] Executar e registrar `npm test`, `npm run lint`, `npm run build` e checks de segurança/evaluation depois da implementação autorizada; persistir resultados reais no registro do lote SDD aprovado; perfil sugerido: QA; testes não rodam nesta fase documental.
- [ ] T032 Rever FR-001…FR-013, SC-001…SC-005, gates de acesso/provider, interface SPEC-004/008 e decisão de habilitar/adiar RAG; registrar PASS/FAIL/NOT VERIFIED por evidência no fechamento do lote aprovado; perfil sugerido: auditoria/QA; depende das tarefas aplicáveis.

## Dependências, decisões e rastreabilidade

- T001–T005 estabelecem fixture, DTO e gate. US1 precede contextualização US2; avaliação US3 mede a implementação e não a aprova por si só.
- A linha SPEC-009 no registro central lista DEC-006/007/011 e SPEC-008. DEC-010 e DEC-012 entram aqui como gates transversais já pendentes para runtime e limite de chamadas, sem alterar status de decisão.
- RRF `k`/weights/candidate counts; idioma de FTS; evidence threshold; mínimo/baseline de melhoria; e custo/latência desejados ainda não têm decisão específica aprovada. Não atribuir DEC ID novo nem preencher por exemplo Supabase/artigo RRF.
- **Rastreabilidade**: FR-001 → T006/T010/T024; FR-002/003 → T007/T015/T026/T027; FR-004 → T014/T015/T017; FR-005/013 → T003/T014/T029/T030; FR-006 → T002/T016/T018/T021; FR-007/008 → T018/T020–T024; FR-009 → T019/T021/T023; FR-010 → T025–T027; FR-011 → T012/T013/T029/T031; FR-012 → T016/T017; SC-001 → T006/T010/T024/T026; SC-002 → T025–T028 após baseline aprovado; SC-003/005 → T014/T017/T029/T030; SC-004 → T020/T022/T024; cobertura e segurança global → T029–T032.

## Critério de conclusão futura

Concluir somente com evidência executada num lote aprovado, source filtering/freshness/citations corretos, gate privado verificado e decisões aplicáveis resolvidas. Sem ganho mensurado ou sem aprovação de baseline/evidence threshold, recomendação final permanece “não habilitar vector RAG”; não transformar completude documental em aprovação produtiva.
