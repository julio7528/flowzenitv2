# FlowZenit V2 — requisitos compartilhados do agente

**Estado:** referência de especificação `Draft`; não autoriza dependências, migrações, lote, execução ou deploy. Revisar junto com [`roadmap.md`](./roadmap.md).

## 1. Fonte e classificação dos requisitos

Este documento separa fatos observados no checkout dos requisitos fornecidos pelo usuário e de decisões ainda abertas. As SPECs não devem transformar uma pendência em regra por suposição.

### 1.1 Confirmado no repositório

- O frontend atual é React/Vite e usa `@supabase/supabase-js` diretamente no navegador. As páginas leem e alteram `public.demandas` e `public.recorrente`.
- Não foram encontrados diretórios `api/`, `server/` ou `supabase/functions/`, `vercel.json`, cliente Supabase Auth ou login Supabase. O gate atual usa passkey local no navegador e `sessionStorage`; ele continua sendo apenas um mecanismo existente de navegação.
- As migrations concedem operações de leitura/escrita à role `anon` em dados de produto com políticas `USING (true)`/`WITH CHECK (true)`. Essa exposição permanece sem alteração neste escopo e é um risco não resolvido; não autoriza novos endpoints do agente. Capacidades que leiam dados privados ou executem operações privilegiadas ficam bloqueadas até um controle de acesso adequado ser aprovado, implementado e verificado.
- `public.demandas` tem `id bigint`, `demanda text`, `tipo smallint`, `raizid bigint`, `status`, `data_exec date`, `hora_inicio time without time zone` e `hora_fim time without time zone`. A hierarquia é 1=demanda, 2=tarefa, 3=subtarefa. `raizid` aponta para o pai; exclusão do pai é restrita quando há filhos.
- Status editável pertence à subtarefa (`Backlog`, `Analise`, `Executando`, `Aguardando`, `Done`). Status de tarefa e demanda é calculado pelos filhos e usa `Backlog`, `Em andamento` ou `Done`; registros sem filhos permanecem `Backlog`.
- Planejamento semanal aloca demanda sem tarefas ou tarefa por `data_exec`; subtarefas não são cartões semanais. Planejamento diário trabalha subtarefas. A subtarefa precisa ficar na mesma semana da tarefa alocada. Mover a tarefa de semana limpa data e horários das subtarefas que ficaram fora da semana.
- Horários diários são intervalos locais sem fuso. A migration de eventos simultâneos removeu a rejeição de sobreposição; a UI representa sobreposições em colunas adjacentes. As SPECs devem preservar isso, salvo decisão aprovada em outra especificação.
- `public.recorrente` é uma tabela separada de modelos de rotina, com texto `demanda`, `hora`, `hora_fim` opcional, `dias_semana smallint[]`, `data_inicial` e `data_final`. Ela não tem FK para `demandas`, identidade de ocorrência, exceção por ocorrência nem entidade de compromisso. No planejamento diário, as ocorrências de rotina são exibidas como somente leitura.
- Não há uma entidade independente de compromissos/calendário nas migrations encontradas. A fonte relacional atual continua sendo a autoridade para dados transacionais; títulos de demandas são curtos e não incluem campos de descrição ou comentários no modelo verificado.
- `npm test` é a suíte Node atual; há `npm run test:sdd-db` para um smoke transacional do plano de controle SDD. Não há comando E2E/Playwright declarado no `package.json`.
- Spec Kit `1.2.4` está instalado; `.specify/feature_numbering` é sequencial; a integração Codex existe. `specify preset resolve spec-template` resolve `.specify/templates/spec-template.md`. Não existe `.specify/extensions.yml`, então não há hooks antes/depois de `specify`.

### 1.2 Requisitos fornecidos pelo usuário

