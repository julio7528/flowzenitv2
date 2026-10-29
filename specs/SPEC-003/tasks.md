---
description: "Tarefas de implementação propostas para a SPEC-003; Draft, sem autorização de execução."
---

# Tarefas: SPEC-003 — Histórico, memória e checkpoints

**Entradas**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.

**Pré-requisitos**: SPEC-001 e SPEC-002 planejadas. A implementação depende de SPEC-003 incluída em lote SDD exato e explicitamente aprovado. Leituras/escritas privadas e persistência real permanecem bloqueadas até os gates DEC-001 e DEC-005; envio de conteúdo real a provedor depende de DEC-006. Runtime e limites ainda dependem de DEC-010/011/012.

**Estado**: todas as tarefas abaixo são propostas futuras. Não executar neste trabalho documental. Usar exclusivamente dados sintéticos em testes; não alterar o schema `sdd`.

## Convenção

- `[P]`: pode ser feito em paralelo, sem dependência e com caminhos graváveis disjuntos.
- `[US1]`, `[US2]`, `[US3]`: história da SPEC associada.
- Perfis são sugestões para futuro lote, não atribuições nem autorização de subagentes.
- Caminhos `server/agent/...`, `tests/...` e `supabase/migrations/...` são destinos propostos pelo plano; não existem mudanças nesta fase.

## Fase 1 — Fundação e contratos

- [ ] T001 [P] Preparar fixtures sintéticas de conversas, mensagens, checkpoints, ledger, corrupção e concorrência em `tests/fixtures/conversation/`; perfil sugerido: QA; escopo: somente fixtures.
- [ ] T002 [P] Definir DTOs, validação de IDs, paginação e erros estáveis em `server/agent/memory/conversation-contracts.js`; perfil sugerido: backend; escopo: somente contratos.
- [ ] T003 [P] Implementar o gate privado fail-closed na fronteira server-side em `server/agent/memory/access-gate.js`, sem criar mecanismo de autenticação; perfil sugerido: segurança/backend; escopo: somente o módulo do gate.
- [ ] T004 [P] Definir o envelope versionado e validador de checkpoint em `server/agent/memory/checkpoint-envelope.js`, incluindo graph/state/serializer version, thread, turn e ledger references; perfil sugerido: LangGraph; escopo: envelope e testes unitários.
- [ ] T005 Definir interface do repositório de conversa e limites de ownership em `server/agent/memory/conversation-repository.js`, preservando a porta de checkpoint e o ExecutionLedger de SPEC-002; perfil sugerido: backend; escopo: repositório de conversa.
- [ ] T006 [P] Definir configuração server-only e redação de logs em `server/agent/memory/config.js` e `server/agent/memory/safe-logging.js`; perfil sugerido: segurança; escopo: configuração e logging, sem segredos ou conteúdo.

## Fase 2 — US1: Histórico e retomada segura (P1)

**Objetivo**: consultar páginas estáveis e retomar apenas estado íntegro sem repetir efeitos concluídos.

**Teste independente**: com fixture sintética, verificar paginação, IDs inválidos, acesso bloqueado, checkpoint incompatível e replay com ledger concluído.

- [ ] T007 [P] [US1] Escrever testes unitários de cursores, sequência e limites de página em `tests/unit/conversation/cursor.test.js`; perfil sugerido: QA; escopo: somente teste de cursor.
- [ ] T008 [P] [US1] Escrever testes unitários para erros estáveis e gate sem chamada ao storage em `tests/unit/conversation/access-gate.test.js`; perfil sugerido: segurança/QA; escopo: teste de gate.
- [ ] T009 [P] [US1] Escrever testes de contrato de checkpoint e preflight em `tests/contracts/conversation/checkpoint-resume.test.js`; perfil sugerido: QA LangGraph; escopo: contrato de retomada.
- [ ] T010 [US1] Implementar append idempotente e paginação por sequência/snapshot no adaptador de histórico em `server/agent/memory/conversation-repository.js`; perfil sugerido: backend/Postgres; depende de T002 e T005.
- [ ] T011 [US1] Implementar preflight de retomada e validação de ledger em `server/agent/memory/checkpoint-resume.js`; perfil sugerido: LangGraph; depende de T003, T004 e T009; não repetir side effects ambíguos.
- [ ] T012 [US1] Implementar coordenação de turnos com idempotency key e exclusão mútua por conversa em `server/agent/memory/turn-coordinator.js`; perfil sugerido: backend; depende de T005 e do contrato de execução SPEC-002.
- [ ] T013 [US1] Adicionar testes de integração isolados para paginação e concorrência em `tests/integration/conversation/history-concurrency.test.js`; perfil sugerido: QA; depende de T010 e T012; somente fixtures sintéticas.
- [ ] T014 [US1] Adicionar testes de integração para checkpoint corrompido, expirado, incompatível ou ledger incompleto em `tests/integration/conversation/resume-fail-closed.test.js`; perfil sugerido: QA/segurança; depende de T011; verificar zero invocações de ferramenta.

## Fase 3 — US2: Retenção, exclusão e interrupções (P1)

**Objetivo**: aplicar exclusivamente a política de lifecycle que venha a ser aprovada em DEC-005, impedindo leitura e escrita durante exclusão.

**Teste independente**: fixture sintética cobre pedido de exclusão concorrente com turno ativo e verifica ausência de artefatos recuperáveis ao fim.

