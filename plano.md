# Plano de evolução do agente: busca semântica e operações Supabase

**Status:** Rascunho para revisão do usuário  
**Escopo:** consultas e gravações tipadas em `demandas` e `recorrente`, busca híbrida com `pgvector`, sincronização por outbox e correção das consultas de rotinas sem data.

## 1. Objetivo

Permitir que o agente encontre registros usando o sentido da pergunta, confirme os fatos atuais nas tabelas do Supabase e registre novas demandas principais ou rotinas quando o usuário pedir. O pipeline de embeddings deve acompanhar gravações feitas pela interface, pelo agente ou por outros clientes.

## 2. Decisões confirmadas

1. Usar o mesmo projeto Supabase/Postgres para os dados de origem e os vetores, com `pgvector`.
2. Manter `demandas` e `recorrente` como fontes oficiais. Os vetores são uma projeção derivada para descoberta semântica.
3. Registrar eventos no outbox dentro da mesma transação que altera a tabela de origem. Um worker processa os eventos com retries e atualiza as projeções vetoriais.
4. A busca semântica retorna candidatos. Antes de afirmar status, datas, contagem ou hierarquia, o agente consulta os dados atuais por ferramentas estruturadas.
5. Combinar busca semântica e lexical para aceitar paráfrases e também priorizar termos exatos, nomes e IDs.
6. Para `demandas`, representar o contexto hierárquico no texto indexado, por exemplo: `FlowZenit > Projeto > Backend do RAG`. Mudanças em nomes ou vínculos de pais exigem reindexar os descendentes cujo caminho mudou.
7. `recorrente` é uma fonte independente. Não criar chave estrangeira nem vínculo com `demandas`. Se receber embeddings, terá uma projeção própria e continuará consultável separadamente.
8. A POC continua aberta para todos nesta etapa; não introduzir autenticação por usuário como parte deste escopo. As tabelas internas do pipeline não devem oferecer escrita genérica aos clientes.
9. Criar uma demanda principal significa inserir em `demandas` com `tipo = 1`, `raizid = null`, nome informado, status inicial `Backlog` e campos de agenda nulos.
10. Consultar rotinas aplicáveis a uma data continua sendo uma operação diferente de contar ou listar todos os cadastros. Perguntas sobre total de rotinas não devem pedir data.

## 3. Evidências e estado atual

Consulta somente leitura ao banco da POC encontrou 30 linhas em `demandas`: 9 principais (`tipo = 1`), 9 tarefas (`tipo = 2`) e 12 subtarefas (`tipo = 3`). Os exemplos confirmam que a demanda principal é um contexto ou frente organizadora: `EY > Entrevista > Preparar Entrevista` e `FlowZenit > Projeto > Backend do RAG`.

O código atual já oferece busca, consulta por ID e hierarquia de `demandas`. O agente pode criar tarefas, subtarefas e modelos de rotina. A operação de domínio `create_demand` está definida em contrato, mas ainda não foi ligada ao repositório Supabase nem exposta ao agente.

O nome físico atual da tabela é `public.recorrente` (singular). A ferramenta `getRoutineTemplates` exige uma data e retorna apenas rotinas válidas naquela data e dia da semana. Por isso, a pergunta “Quantas rotinas tenho cadastrada?” é indevidamente tratada como uma consulta de aplicabilidade por data.

No banco consultado, a extensão `vector` ainda não está instalada. O código não contém geração ou manutenção de embeddings.

## 4. Etapas propostas

### Etapa 0 — Preparar especificações e critérios

- Documentar contratos, decisões pendentes, critérios de aceitação e limites operacionais em SPEC(s) Draft.
- Definir o provedor/modelo de embeddings, dimensões do vetor, métrica, armazenamento da chave no servidor e política de troca de modelo.
- Definir meta de frescor do índice e frequência/tamanho dos lotes do worker.
- Definir como o worker será acionado dentro da arquitetura atual React/Vite, JavaScript, Supabase e Vercel.
- Manter o acesso público amplo da POC; não incluir mudança de autenticação nesta entrega.

