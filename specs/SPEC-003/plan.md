# Plano técnico — SPEC-003 histórico conversacional persistente

**SPEC ID**: SPEC-003 | **Versão**: 4 | **Manifest hash**: atribuído somente ao criar lote
**Branch**: main preservada | **Data**: 2026-10-29 | **Spec**: [spec.md](spec.md)
**Status**: Draft — revisão POC; não autoriza implementação sem manifesto aprovado

## Decisões de arquitetura

- Preservar React/Vite, JavaScript ESM, Node.js 24, LangGraph.js 1.5.3, LangChain.js e Supabase PostgreSQL.
- Usar @langchain/langgraph-checkpoint-postgres 1.1.2 e node-postgres (pg) como checkpointer oficial. NPM metadata confirma Node >=18, @langchain/core ^1.1.44 e @langchain/langgraph-checkpoint ^1.2.0; o checkout tem core 1.3.1, LangGraph 1.5.3 e checkpoint 1.2.1. O contrato ESM é compatível.
- PostgresSaver aceita pool pg fornecido e schema configurável. Node 24 permite TCP/TLS; não é runtime Edge. Supabase PostgreSQL de desenvolvimento foi confirmado como 17.11. A compatibilidade de conexão do runtime Vercel e o pooler de produção permanecem não verificados e não serão ativados nesta SPEC.
- Não chamar PostgresSaver.setup() em inicialização de Function. Sua implementação executa CREATE SCHEMA e itera migrations automaticamente. A migration da SPEC copia e registra explicitamente as seis migrações da versão fixada 1.1.2, dentro de conversation_private, para que a versão instalada não tente DDL em runtime. Upgrade do pacote requer uma migration revisada.
- Implementar ConversationRepository, CheckpointAdapter, TurnCoordinator, CheckpointResume, ConversationLifecycle, DeletionService, ContextBuilder, ContextSummary e MemoryAccessGate. Não modificar a porta ou o ledger de SPEC-002; integrar por adaptador.
- O armazenamento e testes são internos. Nenhum endpoint, cliente frontend, credencial service_role ou provider é ligado à conversa real enquanto DEC-001/006 estiverem fechadas.

## Decisão DEC-005 com escopo limitado

A política dec005-spec003-v1, aprovada pelo proprietário neste escopo, cobre apenas conversa, checkpoint e resumo da SPEC-003. Não muda o estado global PENDING da DEC-005 para audit, memória de outro tipo ou outras SPECs.

| Artefato | Prazo e ação |
|---|---|
| Conversa e mensagens | Expirar 365 dias após última atividade válida. Cada turno aceito atualiza last_activity_at e expires_at. Verificar antes de toda leitura; purge em acesso ou rotina administrativa. |
| Checkpoints e pending writes/blobs | Máximo 30 dias desde última atualização válida, limitado por conversation.expires_at. Checkpoint expirado nunca retoma ferramenta. |
| Summary derivado | Mesmo conversationId e prazo da conversa; apagar quando a conversa expirar/deletar. |
| Deleção solicitada | Transação muda active para deleting; negar novas leituras/escritas; cancelar ou reconciliar turnos; remover artefatos. Falha parcial segue deleting até retry idempotente concluir. Sem grace, soft-delete de conteúdo ou tombstone de conteúdo. |
| Exportação | DTO JSON interno com mensagens canônicas e metadados mínimos; sem credenciais, raciocínio, checkpoint bruto ou payload privado. Sem endpoint enquanto DEC-001 fechada. |
| Compartilhamento | Desativado; nenhum link ou suporte multiusuário/tenant. |
| Auditoria operacional | Metadados allowlisted, sem conteúdo; eventos próprios podem durar até 30 dias pós-deleção quando outro contrato não exigir prazo maior. Não alterar ledger SDD. |

Sem cron/worker assumido, executar expiração em acesso antes do conteúdo e disponibilizar operação administrativa de manutenção para expurgo exato. O operador não recebe uma chave service_role para acessar histórico pela API. Um job agendado futuro permanece requisito operacional separado.

## Modelo de dados e migration proposta

Criar schema privado conversation_private, ausente no projeto verificado, separado de public e sdd. Não adicioná-lo a exposed schemas. REVOKE explícito de PUBLIC, anon, authenticated e service_role para schema, tabelas, sequences e rotinas; habilitar RLS sem policies nas tabelas de conteúdo como defesa adicional. Não criar grants novos, policies amplas, triggers de public API ou acesso de browser. Nenhuma tabela de produto ou migration histórica será modificada.

