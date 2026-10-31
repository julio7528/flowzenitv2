# Modelo de conversa e checkpoint — SPEC-003@3

**Estado**: modelo aprovado para implementação sintética pela SPEC-003; conteúdo real continua bloqueado por DEC-001.

## Conversation

| Campo | Regra |
|---|---|
| conversation_id | UUID opaco representado como texto para compatibilidade com PostgresSaver.thread_id; não autentica. |
| lifecycle | active, deleting, deleted. deleting nega leitura e escrita imediatamente. Conteúdo não é mantido em estado deleted. |
| created_at | Timestamp UTC de criação. |
| last_activity_at | Atualizado apenas por mensagem/turno válido aceito. |
| expires_at | last_activity_at + 365 dias sob dec005-spec003-v1. |
| last_message_seq | Máxima sequence canônica, alterada atomicamente sob lock da conversa. |
| policy_version | dec005-spec003-v1, para identificar a política aplicada. |
| active_turn_id | Reserva efêmera/durável do turno; não duplica o resultado do ExecutionLedger. |

## Message

| Campo | Regra |
|---|---|
| message_id | UUID persistente opaco. |
| conversation_id | FK para a conversa e cascata de exclusão. |
| message_seq | Bigint monotônico por conversa, unique(conversation_id, message_seq), ordem canônica. |
| turn_id | UUID gerado no server. |
| idempotency_key | Chave do request/turno, vinculada ao hash do payload; não é segredo. |
| role | user, assistant ou tool_summary allowlisted. |
| content | Conteúdo canônico classificado; sem prompt oculto, chain-of-thought, checkpoint bruto ou resultado privado de ferramenta. |
| created_at | Timestamp UTC; a ordem usa message_seq, não clock concorrente. |

## TurnReservation

A reserva liga conversation_id, idempotency_key, payload_hash, turn_id, status, tempos e replay reference segura. Unique por conversa/chave. A mesma chave/hash retorna resultado durável; chave/hash divergente retorna conflito sem duplicar mensagem. Estado de execução de side effect permanece no ExecutionLedger de SPEC-002.

## Checkpoint e CheckpointEnvelope

PostgresSaver 1.1.2 cria as tabelas oficiais checkpoint_migrations, checkpoints, checkpoint_blobs e checkpoint_writes no schema conversation_private. Todas mantêm thread_id como texto e têm FK para conversation_id. O adapter usa pool pg server-only e não executa setup.

Envelope adicional associa thread_id, checkpoint_ns/id, parentCheckpointId, graphVersion, stateSchemaVersion, serializerVersion, turnId, correlationId, digest e referências allowlisted do ledger. updated_at renova expires_at para no máximo 30 dias e nunca além de conversation.expires_at. A ausência do envelope correspondente impede resume.

Envelope não contém credential, provider raw body, private prompt, hidden reasoning ou conteúdo de conversa fora do estado mínimo necessário ao graph. Transcript e checkpoints têm vias de leitura e classificação diferentes.

## ContextSummary

A tabela armazena summary_format_version, summarizer_config_version, from_message_seq, through_message_seq, source_transcript_version e conteúdo derivado. Cada registro pertence a uma conversa e fica sujeito ao mesmo gate, expiry e deleção. Resumo não é fonte de verdade transacional e não altera mensagens. Testes usam apenas gerador sintético determinístico; nenhum provider recebe transcript.

## DeletionOperation

Registra request_id, conversation_id opaca, progresso e timestamps mínimos. Sem conteúdo. Pode permanecer por até 30 dias após a deleção para completar operação segura, e então é purgada. Não é sdd.audit_events nem o ledger append-only do supervisor.

## Relações, locks e exclusão

- Conversation tem mensagens, reserva, envelopes e summaries.
- Checkpoint saver usa thread_id = conversation_id; constraints cascata ligam checkpoint/blobs/writes à conversa.
- Append, reserva, activity renewal e alocação de sequence ocorrem numa transação com lock da linha conversation.
- Deletion muda lifecycle para deleting primeiro. Só depois de turn terminal/cancelado remove filas, blobs, checkpoints, envelopes, summaries, messages e metadados pós-purge. Erro conserva deleting e bloqueia acesso.
- Expiry pode usar a mesma deleção, mas não confunde checkpoint expirado com transcript expirado.

## Cursor e paginação

Cursor assinado contém cursorVersion, conversationId, pageSize, snapshotMaxMessageSeq, lastMessageSeq. HMAC-SHA-256 key é injetada server-only com ao menos 32 bytes. Comparação do MAC é timing-safe. Primeira página captura o max; continuations leem last < seq <= snapshot max e ordenam por seq ascendente. Cursor não autoriza acesso. Mudança concorrente depois do snapshot não é uma promessa de snapshot MVCC entre requests; mensagens novas aparecem em próxima paginação.

## Limites de contexto

ContextBuilder mede mensagens por estimator injetado de SPEC-002 e budget efetivo do runtime. Preserva cada mensagem escolhida inteira; se não couber, omite mensagens antigas ou usa summary válido pela origem/version. Summary não altera transcript. Se não for possível satisfazer orçamento com conteúdo completo, retorna budget_unavailable/needs_clarification em vez de truncar.

## Categorias fora do modelo

Nenhuma entidade owner/user/tenant/org, semantic memory, vector, transcript embedding, link público, API de history, endpoint export, domínio de produto ou tabela SDD.
