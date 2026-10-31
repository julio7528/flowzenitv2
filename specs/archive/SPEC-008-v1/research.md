# Pesquisa técnica — SPEC-008

**Estado**: documental e Draft. Consultas a arquivos/migrations locais e documentação oficial atual em 2026-10-28. Nenhuma conexão com Supabase, Gemini API, migration, pacote ou teste foi executada.

## Baseline do checkout

- Não encontrei `pgvector`, coluna `vector`, `tsvector`/Full Text Search, embedding, RAG, outbox, consumidor ou worker nas migrations e código de produto. A única migration de extensão encontrada habilita `pgcrypto` para governança SDD, não `vector`.
- `supabase/config.toml` contém `[storage.vector]`; esse bloco é configuração de Vector Buckets do Storage e não comprova extensão PostgreSQL `pgvector` habilitada.
- As fontes relacionais são `public.demandas` e `public.recorrente`. `demandas.demanda` é o texto do item; `tipo` e `raizid` formam demanda → tarefa → subtarefa. As colunas atuais de status, data e horas seguem as constraints/triggers já existentes. Rotinas são templates em `recorrente`, independentes da hierarquia e sem identidade persistida de ocorrência.
- O schema não contém `updated_at` nem revision confirmado. IDs `demandas.id` e `recorrente.id` são `bigint`.
- As telas escrevem diretamente via Supabase browser client em várias rotas. Não há produtor central que possa ser assumido como fonte completa de eventos. A alteração de uma tabela fonte e seu evento de sincronização precisam ser atômicos.
- O produto atual não declara package Gemini/LangChain para indexação. `package.json` contém React/Vite, `@supabase/supabase-js`, Node tests e Supabase CLI; não contém provider Gemini/worker.
- Não encontrei testes de integração para index, outbox, provider fake ou sincronização. O checklist confirma estratégia proposta, não execução.
- A RLS/grants de algumas fontes existentes permitem operações à role `anon`. Isso registra o comportamento atual; não é controle de acesso apropriado ao worker, nem satisfaz DEC-001.

Referências locais úteis: [hierarquia de demandas](../../supabase/migrations/20261027005028_demandas_hierarquia.sql), [cadastro de rotina](../../supabase/migrations/20261027125409_cadastro_demandas_recorrentes.sql), [modelo de consultas SPEC-004](../SPEC-004/contracts/read-tools.md), [registro central de decisões](../agent-requirements-and-decisions.md).

## Gemini Embedding: documentação consultada

A página oficial de Embeddings consultada lista, na data desta pesquisa, `gemini-embedding-2` e `gemini-embedding-001`. A página declara dimensão flexível de 128–3072 e recomenda 768, 1536 e 3072; informa limite de entrada 8192 tokens para modelo 2 e 2048 para 001. O modelo 2 aceita mais modalidades; este escopo só considera texto aprovado. Modelos têm espaços incompatíveis; a documentação orienta re-embed dos itens ao migrar de 001 para 2. O parâmetro `task_type` é aplicável a 001 e não suportado por 2; a normalização para dimensões reduzidas também difere. Esses dados informam compatibilidade, não escolhem o modelo, dimensão, modo de tarefa nem biblioteca. Tudo isso continua condicionado à DEC-011 e deve ser revalidado antes de implementar.

Fonte primária: [Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings), seções de versões do modelo e migração. Nenhuma request foi enviada.

## pgvector e compatibilidade

- Supabase documenta `vector` via extensão `pgvector`; embeddings de modelos diferentes não devem ser comparados. A distância e ordenação devem usar operador compatível com o índice e com o vector armazenado.
- A página atual de índices pgvector/Supabase documenta HNSW e IVFFlat. Em pgvector 0.7+, índices ANN suportam até 2000 dimensões para `vector` e até 4000 para `halfvec`. A API Gemini permitir 3072 dimensões, portanto não basta selecionar um modelo: extensão instalada, tipo vetorial, índice/opclass, operador de distância e dimensão precisam ser compatíveis.
- `halfvec` reduz precisão de armazenamento. É alternativa técnica, não decisão. Dimensão reduzida e re-embedding também são alternativas. Nenhuma é assumida aprovada.
- A extensão/version do projeto não foi consultada; nenhuma versão ou índice de produção pode ser inferida por configuração local.
- HNSW é a recomendação geral dos docs da Supabase para vetores com volume, mas ANN pode reduzir recall e filtros seletivos podem retornar menos candidatos. Para o corpus atual pequeno, busca exata ou ausência de índice ANN pode ser apropriada até benchmarking.

