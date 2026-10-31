# Checklist de qualidade da SPEC-003@3

**Feature**: ../spec.md
**Scope de decisão**: dec005-spec003-v1 apenas para persistência conversacional SPEC-003; DEC-005 global permanece PENDING.

## Conteúdo

- [x] Jornadas cobrem histórico/retomada, ciclo de vida e separação de artefatos.
- [x] Exclusões bloqueiam autenticação nova, endpoints privados, sharing e memória semântica cross-thread.
- [x] Gate DEC-001 precede toda operação privada e seus testes exigem zero chamadas de storage.
- [x] Política de retenção, checkpoint, summary, exclusão, exportação e sharing definida com escopo específico e prazos.
- [x] Sem soft-delete de conteúdo, recovery grace, tombstone de conteúdo ou scheduler presumido.
- [x] Schema privado, migration PostgresSaver pinada e revogações estão especificados sem grants de produto.
- [x] Tarefas preservam T001–T029 e cobrem os FR/SC; T030–T035 cobrem novos testes e auditoria.

## Completude e verificação

- [x] FR-001 a FR-016 têm mapeamento para tarefas e comportamento mensurável.
- [x] SC-001 a SC-007 têm testes de aceitação específicos.
- [x] Idempotência inclui concorrência, payload divergente e não repetição de efeito concluído.
- [x] Cursores estão vinculados a conversa, tamanho, versão e snapshot e verificam integridade.
- [x] Checkpoint inclui graph/state/serializer, turn, namespace, digest, expiry e ledger.
- [x] Context budget nunca trunca mensagem estruturada ou altera transcript.
- [x] PostgreSQL real sintético, cleanup exato, zero resíduos e ACL são quality gates.
- [x] API/export não fica disponível; provider não recebe transcrições reais; DEC-001 permanece fechada.

## Escopo da checklist

Checkboxes indicam presença no desenho e nas tarefas. Não afirmam implementação, execução de teste, aplicação de migration ou aprovação SDD. Esses resultados serão preenchidos pela evidência do lote.
