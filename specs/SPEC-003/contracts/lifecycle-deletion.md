# Contrato de ciclo de vida, retenção e exclusão — SPEC-003@3

**Política limitada**: dec005-spec003-v1. Aplica-se apenas à conversa, checkpoints e summaries da SPEC-003; DEC-005 global permanece pendente para outros armazenamentos.

## Prazos

- Histórico e mensagens: expiração em last_activity_at + 365 dias; atividade válida renova o prazo.
- Checkpoint/envelope/writes/blobs: expiração no máximo 30 dias desde última atualização válida e nunca além da expiração da conversa.
- Summary e derivados: expiram e são excluídos com a conversa.
- Metadados próprios de operação de exclusão, sem conteúdo, podem permanecer até 30 dias após a conclusão se nenhum outro contrato exigir retenção diferente.

Verificar o prazo antes de qualquer read/resume e não retornar conteúdo expirado. Remoção de checkpoint expirado não remove o transcript que ainda está dentro do prazo.

## Transições

active -> deleting -> deleted. A primeira etapa é transacional. deleting bloqueia toda leitura, novo turno e append. Nenhum conteúdo fica recuperável em deleted. Não há content soft-delete, grace period ou tombstone com conteúdo.

## Deleção e falha

1. Validar solicitação via caminho interno autorizado; nenhum endpoint é exposto com DEC-001 fechado.
2. Marcar lifecycle deleting e rejeitar reads/writes simultâneos.
3. Cancelar turno ativo ou consultar o ExecutionLedger durável para seu estado terminal; estado incerto não permite novo efeito.
4. Remover messages, context_summaries, checkpoint_envelopes, checkpoints, blobs, pending writes e cache/derivados conhecidos em transações delimitadas.
5. Verificar zero artefatos acessíveis e só então remover a linha de conversa e marcar a operação concluída.
6. Em falha parcial, conservar deleting, negar acesso e repetir a limpeza idempotentemente. Nunca declarar concluída enquanto qualquer categoria recuperável persistir.

## Expiração e operação sem scheduler

Expiry-on-access bloqueia conteúdo expirado e aciona purga delimitada. A rotina administrativa varre somente conversation_private e apenas registros vencidos sob policy_version esperada. Ela exige project ref esperado, confere SUPABASE_URL com o host/usuário do connection string e aborta antes de SQL se o projeto não corresponder. Produz contagens/IDs sintéticos de evidência, sem conteúdo. A rotina é manual até existir scheduler autorizado e validado; não alegar execução periódica automática.

## Preservação e categorias

Conversation deletion não toca demandas, recorrências, schema sdd, auditoria append-only SDD ou outras entidades do produto. Não há store semântico, embedding ou compartilhamento nesta SPEC. Logs registram apenas metadados mínimos allowlisted e nunca transcript, prompt, checkpoint ou payload de tool.
