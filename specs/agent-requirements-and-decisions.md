# FlowZenit V2 — requisitos compartilhados do agente

**Estado:** referência de especificação `Draft`; não autoriza dependências, migrações, lote, execução ou deploy. Revisar junto com [`roadmap.md`](./roadmap.md).

## 1. Fonte e classificação dos requisitos

Este documento separa fatos observados no checkout dos requisitos fornecidos pelo usuário e de decisões ainda abertas. As SPECs não devem transformar uma pendência em regra por suposição.

### 1.1 Confirmado no repositório

- O frontend atual é React/Vite e usa `@supabase/supabase-js` diretamente no navegador. As páginas leem e alteram `public.demandas` e `public.recorrente`.
- O projeto já contém `api/agent/turn.js` e módulos em `server/agent/`; a passkey usa `sessionStorage` e continua sendo somente um mecanismo de navegação, sem autenticação server-side.
- As migrations concedem leitura/escrita à role `anon` em tabelas de produto com políticas permissivas. O proprietário aceita usar essas permissões atuais para o agente POC e aceita que esse caminho é público. Nenhuma política, grant ou privilégio será ampliado.
- `public.demandas` tem `id bigint`, `demanda text`, `tipo smallint`, `raizid bigint`, `status`, `data_exec date`, `hora_inicio time without time zone` e `hora_fim time without time zone`. A hierarquia é 1=demanda, 2=tarefa, 3=subtarefa. `raizid` aponta para o pai; exclusão do pai é restrita quando há filhos.
- Status editável pertence à subtarefa (`Backlog`, `Analise`, `Executando`, `Aguardando`, `Done`). Status de tarefa e demanda é calculado pelos filhos e usa `Backlog`, `Em andamento` ou `Done`; registros sem filhos permanecem `Backlog`.
- Planejamento semanal aloca demanda sem tarefas ou tarefa por `data_exec`; subtarefas não são cartões semanais. Planejamento diário trabalha subtarefas. A subtarefa precisa ficar na mesma semana da tarefa alocada. Mover a tarefa de semana limpa data e horários das subtarefas que ficaram fora da semana.
- Horários diários são intervalos locais sem fuso. A migration de eventos simultâneos removeu a rejeição de sobreposição; a UI representa sobreposições em colunas adjacentes. As SPECs devem preservar isso, salvo decisão aprovada em outra especificação.
- `public.recorrente` é uma tabela separada de modelos de rotina, com texto `demanda`, `hora`, `hora_fim` opcional, `dias_semana smallint[]`, `data_inicial` e `data_final`. Ela não tem FK para `demandas`, identidade de ocorrência, exceção por ocorrência nem entidade de compromisso. No planejamento diário, as ocorrências de rotina são exibidas como somente leitura.
- Não há uma entidade independente de compromissos/calendário nas migrations encontradas. A fonte relacional atual continua sendo a autoridade para dados transacionais; títulos de demandas são curtos e não incluem campos de descrição ou comentários no modelo verificado.
- `npm test` é a suíte Node atual; há `npm run test:sdd-db` para um smoke transacional do plano de controle SDD. Não há comando E2E/Playwright declarado no `package.json`.
- Spec Kit `1.2.4` está instalado; `.specify/feature_numbering` é sequencial; a integração Codex existe. `specify preset resolve spec-template` resolve `.specify/templates/spec-template.md`. Não existe `.specify/extensions.yml`, então não há hooks antes/depois de `specify`.

### 1.2 Requisitos fornecidos pelo usuário