- Backend controlado para LangGraph.js/LangChain.js, DeepSeek como modelo principal, Gemini Embedding, Supabase PostgreSQL/pgvector, RAG híbrido (FTS + vetor + RRF), memória conversacional, guardrails, LangSmith, auditoria e dashboard.
- Ferramentas estruturadas para consulta e mutação; nenhuma SQL arbitrária gerada pelo modelo. Consultas transacionais exatas usam ferramentas estruturadas; RAG só é usado quando melhora a recuperação semântica.
- Operações de domínio incluem demandas, tarefas, subtarefas, planejamento diário/semanal, status e recorrências, preservando hierarquia, horário, idempotência e regras de status.
- Decisões aprovadas para a primeira versão: aplicação pessoal de proprietário único, mantendo a passkey e o caminho de acesso existentes sem implementar nova autenticação; usar somente as entidades existentes, sem entidade independente de compromisso; fuso IANA America/Cuiaba. A passkey no navegador não verifica a identidade do proprietário no servidor.
- Memória de conversa, contexto de domínio, checkpoints e auditoria são categorias distintas, vinculadas ao contexto apropriado da aplicação/conversa e às respectivas políticas de retenção. A ausência de nova autenticação não autoriza acesso do agente a dados privados.
- Pesquisa externa Tavily é opcional e separada.
- Guardrails incluem validação de entrada/saída, autorização por ação, proteção contra prompt injection, confirmação para ações de risco e filtragem de dados sensíveis.
- Cada SPEC define unit, integração, contratos, banco/RLS, E2E, segurança e avaliação de agente na proporção do risco. Não presumir testes aprovados sem executá-los.

## 2. Contratos de domínio compartilhados

### 2.1 Dados transacionais

| Conceito | Identidade e campos confirmados | Regra que as ferramentas precisam preservar |
| --- | --- | --- |
| Demanda/tarefa/subtarefa | `demandas.id`, `demanda`, `tipo`, `raizid`, `status` | Tipo e pai são validados; hierarquia não pode ser reclassificada para contornar a validação. |
| Alocação semanal | `demandas.data_exec` | Só demanda sem tarefa ou tarefa pode ser cartão semanal; subtarefa não. |
| Execução diária | subtarefa com `data_exec`, `hora_inicio`, `hora_fim` | Data fica na semana da tarefa pai; intervalo é `hora_inicio < hora_fim`; os campos representam data civil e horário local sob America/Cuiaba, sem conversão UTC na persistência existente. |
| Rotina recorrente | `recorrente.id`, texto, horário, dias da semana e vigência | É modelo de rotina read-only na agenda; não é um compromisso nem uma subtarefa. |

IDs persistentes nunca são derivados de numeração visual. Valores de status de pai não são escritos pelo agente; alterações de status são dirigidas a subtarefas e a aplicação/banco recalcula os pais.

### 2.2 Contrato lógico de uma ferramenta

Cada chamada do agente contém o contexto de execução aplicável, ID da conversa quando houver, ID de correlação, nome/versão da ferramenta e payload validado; DEC-001 não adiciona autenticação, principal de usuário ou UUID do proprietário. Essa ausência não autoriza acesso a dados privados: operações protegidas permanecem indisponíveis até que um controle de acesso adequado seja aprovado, implementado e verificado. O modelo pode propor nome e argumentos; o runtime valida esquema, capacidade e regras de domínio.

Ferramentas de leitura e escrita são separadas por capacidade. Uma ferramenta não recebe SQL, nome de tabela ou coluna arbitrário. Respostas de leitura informam quando o resultado está vazio, parcial, truncado ou desatualizado. Mutações retornam o registro confirmado pela fonte relacional.

## 3. Princípios de dados e confiança