- [ ] T015 [P] [US2] Escrever testes de contrato para estados `active`, `deleting` e terminal sem fixar TTL ou tombstone em `tests/contracts/conversation/lifecycle.test.js`; perfil sugerido: QA; escopo: contrato de lifecycle.
- [ ] T016 [US2] Implementar transição de lifecycle que bloqueia novos appends/leitura e reconcilia o turno ativo por ledger em `server/agent/memory/lifecycle.js`; perfil sugerido: backend; depende de T005 e T012.
- [ ] T017 [US2] Implementar exclusão de transcript, checkpoints e summaries conforme configuração DEC-005 em `server/agent/memory/deletion-service.js`; perfil sugerido: backend/Postgres; depende de T016 e da política aprovada, sem política fica desabilitado.
- [ ] T018 [US2] Escrever teste de integração isolado para exclusão concorrente, interrupção e ausência de conteúdo recuperável em `tests/integration/conversation/deletion-race.test.js`; perfil sugerido: QA/segurança; depende de T016/T017; dados sintéticos.
- [ ] T019 [P] [US2] Validar que logs/auditoria só contêm metadados mínimos allowlisted em `tests/contracts/conversation/redaction.test.js`; perfil sugerido: segurança/QA; escopo: logging e audit, sem transcript.

## Fase 4 — US3: Separação de memória e contexto limitado (P2)

**Objetivo**: montar contexto limitado e verificável sem alterar transcript ou criar memória semântica cross-thread.

**Teste independente**: fixtures sintéticas com mensagens longas verificam orçamento injetado, cursor/fonte do summary e isolamento por conversa.

- [ ] T020 [P] [US3] Definir testes unitários de seleção de mensagens, orçamento e cursors de origem em `tests/unit/conversation/context-builder.test.js`; perfil sugerido: QA; escopo: context builder.
- [ ] T021 [US3] Implementar montagem de contexto por conversa e interface de compactação em `server/agent/memory/context-builder.js`; perfil sugerido: LangGraph; depende de T002 e SPEC-002; números vêm do runtime/modelo aprovado.
- [ ] T022 [US3] Implementar persistência/versionamento de summary derivado por conversa em `server/agent/memory/context-summary.js`; perfil sugerido: backend; depende de T021 e da política DEC-005; não chamar provedor real até DEC-006.
- [ ] T023 [P] [US3] Escrever teste de contrato garantindo que summary/checkpoint não são apresentados como histórico nem usados como verdade transacional em `tests/contracts/conversation/artifact-separation.test.js`; perfil sugerido: QA; escopo: separação de artefatos.
- [ ] T024 [US3] Escrever teste sintético de orçamento, cursor, versão e transcript canônico imutável em `tests/integration/conversation/context-compaction.test.js`; perfil sugerido: QA; depende de T021/T022; summarizer substituto local, sem provedor.
- [ ] T025 [US3] Verificar que nenhuma store cross-thread, embedding de transcript ou API de histórico privado é habilitada sem seus gates em `tests/security/conversation-private-access.test.js`; perfil sugerido: segurança; depende de T003/T022; testes isolados.

## Fase 5 — Integração e qualidade

- [ ] T026 [P] Conciliar envelope e fluxo com `CheckpointPort` e `ExecutionLedger` existentes de SPEC-002 por teste de contrato em `tests/contracts/conversation/spec-002-ports.test.js`; perfil sugerido: QA LangGraph; sem modificar arquivos de SPEC-002.
- [ ] T027 Validar configuração de persistência candidata e migrations aditivas em database isolado somente após runtime DEC-010 e retenção DEC-005 aprovados; arquivos futuros `supabase/migrations/` e `tests/integration/conversation/postgres-adapter.test.js`; perfil sugerido: Supabase/Postgres; bloqueado até lote exato autorizado.
- [ ] T028 [P] Atualizar `quickstart.md` e documentação de operações com os comandos e resultados reais depois da implementação autorizada; perfil sugerido: documentação/QA; escopo: documentação SPEC-003.
- [ ] T029 Revisar cobertura FR-001…FR-016 e SC-001…SC-007, segurança, evidência PASS/FAIL/NOT VERIFIED e compatibilidade de SPEC-002 em revisão final do lote aprovado; perfil sugerido: auditoria/QA; depende de todas as tarefas aplicáveis; não marcar conclusão sem evidência executada.

## Dependências e cobertura

- Fundação T001–T006 antecede as histórias onde seus contratos são consumidos.
- US1 requer gate DEC-001 para qualquer read/resume real; execução de testes usa doubles/dados sintéticos.
- US2 permanece desabilitada para produção até DEC-005 definir retenção, exclusão, exportação, compartilhamento e exceções.
- US3 pode testar algoritmo local com synthetic data, mas não resume transcrição real com provedor antes de DEC-006; limites exatos dependem DEC-010/011/012.
- T027 e qualquer persistência real exigem lote SDD contendo SPEC-003 aprovado explicitamente; esta lista não constitui autorização.
- **Rastreabilidade**: FR-001/002/011 → T003, T008, T025; FR-003/010 → T007, T010, T013; FR-004/005/015 → T004, T009, T011, T014, T026; FR-006/007 → T006, T019, T023; FR-008/009 → T015–T018; FR-012/016 → T012–T014, T016, T018; FR-013/014 → T020–T024; SC-001/002 → T007/T013; SC-003/007 → T009/T011/T014; SC-004 → T017/T018; SC-005 → T020/T024; SC-006 → T012/T013; segurança e integração → T019, T025–T029.

## Critério de conclusão futura

Todas as tarefas obrigatórias do lote aprovado têm evidência verificável; gates DEC-001/005/006/010/011/012 aplicáveis estão satisfeitos; testes usam database isolado e dados sintéticos; toda qualidade não executada é registrada como `NOT VERIFIED`. Esta SPEC permanece Draft até aprovação separada.