Tabelas aditivas no schema privado:
- conversations: conversation_id (texto UUID opaco para FK direta do PostgresSaver.thread_id), lifecycle, created_at, last_activity_at, expires_at, next/last message sequence e policy_version.
- messages: message_id, conversation_id, message_seq, turn_id, request key/dedupe key, role/origin allowlisted, content canônico e created_at; unique por conversa/sequência e chave de dedupe.
- turn_reservations: conversa/request key, payload hash, turn id, estado terminal/reservado e referência segura de replay; unique por conversa/request. Serializar operações por lock de linha da conversa.
- checkpoint_envelopes: referência a thread/namespace/checkpoint, versões de graph/state/serializer, turn/correlation, digest, ledger refs não sensíveis, updated_at/expiry; FK composta para tabelas oficiais do saver e cascade de deleção.
- context_summaries: intervalo exato de messageSeq, versão de formato/gerador, origem e payload derivado, por conversa.
- deletion_operations: request ID, estado e metadados mínimos de ciclo de vida; sem conteúdo e purge após até 30 dias.

Replicar as tabelas oficiais do PostgresSaver 1.1.2: checkpoint_migrations, checkpoints, checkpoint_blobs e checkpoint_writes. Criar conversations antes do saver tables. Registrar versões oficiais 0…5 na tabela de migrations para impedir setup em runtime de tentar executar DDL. Conservar as tabelas oficiais compatíveis; os índices e FK adicionais serão explícitos e testados.

Migration versionada com supabase migration new. Aplicar após aprovação do lote, somente por Supabase MCP ao project ref twikxeloeftczwbpjvzr. Conferir project/schema/roles antes e depois; nunca tocar sdd ou tabelas product. A migration é aditiva e não cria credenciais, usuários ou acesso Data API.

## Operações

### Gate e request path
MemoryAccessGate executa antes de qualquer repository/checkpointer/ledger/private handler. Enquanto DEC-001 fechada, retorna ACCESS_DISABLED. O endpoint já fechado de SPEC-002 permanece assim. Testes devem contar zero invocações privadas inclusive em erro e replay.

### Histórico
IDs UUID opacos são validados server-side. Primeira página captura snapshotMaxMessageSeq. Cursor autenticado contém versão, conversation id, pageSize, snapshot maximum e last sequence. Limitar pageSize entre 1 e 100; default 50. Continuations leem lastSeq < messageSeq <= snapshotMax e ordenam por sequence ascendente. Cursor inválido, adulterado, de outra conversa ou de outro pageSize não lê conteúdo. Novas mensagens após o snapshot ficam para uma nova paginação. Não prometer um snapshot MVCC estável entre requisições ou depois de exclusões.

### Turno e idempotência
Sob lock de linha da conversa, inserir/revalidar turn reservation por (conversation, request key), comparando hash de payload. Mesmo hash retorna outcome/replay existente; hash divergente retorna conflict. Alocar messageSeq e persistir append sob a mesma transação. Só uma execução por conversa. O ExecutionLedger de SPEC-002 continua fonte de verdade para side effects; started/uncertain/missing impede reexecução. Não criar ferramentas de escrita.

### Checkpoint e retomada
CheckpointAdapter usa PostgresSaver em schema explícito, com um Pool injetado e sem setup automático. Salvar envelope em tabela própria associada ao checkpoint ID. O envelope declara GRAPH_VERSION de SPEC-002, state schema/serializer version, turn ID, correlation ID, digest e ledger references. Resume preflight valida todas as versões/associações/digest/expiry e consulta ledger antes de chamar graph.invoke. Se qualquer verificação falhar, zero handlers de ferramenta. Expirar/remover checkpoint não apaga transcript.

### Retenção e deleção
Cada operação de acesso chama assertConversationUsable, que compara clock confiável com expires_at e marca deleting/realiza remoção antes de retornar bytes. Cleanup faz transação para bloquear, sinaliza cancelamento/consulta terminal do turno, remove messages/summaries, checkpoint_envelopes e todas as linhas do saver pelo thread_id, e confirma zero artefatos antes de remover conversation. Falha mantém deleting e retorno bloqueado. Retry é idempotente. Limpeza em acesso e comando administrativo cobrem falta de scheduler.