- Backend controlado para LangGraph.js/LangChain.js, modelo de resposta DeepSeek já definido, Supabase PostgreSQL, memória conversacional, guardrails, LangSmith, auditoria e dashboard.
- Revisão de escopo da POC confirmada em 2026-10-30: recuperação RAG somente pelo Postgres do Supabase existente, reutilizando busca textual tipada; sem Docker, banco local/branch, embeddings/Gemini, pgvector, RRF, outbox, worker ou armazenamento secundário. O modelo existente de resposta permanece em SPEC-002.
- Ferramentas estruturadas para consulta e mutação; nenhuma SQL arbitrária gerada pelo modelo. Consultas transacionais exatas usam SPEC-004; descoberta textual usa searchItems no Postgres Supabase, com provenance, sem prometer sinonímia vetorial.
- O agente POC consulta dados tipados e pode criar uma tarefa, subtarefa ou template de rotina por pedido explícito. Edição, exclusão, status e agendamento ficam fora desse escopo.
- Decisões aprovadas para a primeira versão: aplicação pessoal de proprietário único, mantendo a passkey e o caminho de acesso existentes sem implementar nova autenticação; usar somente as entidades existentes, sem entidade independente de compromisso; fuso IANA America/Cuiaba. A passkey no navegador não verifica a identidade do proprietário no servidor.
- O chat POC mantém somente o contexto ativo em memória no navegador e envia contexto limitado ao provedor existente; não grava histórico ou checkpoint.
- Pesquisa externa Tavily é opcional e separada.
- Guardrails incluem validação de entrada/saída, allowlist de ferramentas, proteção contra prompt injection e filtragem de dados sensíveis. Criação clara de um registro segue DEC-009 sem confirmação adicional.
- Cada SPEC define unit, integração, contratos, banco/RLS, E2E, segurança e avaliação de agente na proporção do risco. Não presumir testes aprovados sem executá-los.

## 2. Contratos de domínio compartilhados

### 2.1 Dados transacionais

| Conceito | Identidade e campos confirmados | Regra que as ferramentas precisam preservar |
| --- | --- | --- |
| Demanda/tarefa/subtarefa | `demandas.id`, `demanda`, `tipo`, `raizid`, `status` | Tipo e pai são validados; hierarquia não pode ser reclassificada para contornar a validação. |
| Alocação semanal | `demandas.data_exec` | Só demanda sem tarefa ou tarefa pode ser cartão semanal; subtarefa não. |
| Execução diária | subtarefa com `data_exec`, `hora_inicio`, `hora_fim` | Data fica na semana da tarefa pai; intervalo é `hora_inicio < hora_fim`; os campos representam data civil e horário local sob America/Cuiaba, sem conversão UTC na persistência existente. |
| Rotina recorrente | `recorrente.id`, texto, horário, dias da semana e vigência | É template de rotina, não compromisso nem subtarefa; o agente POC pode consultar e criar templates, sem editar ocorrências. |

IDs persistentes nunca são derivados de numeração visual. Valores de status de pai não são escritos pelo agente; alterações de status são dirigidas a subtarefas e a aplicação/banco recalcula os pais.

### 2.2 Contrato lógico de uma ferramenta

Cada chamada do agente contém contexto de execução, ID de correlação, nome/versão da ferramenta e payload validado. O endpoint é público e não usa identidade de proprietário; o acesso aceito fica limitado às permissões anon existentes e às ferramentas tipadas da POC. O modelo pode propor nome e argumentos; o runtime valida esquema, capacidade e regras de domínio.

Ferramentas de leitura e escrita são separadas por capacidade. Uma ferramenta não recebe SQL, nome de tabela ou coluna arbitrário. Respostas de leitura informam quando o resultado está vazio, parcial, truncado ou desatualizado. Mutações retornam o registro confirmado pela fonte relacional.

## 3. Princípios de dados e confiança

1. PostgreSQL Supabase é a fonte única do RAG. A consulta lê os dados atuais; não há cópia vetorial nem índice assíncrono. Leituras exatas usam SPEC-004.
2. Checkpoints de estado do grafo, conteúdo de conversa, memória semântica do usuário, documentos indexados e auditoria permanecem separados em acesso, retenção e exclusão.
3. A POC preserva a aplicação e a passkey client-side sem adicionar autenticação, sessão, UUID de proprietário, tenant ou gestão multiusuário. O proprietário aceita que o agente use o caminho público anon atual; isso não o torna privado nem amplia seus privilégios.
4. Dados recuperados, páginas web e texto de registros são conteúdo não confiável. Nunca podem alterar instruções de sistema, ampliar ferramentas ou fornecer autorização.
5. Tracing não é autorização nem auditoria única. Tokens, API keys, dados de autenticação, prompts privados e conteúdo de conversa não entram em logs sem uma política explícita e redaction testada.
6. A POC de RAG consulta diretamente a fonte Supabase via ferramenta tipada; update e delete são observados pela leitura atual, sem outbox ou worker.
7. Para esta POC, DEC-006 permite enviar ao DeepSeek já configurado contexto limitado do chat ativo e campos tipados necessários. LangSmith/tracing e outros provedores permanecem desabilitados.

