# Modelo de conversa e checkpoint — SPEC-003

**Estado:** modelo conceitual Draft; sem migration, schema ou tabela aprovada. O banco relacional de domínio continua a fonte de verdade para demandas, tarefas, subtarefas e rotinas.

## Entidades conceituais

### Conversation

| Campo candidato | Regra |
|---|---|
| `conversationId` | UUID opaco gerado no server. Localiza uma conversa e pode mapear 1:1 a LangGraph `thread_id`; não é principal, `ownerId`, segredo ou autorização. Não adicionar owner UUID. |
| `lifecycle` | `active`, `deleting`, `deleted` como estados de fluxo propostos; sem leitura/appends quando `deleting`/`deleted`. Retenção/tombstone dependem DEC-005. |
| `createdAt`, `updatedAt` | Instantes de storage para ordenação/operabilidade; não substituem timestamps civis de domínio. |
| `lastMessageSeq` | Maior sequência canônica, atualizada atomicamente com append. |
| `activeTurnId` | Referência/reserva de execução, se adapter aprovado optar por persistir; não duplica outcome ledger de SPEC-002. |

### Message (transcript canônico)

| Campo candidato | Regra |
|---|---|
| `messageId` | ID persistente opaco. |
| `conversationId` | FK para uma conversa do mesmo dataset único. |
| `messageSeq` | Inteiro monotônico único por conversa; chave `(conversationId,messageSeq)` e ordenação estável. Não autoriza acesso. |
| `turnId` | ID gerado pelo servidor que associa mensagem às tentativas/outcome do turno. |
| `role/origin` | `user`, `assistant`, ou `tool`; tool só tem resumo/salida allowlisted visível. O campo não sinaliza identidade autenticada. |
| `content` | Mensagem canônica com classificação de conteúdo; conteúdo tool bruto, chain-of-thought, prompts internos e state de grafo não fazem parte do transcript exibível. |
| `createdAt` | Timestamp de persistência e auditoria temporal do item; ordering é por `messageSeq`, não pelo clock concorrente. |
| `contentVersion` | Versão do formato/redaction se necessária para renderização/retention. |

### Graph checkpoint (artefato interno)

| Campo/metadado | Regra |
|---|---|
| `threadId` | Associado à conversation ID (mapeamento 1:1 candidato); valor curto/opaque. Não é auth. |
| `checkpointNs`, `checkpointId`, `parentCheckpointId` | Estrutura do LangGraph checkpointer, inclusive subgraph namespace e cadeia. |
| `graphVersion`, `stateSchemaVersion`, `serializerVersion` | Versões exigidas pelo SPEC-003 para compatibilidade. As duas últimas são envelope/metadata da integração; verificar por contract test junto à porta SPEC-002. |
| `turnId`, `correlationId` | Rastreiam a execução que produziu o checkpoint; não armazenar prompt ou correlação do cliente como autoridade. |
| `payload`, `pendingWrites` | Estado serializado interno; nunca retornado como histórico. Pode duplicar parte do contexto necessário ao turno. Excluir credenciais, segredo, autorização, provider raw body/reasoning, logs e context irrelevante. |
| `payloadDigest` | Candidato para corrupção acidental; não é assinatura, controle de acesso ou defesa contra ator que pode alterar payload e digest. |
| `expiresAt` | Derivado apenas da DEC-005 aprovada; sem valor/default até a aprovação. |

O candidato PostgresSaver pode encapsular as tabelas do library em schema próprio configurado. Não tratar essas tabelas como a DDL aprovada desta entidade conceitual. Não utilizar `sdd.checkpoints`.

### ConversationContextSummary (derivado, por conversa)

`{conversationId, fromMessageSeq, throughMessageSeq, summary, summaryFormatVersion, summarizerConfigVersion, sourceTranscriptVersion, generatedAt}`. Não é a transcrição, não atravessa threads e não é fonte para fatos transacionais exatos. É dado derivado de conversa, sujeito à mesma política de segurança/deleção; geração com dados reais aguarda DEC-006 e persistência DEC-005. Se não estiver disponível/compatível, remontar contexto do transcript ou pedir esclarecimento.

### TurnEnvelope e ExecutionLedger

TurnEnvelope conceitualmente liga `turnId`, request idempotency key server-side, conversation ID, graph version, status e IDs das mensagens. Estado de side effect/outcome é do `ExecutionLedger` de SPEC-002, não de um ledger paralelo. Resposta replayável exige outcome final durável e mensagens escritas uma vez.

### Outros tipos sem persistência aqui

- **Long-term semantic memory**: store cross-thread, preferences/facts. Fora do escopo; não criar LangGraph Store.
- **Domain context**: resultados typed de SPEC-004, efêmeros no turno e reconsultados quando precisam estar atuais.
- **AuditEvent**: SPEC-010; somente referências/metadados allowlisted conforme DEC-005/006, sem message/checkpoint payload.
- **Provider tracing**: externo; desligado até DEC-006/SPEC-010.

## Relações e transições

- Conversation 1:N Message; Conversation 1:N Checkpoint thread; Message/Checkpoint podem correlacionar com mesmo TurnEnvelope, mas um não é apresentado como o outro.
- Append atribui sequência dentro da transação; duplicata do mesmo turn/idempotency request retorna o mesmo resultado; não acrescenta messageSeq duas vezes.
- Lifecycle pode ir de `active` a `deleting` e depois remoção/tombstone conforme DEC-005; `deleting` bloqueia novos appends e reads. Corrida com execução ativa é resolvida por cancelamento e ledger/outcome antes de apagar state residual.
- Resume só ocorre se ID/thread, checkpoint/graph/state/serializer versions, checksum/decoder e status do ledger forem compatíveis. Expirado, corrupto ou estado incerto resulta em fail-closed.
- Conversation summary tem cursor de origem. Se mensagens após o cursor existem, contexto inclui deltas; resumo velho deve ser atualizado segundo futura política, nunca tratá-lo como completo.

## Paginação

Cursor lógico contém `cursorVersion`, `snapshotMaxMessageSeq` e `lastMessageSeq`; pode ser encoded opacamente pelo server. Primeira página captura `snapshotMaxMessageSeq`; páginas seguintes limitam a essa fronteira e ordenam ascendente por `messageSeq`. Mensagens novas acima do snapshot aparecem em uma próxima paginação, sem duplicar/pular itens da sequência existente. Cursor não é credencial e precisa do mesmo gate DEC-001.

## Compactação e limites

History is canonical and retained by its approved DEC-005 lifecycle. Per-turn context builder selects complete recent messages subject to the runtime/provider budget. If older content is summarized, summary carries exact covered sequence interval and format/model config version; keep source transcript unchanged. Numeric budgets and summarizer model remain pending SPEC-002/DEC-011/012; real transcript summarization waits DEC-006. Context summaries never replace typed reads for current domain data.

## Escopo de exclusão

No `owner_id`, additional user/org/tenant, separate appointment entity, cross-thread memory table, transcript embeddings, public history endpoint, provider trace, retention timestamp/default, deletion tombstone policy or DDL is approved by this model.