1. PostgreSQL transacional é a fonte de verdade. Embeddings e cache são índices reconstruíveis, nunca autoridade para status, datas, permissões ou existência de registro.
2. Checkpoints de estado do grafo, conteúdo de conversa, memória semântica do usuário, documentos indexados e auditoria permanecem separados em acesso, retenção e exclusão.
3. A primeira versão é uma aplicação pessoal de proprietário único. Preserva a passkey e o caminho de acesso existentes, sem adicionar autenticação, sessão, UUID de proprietário, tenant ou gestão multiusuário. A passkey client-side não autentica o proprietário no servidor. A exposição pública/anônima existente não é considerada resolvida nem aceita como base para novos endpoints; capacidades protegidas do agente ficam bloqueadas até controle de acesso adequado.
4. Dados recuperados, páginas web e texto de registros são conteúdo não confiável. Nunca podem alterar instruções de sistema, ampliar ferramentas ou fornecer autorização.
5. Tracing não é autorização nem auditoria única. Tokens, API keys, dados de autenticação, prompts privados e conteúdo de conversa não entram em logs sem uma política explícita e redaction testada.
6. Indexação deve usar outbox transacional ou contrato equivalente de entrega confiável, consumidor idempotente, retries limitados, dead-letter/reprocessamento auditável e remoção/tombstone na exclusão da fonte.
7. Nenhuma integração externa envia dados de FlowZenit até que escopo de campos, consentimento/aviso, retenção do fornecedor e região de processamento sejam aprovados.

## 4. Registro de decisões

| ID | Estado | Decisão | Evidência/impacto e dependências |
| --- | --- | --- | --- |
| `DEC-001` | **APPROVED — interpretação consolidada em 2026-10-28** | FlowZenit V2 é uma aplicação pessoal de proprietário único. Manter a passkey e o caminho de acesso existentes, sem implementar Supabase Auth, novas sessões, MFA, cadastro de usuários, tenants, organizações ou multiusuário nesta etapa. A passkey existente é somente client-side e não verifica o proprietário no servidor. | **Histórico:** a exigência anterior de proprietário verificado no servidor foi substituída e não é reinstaurada aqui como solução. A interpretação posterior que tratava a exposição anon como aceita para novas capacidades do agente também fica substituída: o acesso atual permanece como está, mas é risco não resolvido. Endpoints do agente que exponham dados privados ou operações privilegiadas ficam bloqueados até um controle de acesso adequado ser aprovado, implementado e verificado. Esta DEC não escolhe nem aprova esse mecanismo. Supabase Secret/service_role não substitui autenticação/autorização do proprietário. Credenciais privilegiadas permanecem fora do frontend. |
| `DEC-002` | **APPROVED** | Na primeira versão, usar somente demanda, tarefa, subtarefa e rotina recorrente existentes; não criar entidade independente de compromisso/calendário. | Pedido incompatível deve receber explicação e não pode gerar registro artificial. Nova entidade requer uma SPEC futura e aprovação separada. |
| `DEC-003` | **APPROVED** | Usar America/Cuiaba como fuso IANA para datas relativas e horários locais. | Interpretar limites civis conforme IANA e preservar `date`/`time without time zone` como valores civis; não converter silenciosamente para UTC nem alterar o schema nesta etapa. |
| `DEC-004` | PENDING | Semântica de exceção de recorrência: pular, editar uma ocorrência, substituir horário, feriados, cancelamento e restauração. | Schema atual contém só série, weekdays e vigência; não há ocorrências/exceções persistentes. Bloqueia operações de exceção em SPEC-007. |
| `DEC-005` | PENDING | Retenção, exclusão, exportação e compartilhamento de histórico, memória e checkpoints. | Nenhuma política de conversa existente. Bloqueia ativação de persistência de conversa em SPEC-003. |
| `DEC-006` | PENDING | Quais campos podem ser enviados a DeepSeek, Gemini e LangSmith, redaction, opt-out e localização/retention permitida. | Conteúdo de demanda e ferramenta pode conter dados internos; provedores são externos. Bloqueia uso de conteúdo real com provedor, indexação e tracing externo. |
| `DEC-007` | PENDING | Conteúdo indexável, chunking e valor semântico esperado. | No modelo atual o texto de domínio é predominantemente o nome do item; sem descrição/comentário há pouco conteúdo para RAG. Pode adiar SPEC-008/009. |
| `DEC-008` | **APPROVED** | O dashboard administrativo é destinado ao proprietário único e mantém o caminho de acesso existente; não há papéis, contas, organizações ou tenants adicionais. | A decisão não aprova uma nova autenticação nem validação de owner UUID. A passkey existente não prova identidade no servidor. Nenhum endpoint do dashboard pode expor dados privados até o gate de acesso adequado da DEC-001 estar cumprido. Campos, retenção e processamento externo permanecem condicionados a DEC-005/006. |
| `DEC-009` | PENDING | Matriz de confirmação por ação, incluindo reagendamento e mudança de status; exclusão só poderá ser considerada por SPEC futura que aprove esse escopo. | O usuário pede confirmação para ações de maior risco, mas o limiar não está definido. Bloqueia ações de risco sem regra aprovada. SPEC-006 mantém exclusão indisponível. |
| `DEC-010` | PENDING | Runtime server-side, região, plano Vercel, execução longa/background para outbox e estratégia de filas. | Não há API ou worker atual; limites Vercel variam por plano e configuração. |
| `DEC-011` | PENDING | IDs/versões exatos de modelo DeepSeek e Gemini, embedding dimensionality, política de troca e reindexação. | Modelos e dimensões evoluem; espaços de embedding de versões diferentes não são intercambiáveis. |
| `DEC-012` | PENDING | Limites de uso e contenção de abuso para chamadas externas. Não há orçamento financeiro aprovado. | Não criar bloqueio financeiro por estimativa; definir controles de abuso durante planejamento sem inventar orçamento. |
| `DEC-013` | PENDING | Semântica exata, em linguagem natural, de dia da semana sem data e de “próxima semana” para consultas e gravações de agenda. | A SPEC-007 não pode fixar silenciosamente a regra de qual data é escolhida. Solicita esclarecimento antes de gravação até a decisão ser aprovada; America/Cuiaba permanece aprovado por DEC-003. |