### Contexto
ContextBuilder recebe limite e estimator do runtime SPEC-002 e opera somente após gate. Ele escolhe mensagens completas e recentes sem ultrapassar o budget. Não trunca item estruturado. Se necessário, usa summary sintético/injetado da mesma conversa com from/through seq e formato; não chama DeepSeek/Gemini e não inclui fatos transacionais derivados como atuais. Transcript permanece imutável. Cursor e compaction version aparecem no contexto interno.

## Privacidade e acesso

- Cursor HMAC key e connection string são server-only, injetados em runtime; nenhuma chave fixa, VITE_ ou log de conteúdo. Ausência de configuração mantém adapter indisponível. A rotina administrativa exige project ref esperado e valida que SUPABASE_URL e host/usuário do connection string apontam ao mesmo projeto; divergência ou ausência encerra antes de qualquer SQL.
- Supabase Secret/service_role não autentica o proprietário e não é usado como adaptador de conversation repository.
- Sem query de conversas reais, envio externo, tracing privado ou acesso via UI.
- Fixtures sintéticas carregam IDs exclusivos. Registros persistidos durante testes são listados e removidos individualmente em ordem FK; verificar contagem zero depois. Preferir transaction/rollback onde o canal permitir.

## Estratégia de testes e quality gates

1. Unit: ID/cursor/HMAC/page size, budget, whole-message, envelopes, versions, digest, gate e redaction.
2. Contract LangGraph: adaptador conserva thread/namespace/checkpoint e versão; replay respeita ExecutionLedger e nunca executa outcome concluído.
3. PostgreSQL do Supabase: usar Supabase SQL MCP no projeto de desenvolvimento existente para schema/access ACL, inserts sintéticos, constraints, transações, expiry/deletion e cleanup. Confirmar projeto, schema, privilégios e ausência do marcador antes do primeiro write; preferir rollback e, quando o canal não permitir, remover apenas IDs sintéticos capturados.
4. Race/fault injection: duplicate same key; divergent payload conflict; two same-thread turns; deletion during active turn; injected mid-delete failure; retry completion; incompatible checkpoint and uncertain ledger; pagination after new messages.
5. Privacy: DEC-001 closed => zero calls; no transcript in errors/log/trace/provider/client bundle; no private schema in browser.
6. Project gates: npm test, npm run lint, npm run build, server-only bundle checks, all relevant security and contract checks; independent read-only final audit.

No Docker, local PostgreSQL, database branch, or test-only Node TCP connection is required for POC completion. A direct Node-to-PostgreSQL test remains optional; if not run, it is recorded as NOT VERIFIED and is never described as a pass. Node adapter behavior is covered by contract tests with a deterministic pool double; SQL MCP separately proves database behavior. Runtime PostgresSaver configuration remains server-only and must point to the same Supabase PostgreSQL project when the runtime is enabled. No migration/test may write outside `conversation_private` or touch pre-existing product rows. Every actual gate result gets a concise supervisor evidence record.

## Limitações deliberadas

- SDD status confirms SPEC-001@2, SPEC-002@2, SPEC-004@2 COMPLETED. No competing batch is active.
- Project ref and Postgres 17.11 were verified. Schema names conversation_private and agent_memory were absent; only sdd existed among the checked schemas.
- The direct Node adapter connection is not required to complete this POC gate. DEC-001 remains closed, so no storage is wired to a live private request. Real SQL contract checks use the project-bound Supabase MCP after admission.
- Vercel's actual production region, runtime DB configuration, service access, and pooler mode are not validated by this planning artifact and remain disabled.
- No scheduler is present/assumed. Expiration is enforced on access and by explicit maintenance invocation; scheduled expiry is not claimed.

## Existing compatibility
SPEC-002 ports are server/agent/persistence/ports.js: CheckpointPort.load/save and ExecutionLedger.reserve/recordStarted/recordOutcome/lookup. Do not change SPEC-002 files. Map metadata via versioned envelope and inject the ledger. The current StateGraph is real LangGraph and graph version is agent-turn-v1. Tool registry remains read-only under DEC-001.

## Entry and completion
Entry requires exact approved manifest containing SPEC-003@4 and successful supervisor admission. Execute through sdd-run only. Completion requires all tasks in the v4 task file, all FR/SC evidence, actual required commands, SQL MCP synthetic checks and cleanup verification, no unresolved required failures, independent auditor PASS, DEC-001 closed, and SDD completion. No deployment or publication.
