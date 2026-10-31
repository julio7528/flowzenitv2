# Pesquisa técnica — SPEC-003@3 histórico, memória e checkpoints

**Estado**: decisão documental aprovada no escopo da SPEC; implementação depende de lote SDD exato aprovado.

## Verificações no checkout e supervisor (2026-10-29)

- GitHub main e checkout local apontavam para 5093e36bcd83eabbb91acb22288603deefa2f948. Checkout limpo; nenhum reset/pull/checkout foi executado.
- Supervisor registra SPEC-001@2, SPEC-002@2 e SPEC-004@2 como COMPLETED. SPEC-003 ainda não estava registrada. Não havia lote ativo.
- Node v24.13.0 e npm 11.6.2. Dependências instaladas: @langchain/core 1.3.1, @langchain/langgraph 1.5.3 e @supabase/supabase-js 2.118.0. LangGraph checkpoint transitive 1.2.1.
- Supabase project ref twikxeloeftczwbpjvzr, projeto flowzenithv2, ACTIVE_HEALTHY, PostgreSQL 17.11. Schema conversation_private e agent_memory não existiam. A inspeção foi de catálogo/ACL somente, sem acessar conteúdo de tabelas de produto.
- A pasta local não contém DATABASE_URL/CONVERSATION_DATABASE_URL. SUPABASE_SECRET_KEY é usada somente pelo cliente operacional SDD, nunca como autenticação ou acesso à memória privada.

## Checkpointer LangGraph

O npm metadata consultado para @langchain/langgraph-checkpoint-postgres 1.1.2 mostra ESM, Node >=18, peer @langchain/core ^1.1.44 e @langchain/langgraph-checkpoint ^1.2.0; versões instaladas satisfazem ranges. A implementação utiliza pg Pool e permite schema explícito. O pacote publicou seis migrations até a versão 1.1.2 que criam checkpoint_migrations, checkpoints, checkpoint_blobs e checkpoint_writes.

O método PostgresSaver.setup() cria schema e executa migrations por chamada; não será usado no runtime. A migration do produto copia as seis declarações da versão pinada, adiciona relações de lifecycle em FK e registra a versão 5. O código de runtime só usa as tabelas já migradas. Atualizar o pacote exige migration versionada e aprovação própria no SDD.

O checkpointer armazena checkpoints e writes em tabelas separadas. Seu DDL não implementa TTL. A SPEC mantém checkpoint_envelopes com versões, updated_at e expires_at. O serviço valida o envelope e ledger antes de invocar o graph; exclusão remove as tabelas oficiais por thread_id.

## Supabase e PostgreSQL

O projeto usa PostgreSQL 17.11; projeto exato foi identificado por MCP. O schema escolhido é conversation_private, privado, sem grants para PUBLIC/anon/authenticated/service_role e não incluído nos exposed schemas. Supabase docs explicam que custom schemas só chegam à Data API se forem expostos e receberem grants, e que transação-pooling serve a funções serverless, com restrição a statements preparados. O runtime de produção e o pooler concreto não foram verificados; nenhum acesso de Function é ativado.

O changelog atual do Supabase lista a mudança de exposição automática da Data API, com enforcement em todos os projetos em 2026-10-30. Esta SPEC não depende desse default: schema privado e revogações explícitas mantêm o isolamento. O changelog de PostgreSQL 17.11 não altera as operações usadas nesta migration.

Referências consultadas:
- https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/README.md
- https://supabase.com/docs/guides/api/using-custom-schemas
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/changelog?types=breaking-change
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes

## Decisões preservadas

- ConversationRepository é fonte canônica do transcript; PostgresSaver é exclusivamente estado interno do graph.
- ExecutionLedger continua propriedade de SPEC-002. Checkpoint nunca presume side-effect concluído.
- Summary é derivado, escopado à conversa e não altera a transcrição.
- Nenhum LangGraph Store, vector store, embedding, memória cross-thread, provider ou trace é criado.
- DEC-001 continua fechada. Sem autenticação server-side aprovada, IDs não autorizam consulta e todas as rotas de conversa ficam desabilitadas.

## Pendências que continuam operacionais

A política dec005-spec003-v1 não resolve DEC-005 para outras categorias. DEC-006 impede conteúdo real em provedores. DEC-001 impede qualquer read/write privado em request. O projeto não tem configuração de conexão de runtime e a disponibilidade de scheduler não foi verificada. O escopo só pode ser testado por fixtures sintéticas e SQL administrativo diretamente vinculado ao projeto de desenvolvimento.