DEC-001 (interpretação consolidada)/002/003 e DEC-008 são decisões aprovadas e não devem ser reabertas por suposição. DEC-001 mantém a passkey existente, mas não a trata como autenticação server-side; o gate de acesso adequado é um requisito de segurança, não aprovação de uma solução futura. As interpretações anteriores permanecem no histórico com seus limites e substituições explícitos. DEC-004/005/006/007/009/010/011/012/013 permanecem pendentes. Mecanismos técnicos sugeridos nas SPECs não são decisões aprovadas. Uma nova regra funcional ou mecanismo de acesso depende de aprovação explícita.

### Gate de segurança derivado da DEC-001

- Nenhum endpoint do agente pode retornar dados privados do FlowZenit nem executar operações privilegiadas antes de um controle de acesso adequado ser aprovado, implementado e verificado.
- A implementação desse controle é requisito futuro para habilitar capacidades protegidas; seu mecanismo permanece sem decisão. Esta regra não autoriza uma escolha por Supabase Auth, sessão, RLS, BFF, proxy ou outro padrão.
- A passkey existente é um gate de navegação client-side, não prova de identidade no servidor. Permissões `anon` existentes não são prova de autorização do proprietário para novos endpoints.
- Supabase Secret/service_role é uma credencial privilegiada, não autenticação ou autorização de usuário. Não pode ser usada como substituto para o controle de acesso.
- A aplicação existente e suas permissões não são alteradas por esta decisão documental. O gate restringe capacidades novas do agente.

## 5. Pendências e pré-requisitos por SPEC

Nenhuma pendência abaixo altera uma decisão aprovada. O planejamento pode comparar alternativas sem lote; uma escolha que afete identidade, dados externos ou comportamento observável deve ser submetida para aprovação antes da implementação ou ativação correspondente. O gate de segurança da DEC-001 bloqueia endpoints protegidos até que o usuário aprove uma solução adequada.

