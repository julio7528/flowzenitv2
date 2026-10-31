---
description: "Tarefas implementáveis propostas para SPEC-008; Draft, sem autorização de execução."
---

# Tarefas: SPEC-008 — Gemini Embedding, pgvector e indexação incremental

**Entradas**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.

**Pré-requisitos**: SPEC-001 e SPEC-004. Todas as tarefas de implementação dependem de SPEC-008 em lote SDD exato e explicitamente aprovado. Indexação privada exige gate DEC-001 aprovado, implementado e verificado, DEC-006/007/010/011 resolvidas e limites DEC-012 aplicáveis. SPEC-009 é consumidora do contrato do índice.

**Estado**: tarefas futuras propostas. Não executar agora. Testes usam fixtures sintéticas, banco isolado e provider fake; nenhum registro real, Gemini API, projeto Supabase remoto, segredo ou dado de usuário.

## Convenção e escopos

- `[P]` indica caminhos graváveis disjuntos e ausência de dependência direta.
- `[US1]`, `[US2]`, `[US3]` identificam as histórias de `spec.md`.
- Perfis sugeridos não são atribuições nem autorização de subagentes. Implementação segue somente lote aprovado.
- `server/indexing/` e `tests/...` são destinos propostos; `supabase/migrations/` só será alterado em lote aprovado após gates.

## Fase 1 — Contratos e fixtures comuns

- [ ] T001 [P] Criar fixtures sintéticas de demandas, tarefas, subtarefas, mudança de ancestral, metadata de status/agenda, rotina-template opcional e deletes em `tests/fixtures/indexing/`; perfil sugerido: QA; escopo: fixtures somente.
- [ ] T002 [P] Implementar contrato de tipos SourceRef, estados e erros em `server/indexing/domain/contracts.js`; perfil sugerido: backend; escopo: contratos de domínio somente.
- [ ] T003 [P] Implementar política allowlist/eligibility com default fechado para campos externos em `server/indexing/domain/eligibility.js`; perfil sugerido: segurança; escopo: elegibilidade somente.
- [ ] T004 [P] Implementar template versionado, normalização e fingerprints de input/metadata em `server/indexing/domain/canonical-text.js`; perfil sugerido: backend/RAG; escopo: canonicalização somente.
- [ ] T005 [P] Definir descriptor de versão do modelo, dimensão, vector type e geração em `server/indexing/domain/embedding-version.js`; perfil sugerido: backend/Supabase; escopo: descriptor e validação, valores fornecidos somente por DEC-011.
- [ ] T006 [P] Escrever contract tests dos contratos de fonte/chunk, lineage e decimal IDs em `tests/contracts/indexing/source-chunk.test.js`; perfil sugerido: QA; escopo: contrato de chunk.

## Fase 2 — US1: Sincronizar conteúdo elegível (P1)

**Objetivo**: manter exatamente uma representação vigente por fonte/geração, tolerando duplicatas, atraso, reordenação e exclusão.

**Teste independente**: no PostgreSQL isolado com fonte sintética e provider fake, source commit converge para um chunk vigente; rollback não deixa evento; exclusão impede retorno do candidato.