Fontes primárias: [Supabase vector columns](https://supabase.com/docs/guides/ai/vector-columns), [Supabase vector indexes](https://supabase.com/docs/guides/ai/vector-indexes), [pgvector README](https://github.com/pgvector/pgvector).

## Feed confiável e execução assíncrona

Atualizações de embeddings exigem chamadas externas e não devem ocorrer dentro da transação da tela. Um evento durável no mesmo commit da fonte separa atomicidade da origem do tempo do provider. A documentação oficial Supabase demonstra esse padrão com triggers, pgmq/Queues e função assíncrona. A documentação atual descreve Queues como mecanismo Postgres-native com entrega durável; a arquitetura deste projeto ainda não escolhe essa opção nem presume exatamente-once para o handler. O contrato permanece idempotente e tolera entrega/replay repetidos.

A alternativa de outbox transacional interna ou Supabase Queues/pgmq depende de DEC-010 e da revisão dos privilégios que assegurem captura de todas as escritas atuais sem expor eventos, nem criar acesso privado não autorizado. Nenhuma fila foi criada.

Fontes primárias: [Supabase Queues](https://supabase.com/docs/guides/queues), [Supabase automatic embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings). O guia de embeddings é referência de arquitetura; seus triggers/Edge Functions não foram copiados como decisão.

## Abordagens de representação e sincronização

1. **Um chunk por registro (proposta base para avaliação)**: mantém entidade, ID e parent IDs separados; evita fundir árvores diferentes. Títulos vazios/curtos podem ser omitidos ou terem baixo sinal.
2. **Contexto de linhagem dentro do texto**: inclui nomes de ancestrais para desambiguar subtarefas; aumenta o sinal potencial, mas muda embeddings dos descendentes quando um ancestral renomeia.
3. **Linhagem somente como metadado**: reduz reindexação quando nome do pai muda; recuperação pode não captar termos de ancestral no vetor.
4. **Rotina recorrente**: se DEC-007 aprovar indexação, tratar cada template como tipo separado; não materializar dia/horário como uma ocorrência, não converter em compromisso e não misturar na hierarquia `demandas`.

DEC-007 deve escolher campos, tratamento de nomes curtos e se há ganho suficiente. A política de embedding não inclui status, data/hora ou valores de planejamento por padrão. Eles podem ser colunas metadata separadas para filtros posteriores, sujeitas a atualização e verificação da fonte. Mudança de status/horário não chama Gemini se o texto e hierarquia textual não mudaram. Mudança de pai/título reindexa apenas quando altera o input canônico aprovado.

## Segurança, operação e decisões pendentes

- **DEC-001**: nenhuma leitura privada pelo worker nem endpoint de consulta até controle de acesso adequado aprovado, implementado e verificado. IDs de fonte/filas não autorizam acesso.
- **DEC-006**: sem campo allowlist/redaction/localização/retention aprovada, não enviar texto real ao Gemini, nem provider tracing. IDs, status, schedule e parent metadata também não devem sair sem aprovação específica.
- **DEC-007**: define corpus, regra de skip/chunk/template e ganho mínimo qualitativo, sem inventar threshold.
- **DEC-010**: runtime, region, worker/queue, connection lifecycle, tempo e retry execution.
- **DEC-011**: modelo exato, geração/versionamento, dimensão, compatibilidade e política de reindexação/cutover.
- **DEC-012**: contenção das chamadas externas; não inventar orçamento ou taxa.
- Falhas, lag e divergência serão expostos como métricas agregadas e códigos de evento, sem conteúdo, vetor, request body, chave ou transcript.
- A versão antiga do vetor permanece inativa após exclusão/inelegibilidade. A consulta também deve validar a fonte relacional em tempo real ou aplicar uma prova equivalente de frescor antes de retornar qualquer texto.

## Conclusão da pesquisa

O desenho pode especificar contratos e testes sintéticos agora. A arquitetura produtiva e o valor de embeddings não estão aprovados. A fonte atual tem pouco texto, nenhuma extensão pgvector confirmada, nenhuma outbox e várias escritas de browser. Recomenda-se validar primeiro um corpus sintético pequeno, comparar semântica contra FTS/consultas estruturadas e adiar geração real se o ganho não justificar disclosure externo, custo operacional e manutenção.
