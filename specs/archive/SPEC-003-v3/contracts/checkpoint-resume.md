# Contrato de checkpoint e retomada — SPEC-003@3

**Estado**: adapter contract sobre CheckpointPort e ExecutionLedger da SPEC-002. O PostgresSaver oficial 1.1.2 é usado em schema explícito já criado por migration; setup nunca roda no runtime.

## CheckpointEnvelope

Campos obrigatórios:
- conversationId/threadId, checkpointNs, checkpointId e parentCheckpointId opcional.
- graphVersion, stateSchemaVersion e serializerVersion.
- turnId, correlationId e ledgerRefs allowlisted.
- payloadDigest, updatedAt e expiresAt.

O envelope é separado de mensagens. A persistência oficial do graph usa checkpoint_migrations, checkpoints, checkpoint_blobs e checkpoint_writes em conversation_private. Envelope ausente impede resume.

## Preflight

1. Executar MemoryAccessGate antes de repository, saver, ledger ou ferramenta. DEC-001 fechado => ACCESS_DISABLED e zero chamadas privadas.
2. Validar conversation/thread id, lifecycle e policy/expiry da conversa.
3. Carregar checkpoint exato e envelope correlacionado; validar namespace, IDs, turno, versões, serialização, digest e vínculo de conversa.
4. Exigir now < expiresAt; o prazo não excede 30 dias da última atualização válida nem expires_at da conversa. Checkpoint expiry não apaga nem expira transcript.
5. Consultar ExecutionLedger para cada efeito. Outcome completed retorna a resposta segura já durável sem repetir o efeito. not_started só pode prosseguir em checkpoint seguro. started, uncertain, missing ou erro do ledger bloqueia continuação.
6. Invocar apenas graph version compatível, após todos os checks. Nenhum estado inválido pode invocar um handler.

## Outcomes

READY, NOT_FOUND, INVALID_ID, CORRUPT, INCOMPATIBLE_GRAPH, INCOMPATIBLE_STATE, INCOMPATIBLE_SERIALIZER, EXPIRED, LEDGER_UNRESOLVED, ACCESS_DISABLED, CONVERSATION_DELETING e DEPENDENCY_UNAVAILABLE.

Outcomes não retornam checkpoint JSON ou conteúdo privado. Errors/logs carregam somente categoria allowlisted e correlação segura.

## Save, integridade e compatibilidade

O adapter compõe sobre PostgresSaver e CheckpointPort sem modificar o código/assinatura de SPEC-002. Pool é injetado server-side; nenhum segredo ou chave é hard-coded. O migration registra a versão do schema do pacote fixado e o runtime não chama setup.

Digest detecta corrupção acidental, não autentica dados ou impede administrador de banco de alterar payload. Sempre validar versão, esquema e ledger além do digest. Mudança incompatível de graph/state/serializer resulta em bloqueio seguro até migração/conversão aprovada.

## Deleção

Remover checkpoint envelope, checkpoints, blobs e writes de todos os namespaces pelo threadId dentro do ciclo idempotente de deleção. Não deixar thread persistido recuperável depois do estado deleted.