| SPEC | Pendências que o plano deve tratar | Aprovação necessária antes de |
| --- | --- | --- |
| SPEC-001 | Definir o contrato de integração com a conexão Supabase existente e explicitar o gate da DEC-001; não selecionar um mecanismo futuro de controle de acesso. Runtime e chaves de provedor são tratados por SPEC-002; queries, RAG e writes pertencem a SPEC-004/008/009/005/006/007. | Endpoints privados e operações privilegiadas só podem ser habilitados após controle de acesso adequado aprovado, implementado e verificado. Implementação continua exigindo lote aprovado. DEC-006/010 seguem aplicáveis a provedores e deploy. |
| SPEC-002 | Versão/ID exatos do DeepSeek (DEC-011), limites de timeout/retry e política de fallback. | Ativar modelo/provedor real; chamadas a dados privados também dependem do gate DEC-001. |
| SPEC-003 | Retenção, exclusão, exportação e compartilhamento de conversas, checkpoints e memória (DEC-005). | Persistir dados reais de conversa em produção, após DEC-005 e gate de acesso DEC-001. O plano pode apresentar opções, mas não inventar prazos/políticas. |
| SPEC-004 | Nenhuma nova decisão de domínio. Usar somente as entidades de DEC-002 e datas civis de DEC-003, recebidas de SPEC-007. | Consultas privadas só podem ser expostas após o gate de acesso DEC-001; não há bloqueio adicional para planejamento documental. |
| SPEC-005 | Matriz de ações que exigem confirmação e validade das confirmações (DEC-009). O mecanismo de grant de confirmação permanece proposta técnica. | Habilitar qualquer operação privilegiada após DEC-009 e o gate de acesso DEC-001. O plano pode apresentar alternativas, não aprová-las. |
| SPEC-006 | DEC-009 para confirmações de reagendamento/status e consequências existentes de movimentação. | Habilitar escritas somente após DEC-009 e o gate de acesso DEC-001. Exclusão continua fora do escopo. |
| SPEC-007 | Interpretação de dia da semana e “próxima semana” (DEC-013); confirmações de escrita (DEC-009). DEC-004 só é necessária para exceções de ocorrência, explicitamente fora do escopo. | Escritas protegidas dependem do gate DEC-001. America/Cuiaba e valores civis já estão aprovados. |
| SPEC-008 | Campos permitidos e tratamento externo por Gemini (DEC-006), utilidade/corpus (DEC-007), modelo/dimensão (DEC-011), runtime/outbox (DEC-010). | Indexar dados privados em produção somente após DEC-006/007/011/010 e gate de acesso DEC-001. Planejamento/testes podem usar dados sintéticos. |
| SPEC-009 | DEC-006/007/011 e disponibilidade aprovada/validada da SPEC-008. | Recuperação de dados privados em produção depende também do gate de acesso DEC-001. Planejamento e avaliação sintética podem ocorrer antes. |
| SPEC-010 | Campos, retenção e processamento LangSmith (DEC-006); retenção de auditoria (DEC-005). | Exportar conteúdo ou expor detalhes privados só após DEC-005/006 e gate de acesso DEC-001. Metadados minimizados sintéticos podem ser planejados. |
| SPEC-011 | Dashboard para proprietário único pelo caminho existente conforme DEC-008; passkey não verifica identidade no servidor. Campos sensíveis seguem DEC-005/006. | Não expor dados privados por endpoint de dashboard antes do gate DEC-001 e das políticas DEC-005/006; não criar usuários, organizações ou método de autenticação. |
| SPEC-012 | Runtime/conexão vêm de SPEC-001/002; persistência/disclosure seguem DEC-005/006 e escrita segue DEC-009. | Chat pode ser documentado sem lote, mas histórico real, dados privados e operações privilegiadas só ficam disponíveis após DEC-005/006/009 conforme aplicável e gate de acesso DEC-001. |
| SPEC-013 | Seleção do mecanismo de isolamento de teste e tooling E2E durante planejamento. Não há decisão de multi-tenant: esse escopo está excluído. | Testes devem comprovar o bloqueio de acesso privado sem o gate DEC-001, usando ambiente não produtivo marcado e limpeza delimitada. |
| SPEC-014 | Runtime, região, plano Vercel, worker/filas (DEC-010); limites de abuso podem informar DEC-012. | Release readiness não pode habilitar endpoint privado sem evidência do gate DEC-001; nenhum deploy automático está autorizado. |
| SPEC-015 | Campos de consulta e processamento externo (DEC-006); limites de uso/abuso (DEC-012), sem orçamento financeiro. | Ativar busca externa ou enviar conteúdo FlowZenit a Tavily; consultas públicas não devem receber dados privados nem contornar o gate da SPEC-002/DEC-001. |

