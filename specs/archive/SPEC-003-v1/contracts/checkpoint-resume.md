# Contrato de checkpoint e retomada — SPEC-003

**Estado:** adapter contract proposto sobre os ports `CheckpointPort`/`ExecutionLedger` da SPEC-002. Não escolhe schema, driver, version pin, retention ou runtime.

## CheckpointEnvelope

```text
CheckpointEnvelope = {
  threadId,
  checkpointNs,
  checkpointId,
  parentCheckpointId?,
  graphVersion,
  stateSchemaVersion,
  serializerVersion,
  turnId,
  correlationId,
  checkpointPayload,
  ledgerRefs: [{ idempotencyKeyRef, proposalHash, outcomeState }],
  payloadDigest?,
  expiresAt?
}
```

`threadId` é associado à conversa single-user e não é authorization principal. `stateSchemaVersion`, `turnId` e `serializerVersion` são requisitos do payload/metadata da integração SPEC-003; o adapter precisa preservar e validar com assinatura da `CheckpointPort` atual sem alterar SPEC-002 no planejamento. `expiresAt` só vem de DEC-005 aprovada.

## Preflight de retomada

1. Validar acesso antes de abrir CheckpointPort/ledger; gate fechado => `ACCESS_DISABLED`, zero private calls.
2. Validar o conversation/thread id e resolver exatamente um checkpoint/thread/cursor.
3. Conferir parse/schema, serializer/version, graph/state version, turnId, checkpoint namespace/parent e digest se aprovado.
4. Verificar expiração conforme policy version DEC-005. Nenhum TTL presumido.
5. Consultar durable ExecutionLedger para cada side effect correlacionado. `completed` retorna outcome sem reexecutar; `not_started` só segue se o checkpoint identifica ponto seguro; `started/uncertain/missing` sem conclusão não executa ferramenta e pede reconciliação/terminal failure.
6. Invocar somente a graph versão compatível. Timeout/retry não converte erro do checkpoint em conversa vazia.

## Resultados

`READY`, `NOT_FOUND`, `INVALID_ID`, `CORRUPT`, `INCOMPATIBLE_GRAPH`, `INCOMPATIBLE_STATE`, `EXPIRED`, `LEDGER_UNRESOLVED`, `ACCESS_DISABLED`, `DEPENDENCY_UNAVAILABLE`. Nenhuma falha retorna payload interno ou permite ferramenta pendente. Log de erro contém código e correlation, nunca checkpoint JSON.

## Durabilidade e concorrência

LangGraph oferece durability modes; proposta para avaliar é checkpoint sync em transições que antecedem/seguem side effects, sujeito a custo/runtime test sob DEC-010. A ledger continua fonte de verdade para tool outcomes, mesmo com checkpoint sync. Checkpointer não é “exactly once”. Mesma thread não roda duas continuações concorrentes sem uma reserva/serialização explícita; replay requer checkpoint + ledger consistente.

## Retenção e integridade

Schema/format validation é obrigatório. Digest pode detectar corrupção acidental e não confere autenticidade; não substitui DEC-001 nem integridade do database. Expiry/pruning requer DEC-005. Produção não salva checkpoint enquanto essa decisão e gate de acesso não estiverem satisfeitos.