### Etapa 1 — Habilitar a criação de demandas principais

- Implementar o caminho completo de `create_demand`: validação tipada, repositório fixo em `demandas`, escrita com `tipo = 1` e `raizid = null`, e leitura de confirmação pelo ID retornado.
- Permitir ao agente usar essa ferramenta somente após um pedido explícito na mensagem atual e com nome claro.
- Não aceitar `tipo`, `raizid`, nome de tabela, SQL ou permissões como campos livres do modelo.
- Confirmar o status `Backlog` e os campos nulos de agenda a partir do default/contrato do banco.
- Retornar sucesso somente com ID persistente confirmado; tratar timeout de modo incerto sem repetir a gravação automaticamente.

### Etapa 2 — Separar as consultas de recorrência

- Manter `getRoutineTemplates(date)` para listar rotinas aplicáveis à data informada.
- Adicionar consulta paginada de todos os modelos cadastrados, sem data.
- Adicionar contagem exata de modelos cadastrados (`COUNT(*)` de `recorrente`, não contagem de ocorrências) sem data; considerar data opcional somente para perguntas explícitas sobre rotinas aplicáveis naquele dia.
- Atualizar as instruções do agente: “quantas rotinas tenho cadastrada?” chama a contagem sem data; “quais rotinas valem em [data]?” usa a consulta de aplicabilidade.
- Preservar os campos `dias_semana`, `data_inicial` e `data_final` como filtros estruturados, sem inferir datas ausentes.

### Etapa 3 — Criar armazenamento vetorial e outbox

- Criar migration para habilitar `pgvector` no schema apropriado.
- Criar projeções vetoriais separadas e ligadas por ID: `demanda_embeddings` para registros de `demandas` e `recorrente_embeddings` para `recorrente`.
- Armazenar texto canônico indexado, embedding, hash do texto, versão do modelo e datas de processamento; dimensões devem corresponder ao modelo escolhido.
- Para `demandas`, gerar texto com o nome do registro e seu caminho hierárquico. Manter status, datas e horários como dados estruturados no banco de origem.
- Para `recorrente`, indexar o texto da rotina independentemente; manter dias e período como filtros estruturados e não criar vínculo com `demandas`.
- Criar outbox para eventos de insert, update e delete de ambas as tabelas. Triggers devem apenas registrar eventos no banco, sem chamar provedores externos durante a transação.
- Processar exclusões sem deixar vetores órfãos. Eventos de alteração de pai/nome devem reindexar os descendentes afetados.
- Incluir uma carga inicial idempotente de todas as linhas existentes e só declarar a busca semântica pronta quando os vetores estiverem completos; alterações posteriores entram pelo outbox.
- Definir RLS, grants e exposição via Data API para que o agente use somente consultas e funções permitidas, sem escrita genérica nas tabelas internas.

### Etapa 4 — Implementar worker resiliente

- Consumir eventos em lotes com claim/lease que evite dois workers processarem o mesmo evento simultaneamente.
- Gerar embeddings no servidor e fazer upsert/delete idempotente nas projeções vetoriais.
- Implementar retries com backoff, estado de falha terminal observável e reprocessamento manual controlado.
- Registrar versão do modelo e detectar conteúdo desatualizado por hash; suportar reindexação completa quando o modelo mudar.
- Adicionar reconciliação periódica entre registros de origem e projeções, para detectar eventos perdidos ou vetores obsoletos.
- Expor métricas operacionais mínimas: quantidade/idade dos eventos pendentes, falhas/retries e atraso entre gravação de origem e atualização do vetor.
- Considerar frescor eventual: a gravação original não deve falhar porque o provedor de embeddings está indisponível. Para registros recém-criados ainda não indexados, manter fallback lexical/estruturado.

### Etapa 5 — Integrar busca híbrida ao agente