Conclusão de prontidão: nenhuma decisão ainda pendente impede iniciar o planejamento técnico do escopo não bloqueado de uma SPEC. O plano deve comparar as alternativas listadas, registrar uma recomendação e indicar qual aprovação é necessária antes da implementação ou ativação. Pendências que bloqueiam apenas uma capacidade permanecem como gates daquela capacidade: por exemplo, DEC-004 não bloqueia a gestão de séries recorrentes da SPEC-007, mas bloqueia exceções por ocorrência.

### Mecanismos técnicos propostos, ainda não aprovados

- DEC-001 não solicita um provedor de identidade, fluxo de login, MFA, sessão, owner UUID ou BFF de autenticação. A conexão e os grants existentes podem ser preservados para o caminho atual e validações sintéticas; esses grants não satisfazem o gate de acesso e não autorizam endpoints privados do agente.
- O contexto de consulta, a localização do runtime e a forma de compor ferramentas com a conexão Supabase são detalhados pelas SPEC-002 e SPEC-004. A chave publicável e credenciais privilegiadas continuam distintas; nenhuma credencial privilegiada pode ir ao browser.
- A interface do dashboard preserva o caminho existente e destina-se ao proprietário único conforme DEC-008; isso não habilita endpoints que exponham traces ou dados privados antes do gate DEC-001. Campos e retenção continuam condicionados a DEC-005/006.

## 6. Baseline de testes para todas as SPECs

Cada SPEC acrescenta seus testes a `npm test`, `npm run lint` e `npm run build`; esses gates gerais não substituem cenários próprios. Testes de banco usam dados isolados e rollback, exercitam os grants e comportamentos existentes, idempotência, concorrência e falhas de integração; não pressupõem novas políticas RLS. E2E verifica caminhos principais, teclado, acessibilidade e tamanhos 1440/820/390 quando UI for alterada. Provedores externos são substituídos por doubles em testes de rotina; smoke real exige opt-in, credencial no servidor, orçamento aprovado e dados sintéticos. Avaliações usam datasets versionados sem transcrições privadas, incluem resposta sem evidência, prompt injection, português e regressão de tool calls. Falhas não executadas são `NOT VERIFIED`.

## 7. Referências oficiais consultadas

- [LangGraph.js persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence): checkpointer (thread) e store (entre threads) são persistências distintas.
- [LangChain.js tools](https://docs.langchain.com/oss/javascript/langchain/tools): ferramentas têm schemas estruturados; entradas geradas pelo modelo ainda precisam de validação e tratamento de erro.
- [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/) e [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/): tool calls são propostas de função; strict mode é beta e não substitui validação local.
- [Gemini embeddings](https://ai.google.dev/gemini-api/docs/embeddings): modelo, tipo de tarefa e dimensionalidade fazem parte do contrato do índice; migração de espaço pode exigir reindexação.
- [Supabase pgvector/semantic search](https://supabase.com/docs/guides/ai/semantic-search), [hybrid search/RRF](https://supabase.com/docs/guides/ai/hybrid-search) e [full-text search](https://supabase.com/docs/guides/database/full-text-search).
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) e [proteção da Data API](https://supabase.com/docs/guides/api/securing-your-api): chaves secret/service-role têm acesso elevado e bypass de RLS; devem ficar no servidor e não substituem políticas de ferramenta nem confirmações de escrita.
- [LangSmith observability](https://docs.langchain.com/langsmith/observability) e [evaluation types](https://docs.langchain.com/langsmith/evaluation-types): tracing e avaliações offline/online têm papéis distintos.
- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [limits](https://vercel.com/docs/functions/limitations) e [streaming](https://vercel.com/docs/functions/streaming-functions): duração, streaming e região dependem do runtime e plano.
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search): integração opcional; a resposta externa continua sendo conteúdo não confiável.
