---
description: "Tarefas versionadas da SPEC-003@3; execução somente pelo lote SDD exato aprovado."
---

# Tarefas: SPEC-003 — Histórico, memória e checkpoints

**Entradas**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md.
**Pré-requisitos**: SPEC-001@2 e SPEC-002@2 COMPLETED. SPEC-004@2 fornece contratos de leitura. Implementação exige exclusivamente SPEC-003@3 num manifesto SDD aprovado.
**Política**: dec005-spec003-v1 somente para conversa/checkpoint/summary nesta SPEC. DEC-005 global continua PENDING para outras categorias. DEC-001 continua fechado; produção não acessa storage privado.
**Estado**: tarefas ordenadas; nenhuma foi executada ao preparar este snapshot.

## Convenção
- [P] marca somente tarefas independentes com arquivos graváveis disjuntos.
- Cada tarefa indica perfil configurado do futuro sdd-run e seus caminhos próprios.
- T001–T029 preservam a cobertura original; T030–T034 adicionam cobertura operacional que a política aprovada tornou necessária; T035 é auditoria independente final.
- Nenhuma tarefa usa conversa real, dados privados de produto ou provedor externo.

## Fase 1 — Fundação e contratos

- [ ] T001 [P] Criar fixtures sintéticas de mensagens, checkpoints, ledger, expiração, corrupção, concorrência e exclusão em tests/fixtures/conversation/; perfil sdd_qa_tests; escopo somente fixtures.
- [ ] T002 [P] Definir DTOs, validação de IDs, cursor, paginação, erros e contrato de export em server/agent/memory/conversation-contracts.js; perfil sdd_backend_api; escopo somente contratos.
- [ ] T003 [P] Implementar MemoryAccessGate server-side fail-closed em server/agent/memory/access-gate.js; perfil sdd_security_guardrails; sem autenticação nova e sem chamadas privadas com DEC-001 fechado.
- [ ] T004 [P] Definir envelope versionado/digest de checkpoint em server/agent/memory/checkpoint-envelope.js; perfil sdd_langgraph_rag; escopo envelope e teste unitário próprio.
- [ ] T005 Definir interfaces/adaptadores de ConversationRepository em server/agent/memory/conversation-repository.js, sem mudar ports.js nem ledger de SPEC-002; perfil sdd_backend_api; depende de T002.
- [ ] T006 [P] Definir configuração server-only injetável e logging allowlisted em server/agent/memory/config.js e safe-logging.js; perfil sdd_security_guardrails; sem valores de segredo em fonte ou evidência.

## Fase 2 — US1: histórico e retomada segura (P1)

- [ ] T007 [P] Testar IDs, HMAC cursor, vínculo conversa/pageSize, snapshot e limite 50/100 em tests/unit/conversation/cursor.test.js; perfil sdd_qa_tests.
- [ ] T008 [P] Testar gate fechado com zero chamadas a repository, checkpoint, ledger e handlers em tests/unit/conversation/access-gate.test.js; perfil sdd_security_guardrails.
- [ ] T009 [P] Testar envelope, versões, digest e preflight de checkpoint em tests/contracts/conversation/checkpoint-resume.test.js; perfil sdd_qa_tests.

### Substrate PostgreSQL — prerequisite dos adapters

- [ ] T027 Criar migration aditiva e prova PostgreSQL real isolada em supabase/migrations/ e tests/integration/conversation/postgres-adapter.test.js; perfil sdd_supabase_postgres; PostgresSaver 1.1.2 com setup fora do runtime, fixtures no project ref verificado, cleanup exato, schema/ACL e versão de migration comprovados.
- [ ] T010 Implementar append canônico, sequence monotônica, dedupe e paginação snapshot no adaptador em server/agent/memory/conversation-repository.js; perfil sdd_backend_api; depende de T002/T005/T027.
- [ ] T011 Implementar CheckpointAdapter e CheckpointResume sobre portas SPEC-002 em server/agent/memory/checkpoint-resume.js; perfil sdd_langgraph_rag; depende de T003/T004/T009/T027; ledger inconclusivo bloqueia toda ferramenta.
- [ ] T012 Implementar TurnCoordinator e lock/reserva por conversa em server/agent/memory/turn-coordinator.js; perfil sdd_backend_api; depende de T005/T010/T027.
- [ ] T013 Testar integração real de paginação, sequência e dois turnos concorrentes em tests/integration/conversation/history-concurrency.test.js; perfil sdd_qa_tests; depende de T010/T012/T027; fixtures sintéticas.
- [ ] T014 Testar checkpoint expirado/corrupto/incompatível e ledger uncertain em tests/integration/conversation/resume-fail-closed.test.js; perfil sdd_qa_tests; depende de T011/T027; comprovar zero ferramenta.
- [ ] T015 [P] Especificar e testar máquina active/deleting/deleted sem recovery window em tests/contracts/conversation/lifecycle.test.js; perfil sdd_qa_tests; somente contrato.
- [ ] T016 Implementar transição que bloqueia read/append e reconcilia turn ativo em server/agent/memory/lifecycle.js; perfil sdd_backend_api; depende de T005/T012.
- [ ] T017 Implementar remoção idempotente de todos os artefatos, incluindo saver blobs/writes, em server/agent/memory/deletion-service.js; perfil sdd_supabase_postgres; depende de T016/T027.
- [ ] T018 Testar corrida delete/turno e ausência de conteúdo recuperável em tests/integration/conversation/deletion-race.test.js; perfil sdd_qa_tests; depende de T016/T017/T027; fixtures sintéticas.
- [ ] T019 [P] Verificar allowlist de metadados e ausência de conteúdo em logs/eventos em tests/contracts/conversation/redaction.test.js; perfil sdd_security_guardrails.
- [ ] T020 [P] Testar seleção de mensagens completas, orçamento, cursor e versão de summary em tests/unit/conversation/context-builder.test.js; perfil sdd_qa_tests.
- [ ] T021 Implementar ContextBuilder sob budget SPEC-002 em server/agent/memory/context-builder.js; perfil sdd_langgraph_rag; depende de T002/SPEC-002@2.
- [ ] T022 Implementar summary derivado e versionado por conversa em server/agent/memory/context-summary.js; perfil sdd_backend_api; depende de T021/T027; sem provider externo.
- [ ] T023 [P] Testar separação entre transcript, summary, checkpoint e fatos de domínio em tests/contracts/conversation/artifact-separation.test.js; perfil sdd_qa_tests.
- [ ] T024 Testar budget, origem, versão e transcript imutável em tests/integration/conversation/context-compaction.test.js; perfil sdd_qa_tests; depende de T021/T022/T027; summarizer determinístico sintético.
- [ ] T025 Testar DEC-001 fechado, ausência de store cross-thread/embeddings e nenhum endpoint privado em tests/security/conversation-private-access.test.js; perfil sdd_security_guardrails; depende de T003/T022.
- [ ] T026 [P] Contrato de compatibilidade com CheckpointPort e ExecutionLedger de SPEC-002 em tests/contracts/conversation/spec-002-ports.test.js; perfil sdd_qa_tests; não editar files de SPEC-002.