## 4. Registro de decisões

| ID | Estado | Decisão | Evidência/limite |
| --- | --- | --- | --- |
| DEC-001 | APPROVED — POC scope (2026-10-30) | Manter as permissões Supabase anon atuais e permitir que o agente POC use essas mesmas permissões. Endpoint e dados acessíveis são públicos e sem autenticação; o proprietário aceita essa exposição durante a POC. | Sem Supabase Auth, service_role, mudança de grant/RLS/schema ou deploy. A passkey atual segue apenas como navegação client-side. |
| DEC-002 | APPROVED | Usar demanda, tarefa, subtarefa e rotina recorrente existentes; não criar entidade independente de compromisso/calendário. | Pedido incompatível recebe explicação, sem registro artificial. |
| DEC-003 | APPROVED | Usar America/Cuiaba para datas relativas e horários locais. | Preservar valores civis date/time sem conversão silenciosa para UTC. |
| DEC-004 | PENDING | Semântica de exceção de recorrência, ocorrência isolada, feriados, cancelamento e restauração. | Não há exceções/ocorrências persistidas; esse escopo fica fora da POC. |
| DEC-005 | PENDING globalmente | Retenção, exclusão, exportação e compartilhamento de histórico, memória e checkpoints em geral. | O chat desta POC não persiste histórico. A decisão anterior scoped à SPEC-003 continua limitada àquela SPEC. |
| DEC-006 | APPROVED — POC scope (2026-10-30) | DeepSeek já configurado pode receber contexto limitado do chat ativo e somente campos tipados do FlowZenit necessários para a resposta/ação atual. | Sem credenciais, passkey, cookies, outros chats, persistência de histórico ou tracing externo. O endpoint/provedor público e seu custo são aceitos na POC. |
| DEC-007 | PENDING | Conteúdo e estratégia para futura indexação semântica. | Não bloqueia o RAG textual atual via Postgres Supabase/SPEC-009. |
| DEC-008 | APPROVED | O dashboard existente é para o proprietário único e preserva o caminho atual. | Não aprova nova autenticação, tenants ou exposição adicional de dados privados. |
| DEC-009 | APPROVED — POC scope (2026-10-30) | Um pedido explícito e claro pode criar uma tarefa, subtarefa ou template de rotina por vez sem confirmação extra. Campos ausentes/ambíguos exigem pergunta antes da gravação. | Sem delete, rename, status, agendamento, edição de template ou ação em lote. Não autentica o chamador. |
| DEC-010 | PENDING para recursos futuros | Região/runtime ampliado, execução longa, background e filas. | A POC usa o endpoint atual; não adiciona worker ou fila. |
| DEC-011 | PENDING globalmente | Versão/modelo e política de troca para além do DeepSeek já configurado na POC. | A POC reutiliza o provedor existente, sem escolher outro. |
| DEC-012 | PENDING para política financeira futura | Orçamento e limite de abuso monetário. | A POC preserva limites técnicos existentes e não define bloqueio financeiro novo. |
| DEC-013 | PENDING | Significado de dia da semana sem data e de “próxima semana”. | A SPEC-007 pede esclarecimento; não inventa uma data. |

DEC-001/006/009 estão aprovadas somente para as capacidades enumeradas nesta POC. Decisões pendentes continuam aplicáveis a funcionalidades futuras e não bloqueiam o escopo fechado nas SPEC-001@3, SPEC-002@3, SPEC-005@2, SPEC-006@2, SPEC-007@2 e SPEC-012@2.

## 5. Pendências e escopo por SPEC

As novas versões Draft do agente aplicam as decisões POC acima. Linhas antigas de outras SPECs e capacidades futuras não ampliam esse escopo.