- [ ] T007 [P] [US1] Escrever testes isolados de atomicidade commit/rollback entre source change e outbox em `tests/integration/indexing/outbox-atomicity.test.js`; perfil sugerido: QA/Postgres; escopo: atomicidade.
- [ ] T008 [P] [US1] Escrever testes de idempotência, entrega repetida, atraso, reordenação e concorrência por origem em `tests/integration/indexing/event-ordering.test.js`; perfil sugerido: QA; escopo: ordenação e duplicata.
- [ ] T009 [P] [US1] Escrever testes unitários de atualização de metadados sem re-embedding e reindex seletiva por fingerprint/hierarquia em `tests/unit/indexing/selective-reindex.test.js`; perfil sugerido: QA; escopo: fingerprint e chamada fake.
- [ ] T010 [US1] Implementar repositório tipado de fonte, leitura de hierarquia e revalidação por SourceRef em `server/indexing/ports/source-repository.js`; perfil sugerido: backend/Postgres; depende de T002/T006 e do gate DEC-001 antes de qualquer leitura de fonte privada.
- [ ] T011 [US1] Definir producer/outbox transacional para todas as alterações aplicáveis em migration aditiva revisada e `server/indexing/ports/outbox.js`; perfil sugerido: Supabase/Postgres; depende de T007, gate DEC-001 e revisão de segurança de grants/triggers. Não ativar produção até DEC-006/007/010/011 serem resolvidas; se atomicidade exigir acesso não aprovado, manter indexação bloqueada e escalar decisão.
- [ ] T012 [US1] Implementar claim/lease, idempotência, reler origem e serializar por source/generation em `server/indexing/services/index-worker.js`; perfil sugerido: backend/worker; depende de T004, T005, T008, T010, T011 e de todos os gates de produção DEC-001/006/007/010/011.
- [ ] T013 [US1] Implementar upsert de chunk derivado por geração e compare de canonical fingerprint em `server/indexing/ports/vector-index.js`; perfil sugerido: Supabase/Postgres; depende de T005/T012; ativação depende dos gates de produção e de dimensão/type/opclass compatíveis conforme DEC-011 e versão pgvector validada.
- [ ] T014 [US1] Implementar tombstone/invalidação de delete, cascata e perda de eligibility em `server/indexing/services/invalidation.js`; perfil sugerido: backend/Postgres; depende de T010–T013 e gates de produção aplicáveis.
- [ ] T015 [US1] Escrever teste de integração para exclusão, source freshness, cascata e evento atrasado em `tests/integration/indexing/deletion-freshness.test.js`; perfil sugerido: QA/segurança; depende de T010–T014; zero candidato deve ser retornável antes de worker catch-up.

## Fase 3 — US2: Recuperar falhas (P1)

**Objetivo**: conter falhas externas sem atrasar transações de domínio e permitir replay controlado.

**Teste independente**: provider fake injeta timeout, rate limit, falha permanente, modelo/dimensão inválidos; event permanece recuperável ou vai a DLQ redigida sem gravar vetor incorreto.

- [ ] T016 [P] [US2] Escrever contract tests do provider para timeout, rate limit, malformed response, modelo, dimensão e valores não finitos em `tests/contracts/indexing/embedding-provider.test.js`; perfil sugerido: QA; escopo: provider contract.
- [ ] T017 [P] [US2] Escrever testes do DLQ/replay e redaction de logs/metrics em `tests/unit/indexing/worker-recovery.test.js`; perfil sugerido: QA/segurança; escopo: recovery.
- [ ] T018 [US2] Implementar interface e adapter Gemini server-side com response validation e segredo não client-exposed em `server/indexing/adapters/gemini.js`; perfil sugerido: backend; depende de T005/T016 e aprovações DEC-006/010/011; manter adapter sem chamada real até gates satisfeitos.
- [ ] T019 [US2] Implementar classificação retryable/permanent, limites configuráveis, DLQ e replay idempotente em `server/indexing/services/recovery.js`; perfil sugerido: worker; depende de T012/T016/T017; números só de DEC-010/012.
- [ ] T020 [US2] Escrever teste de integração para evento cujo source/hierarquia muda durante geração de embedding em `tests/integration/indexing/source-change-in-flight.test.js`; perfil sugerido: QA; depende de T010/T012/T018; provider fake, descartar resposta obsoleta.
- [ ] T021 [US2] Implementar backfill paginado/retomável e rate-bounded em `server/indexing/services/backfill.js`; perfil sugerido: backend/worker; depende de T012/T013/T019; só usar limites aprovados.
- [ ] T022 [US2] Escrever teste de reindexação staged, validação da geração nova, cutover e rollback de ponteiro em `tests/integration/indexing/generation-cutover.test.js`; perfil sugerido: QA/Postgres; depende de T005/T013/T021; dados sintéticos apenas.

## Fase 4 — US3: Aprovar valor e privacidade do corpus (P2)

**Objetivo**: verificar conteúdo enviado e medir se embeddings agregam valor suficiente para justificar provider e operação.

**Teste independente**: corpus sintético e provider spy comprovam gate fechado, payload mínimo, skips e comparação repetível sem valor de qualidade inventado.