- Criar RPC(s) de busca com parâmetros tipados, limite de resultados e filtros permitidos; aplicar filtros de tipo/status no servidor junto à busca.
- Criar índice HNSW para cada projeção vetorial, com métrica e classe de operador correspondentes ao modelo.
- Combinar ranking vetorial com resultado lexical; devolver IDs, origem, score e contexto suficiente para desambiguação.
- Expor ferramentas específicas do agente para buscar demandas/hierarquias e rotinas, sem SQL dinâmico.
- Após recuperar candidatos, consultar os registros atuais e seus relacionamentos pelas ferramentas estruturadas existentes antes de responder ou gravar.
- Se houver candidatos ambíguos, pedir ao usuário que escolha; não inferir um pai para criação de tarefa.

### Etapa 6 — Verificar comportamento e operação

- Verificar criação de demanda principal e confirmação do ID.
- Verificar que consultas por intenção semântica encontram o caminho hierárquico correto e que status/datas vêm sempre da tabela de origem.
- Verificar busca lexical/híbrida para IDs, nomes exatos, sinônimos e paráfrases.
- Verificar outbox para inserções/alterações/exclusões feitas por diferentes caminhos, retries, eventos repetidos, falha do provedor, mudança de raiz e reindexação de descendentes.
- Verificar que contagem/listagem geral de rotinas funciona sem data e que consultas de aplicabilidade usam filtros de data/dia corretos.
- Medir latência, recall, volume de eventos pendentes e frescor do índice com dados sintéticos em ambiente de teste isolado.
- Executar lint, build, testes unitários, integração, segurança e aceitação aplicáveis, registrando comandos e resultados reais.
- Seguir a regra do projeto para testes: banco fisicamente isolado por padrão; não escrever no projeto Supabase compartilhado sem autorização específica aplicável.

## 5. Critérios de aceitação principais

- “Crie uma demanda chamada X” cria uma demanda principal com `tipo = 1`, `raizid = null`, `Backlog` e ID confirmado.
- “Quantas rotinas tenho cadastrada?” responde a contagem total sem solicitar data.
- Consultas por data continuam retornando somente rotinas aplicáveis àquela data e aos dias da semana configurados.
- Uma alteração em qualquer fonte produz evento no outbox na mesma transação e, após processamento, atualiza a projeção vetorial correspondente.
- Busca semântica pode localizar paráfrases, enquanto fatos variáveis (status, datas, horários, contagens e hierarquia) são confirmados nas tabelas de origem.
- Falhas do worker não perdem eventos, não duplicam gravações e permitem recuperação/reconciliação.
- A busca não oferece ao modelo SQL arbitrário nem permissão para alterar tabelas de pipeline.

## 6. Governança de execução

Este arquivo é um plano Draft para revisão e pode orientar a elaboração das SPECs. Conforme as regras do projeto, a aprovação deste arquivo, isoladamente, não aprova SPEC nem autoriza implementação. A execução de código deverá ocorrer por `$sdd-run <batch-id>` após registrar SPEC(s) imutáveis, aprovar o manifesto exato do batch e passar pelas verificações de admissão. Nenhuma implementação ou alteração de banco foi feita ao criar este plano.

## 7. Referências locais e documentação

- `server/domain/read/repository.js` — consultas atuais em `demandas` e `recorrente`.
- `server/agent/tools/recurrence-capabilities.js` — contrato atual de leitura de recorrências, com data obrigatória.
- `server/domain/write/contracts.js` e `server/agent/tools/write-capabilities.js` — contrato e exposição atual das gravações.
- `supabase/migrations/20261027005028_demandas_hierarquia.sql` — relação hierárquica de `demandas`.
- `supabase/migrations/20261027125409_cadastro_demandas_recorrentes.sql` — tabela `recorrente`.
- [Supabase: busca semântica com pgvector](https://supabase.com/docs/guides/ai/semantic-search)
- [Supabase: busca híbrida](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase: índices vetoriais](https://supabase.com/docs/guides/ai/vector-indexes)