| SPEC | Escopo/pendência atual |
| --- | --- |
| SPEC-001 | Abrir o gate fixo do agente para a POC pública usando as permissões anon existentes. Sem autenticação ou alteração de permissões. |
| SPEC-002 | Ativar o runtime DeepSeek/LangGraph existente com contexto limitado do chat ativo e ferramentas tipadas. Sem persistência/tracing. |
| SPEC-003 | Histórico persistente não faz parte do chat desta POC; SPEC-003@4 concluída não é repetida no lote. |
| SPEC-004 | Consultas exatas tipadas concluídas em SPEC-004@2; reutilizar o contrato. |
| SPEC-005 | Aplicar a matriz POC DEC-009; manter validação de entrada/saída e contenção de prompt injection. |
| SPEC-006 | Criar somente tarefa e subtarefa via Supabase JS/PostgREST, com hierarquia existente e permissões anon atuais. |
| SPEC-007 | Consultar/criar template de rotina existente. Sem editar/deletar template, ocorrência ou exceção. DEC-013 continua exigindo clarificação para frases ambíguas. |
| SPEC-008 | Busca textual Supabase concluída em SPEC-008@2; sem vector, provider de embedding, outbox ou worker. |
| SPEC-009 | RAG lexical Supabase concluído em SPEC-009@2; reutilizar evidência/proveniência tipada. |
| SPEC-012 | Entregar chat na UI React/Vite; contexto apenas em memória; sem histórico persistente ou deploy. |
| SPEC-013–015 | E2E amplo, release/deploy e busca externa permanecem fora deste lote. |

## 6. Baseline de testes

Toda SPEC executada roda npm test, npm run lint, npm run build e seus contratos proporcionais, registrando comandos e resultados reais. Testes PostgREST de escrita desta POC usam doubles determinísticos; qualquer escrita de fixture em banco deve seguir isolamento aprovado e nunca tocar dados existentes. Não usar Docker, banco local ou conexão Node pg. O código de produto usa exclusivamente o projeto Supabase existente via Supabase JS/PostgREST. Testes de UI verificam navegação, teclado e tamanhos 1440/820/390 quando aplicável. Provedores externos usam doubles em testes de rotina; nenhum teste faz smoke real no DeepSeek sem autorização específica. Falha não executada permanece NOT VERIFIED.

## 7. Referências oficiais consultadas

- [LangGraph.js persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence): checkpointer (thread) e store (entre threads) são persistências distintas.
- [LangChain.js tools](https://docs.langchain.com/oss/javascript/langchain/tools): ferramentas têm schemas estruturados; entradas geradas pelo modelo ainda precisam de validação e tratamento de erro.
- [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/) e [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/): tool calls são propostas de função; strict mode é beta e não substitui validação local.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) e [proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api): chaves secret/service-role têm acesso elevado e bypass de RLS; devem ficar no servidor e não substituem políticas de ferramenta nem confirmações de escrita.
- [LangSmith observability](https://docs.langchain.com/langsmith/observability) e [evaluation types](https://docs.langchain.com/langsmith/evaluation-types): tracing e avaliações offline/online têm papéis distintos.
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [limits](https://vercel.com/docs/functions/limitations) e [streaming](https://vercel.com/docs/functions/streaming-functions): duração, streaming e região dependem do runtime e plano.
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search): integração opcional; a resposta externa continua sendo conteúdo não confiável.

## 8. Aprovação do proprietário para o agente POC — 2026-10-30

O proprietário aprovou o seguinte escopo funcional para o agente POC:

O gate em `server/security/accessGate.js` é somente uma decisão fixa de entrada para callbacks tipados criados pelo servidor. Ele não cria cliente ou credencial Supabase, não executa SQL arbitrário e não concede privilégios ao PostgreSQL. Cada operação continua sujeita às grants/RLS anon atuais do projeto Supabase; o endpoint e os dados já acessíveis por anon são públicos e sem autenticação nesta POC.

- Manter permissões anônimas/RLS atuais do Supabase. O agente usa apenas o projeto e as operações tipadas sobre public.demandas e public.recorrente; sem Docker, PostgreSQL local, direct pg, service_role ou mudança de schema/grants/RLS.
- Aceitar que endpoint e dados acessíveis pela role anon são públicos e sem autenticação durante a POC. A passkey client-side não autentica o servidor.
- Usar o DeepSeek existente com contexto limitado do chat ativo e os campos tipados necessários; não enviar outras conversas, credenciais, cookies ou passkey. Tracing externo permanece desligado.
- Permitir uma criação clara por pedido: tarefa, subtarefa ou template recorrente. Pedir dados quando faltarem ou forem ambíguos. Outras mutações ficam desabilitadas.
- Entregar o chat na UI atual, sem persistir histórico e com aviso claro do acesso público e do envio ao modelo.
- A aprovação funcional não aprova deployment. Para implementação, o manifesto imutável exato ainda precisa de aprovação pelo fluxo SDD do projeto.