- [ ] T023 [P] [US3] Escrever teste de segurança provando zero provider calls e zero private reads quando o gate DEC-001 ou qualquer decisão DEC-006/007/010/011 aplicável estiver pendente em `tests/security/indexing/access-and-provider-gates.test.js`; perfil sugerido: segurança/QA; escopo: gates.
- [ ] T024 [P] [US3] Capturar payload do fake provider e afirmar allowlist, ausência de IDs/metadados não aprovados, segredos, prompts e transcrições em `tests/security/indexing/provider-payload.test.js`; perfil sugerido: segurança/QA; escopo: payload outbound.
- [ ] T025 [US3] Implementar métricas agregadas de atraso, pendência, DLQ, skip, drift e versão em `server/indexing/observability/metrics.js`; perfil sugerido: backend/observabilidade; depende de T012/T019; sem conteúdo ou vetor.
- [ ] T026 [US3] Criar avaliação versionada sintética comparando títulos/linhagem, skip de título curto e baseline lexical/estruturado em `tests/evaluation/indexing/corpus-value.test.js`; perfil sugerido: QA/RAG; sem métricas mínimas inventadas, registrar decisão pendente DEC-007.
- [ ] T027 [US3] Testar que metadata-only `status`, datas e horários atualizam projection sem chamar provider, enquanto alterações de canonical text e linhagem reindexam somente chunks dependentes em `tests/integration/indexing/metadata-vs-embedding.test.js`; perfil sugerido: QA; depende de T004/T009/T012/T013.
- [ ] T028 [US3] Documentar no runbook parâmetros aprovados, validação de lag/DLQ, payload minimizado e procedimento de revisão/opt-in em `specs/SPEC-008/quickstart.md`; perfil sugerido: documentação/segurança; depende das decisões finais sem alterá-las.

## Fase 5 — Conformidade e qualidade

- [ ] T029 [P] Verificar compatibilidade da versão pgvector, tipo, dimensão, distância/opclass e plano de busca em database isolado; registrar evidência em `tests/integration/indexing/vector-compatibility.test.js`; perfil sugerido: Supabase/Postgres; depende de DEC-011; nunca consultar projeto remoto durante teste isolado.
- [ ] T030 [P] Executar/registrar `npm test`, `npm run lint`, `npm run build` e gates de segurança/integridade configurados depois da implementação autorizada; registrar resultados reais em artefato de execução do lote SDD aprovado; perfil sugerido: QA; não reutilizar schema `sdd` para dados de indexação.
- [ ] T031 Revisar FR-001…FR-015, SC-001…SC-005, gates de decisão e contrato downstream com SPEC-009; marcar cada verificação PASS/FAIL/NOT VERIFIED com evidência no fechamento do lote aprovado; perfil sugerido: auditoria/QA; depende das tarefas aplicáveis.

## Dependências, gates e cobertura

- T001–T006 estabelecem contratos e fixtures; histórias dependem de seus contratos.
- US1 captura fonte/metadata/outbox, processamento e invalidação; deletes e frescor prevalecem sobre atraso de fila.
- US2 pode ser prototipada inteiramente com fake; provider real permanece bloqueado por DEC-001/006/007/010/011 e limites aplicáveis DEC-012.
- US3 pode produzir evidência sintética e recomendar não habilitar embeddings; não há threshold de ganho ou orçamento aprovado.
- T011/T013/T029 e qualquer migration/extensão pgvector exigem batch SDD exato autorizado, gates resolvidos e database isolado. Nenhuma tarefa altera linhas reais do Supabase.
- **Rastreabilidade**: FR-001/003/004 → T002/T004/T006/T010/T013; FR-002/013/014 → T003/T023/T024; FR-005/006 → T007/T008/T011/T012/T019; FR-007 → T014/T015; FR-008 → T017/T019; FR-009 → T005/T016/T018/T029; FR-010/011 → T005/T018/T021/T022/T029; FR-012 → T008/T015/T020/T022; FR-015 → T009/T027. SC-001 → T007/T012/T013; SC-002 → T008/T013; SC-003 → T014/T015; SC-004 → T023/T024; SC-005 → T009/T027.

## Critério de conclusão futura

Concluir apenas após lote aprovado executar tarefas autorizadas, cada teste receber resultado real, integração atômica e gates de segurança passarem, comportamento de freshness/deletion ser demonstrado, geração compatível ser aprovada e o owner resolver DEC-006/007/010/011/012 aplicáveis. Sem decisão de utilidade DEC-007, a conclusão pode documentar adiamento de embeddings em vez de habilitação.