## Fase 3 — lifecycle, paginação, concorrência e segurança adicionados

- [ ] T030 Implementar expiry-on-access, purge administrativo escopado e relatório de resíduos em server/agent/memory/retention.js, scripts/conversation-maintenance.js e tests/security/conversation/maintenance-target.test.js; perfil sdd_supabase_postgres; exigir project ref e conferir SUPABASE_URL com host/usuário da conexão antes de SQL; depende de T016/T017/T027; sem scheduler presumido.
- [ ] T031 Testar cursor adulterado/de outra conversa, alteração entre páginas, snapshot máximo e nova paginação em tests/security/conversation/history-cursor.test.js; perfil sdd_security_guardrails; depende de T010.
- [ ] T032 Testar dois requests idênticos simultâneos, payload divergente sob a mesma chave e ausência de side effect duplicado em tests/integration/conversation/idempotency-race.test.js; perfil sdd_qa_tests; depende de T012.
- [ ] T033 Testar falha induzida no meio da exclusão, permanência deleting/inacessível e reconciliação idempotente em tests/integration/conversation/deletion-recovery.test.js; perfil sdd_qa_tests; depende de T017/T030.
- [ ] T034 Testar zero acessos privados com gate fechado, server-only dependencies, bundle Vite, logs e provider stub com sentinelas sintéticas em tests/security/conversation/server-boundary.test.js; perfil sdd_security_guardrails; depende de T003/T006.
- [ ] T028 Atualizar quickstart.md e operação com comandos realmente executados, configuração ausente e limites não habilitados; perfil sdd_qa_tests; depende de T001–T027 e T030–T034; sem alegar endpoint disponível.
- [ ] T029 Montar tabela final de evidências FR/SC PASS/FAIL/NOT VERIFIED em specs/SPEC-003/checklists/acceptance-evidence.md; perfil sdd_orchestrator; depende de T001–T028 e T030–T034; não substituir auditoria independente nem marcar gates não executados.
- [ ] T035 Auditoria independente read-only de requisitos, migration/ACL, fixture cleanup, gates e estado SDD em specs/SPEC-003/checklists/final-audit.md; perfil sdd_spec_auditor; depende de todas as tarefas e gates aplicáveis.

## Rastreabilidade

- FR-001: T002/T003/T025.
- FR-002: T002/T003/T008/T025/T034.
- FR-003: T002/T007/T010/T013/T031.
- FR-004: T004/T009/T011/T026/T027.
- FR-005: T009/T011/T014/T026.
- FR-006: T006/T019/T023/T028/T034.
- FR-007: T006/T019/T034.
- FR-008: T015/T017/T027/T030.
- FR-009: T015/T016/T017/T018/T027/T030/T033.
- FR-010: T002/T007/T010/T013/T031.
- FR-011: T003/T008/T025/T034.
- FR-012: T012/T016/T018/T033.
- FR-013: T020/T021/T024.
- FR-014: T021/T022/T023/T024.
- FR-015: T004/T009/T011/T014/T027.
- FR-016: T012/T013/T032/T033.
- SC-001: T007/T008/T014.
- SC-002: T007/T010/T013/T031.
- SC-003: T009/T011/T014.
- SC-004: T017/T018/T027/T030/T033.
- SC-005: T020/T021/T022/T024.
- SC-006: T012/T013/T032.
- SC-007: T009/T011/T014.
- Segurança e escopo: T003/T006/T019/T025/T027/T034.
- Auditoria e evidência: T028/T029/T035.

## Condição de conclusão

As 35 tarefas obrigatórias do manifesto precisam estar COMPLETED com evidências. Cada gate obrigatório precisa de execução e evidência real. PostgreSQL usa apenas schema conversation_private no projeto de desenvolvimento confirmado e fixtures sintéticas removidas. DEC-001 continua fechado. Não retomar a implementação depois de limite/pausa do supervisor sem autorização explícita de resume.
