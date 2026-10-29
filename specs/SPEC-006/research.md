# Research: SPEC-006 — ferramentas de escrita e planejamento

**Estado:** evidência para planejamento Draft. Nenhum endpoint, operação privilegiada ou mecanismo de confirmação está aprovado ou habilitado.

## Baseline do repositório

- A fundação é `public.demandas` com `id bigint`, `demanda text`, `tipo` (`1` demanda, `2` tarefa, `3` subtarefa), `raizid`, `status`, `data_exec`, `hora_inicio` e `hora_fim`. Os identificadores devem permanecer strings decimais nas interfaces JavaScript para não perder precisão.
- `supabase/migrations/20261027005028_demandas_hierarquia.sql` valida o tipo do pai; `20261027010611_demandas_crud_edicao_exclusao_hierarquica.sql` deixa a FK `raizid` com `ON DELETE RESTRICT`. Nome precisa ser não vazio após trim. Não há unicidade de nome nem limite máximo no schema observado.
- `20261027021036_demandas_status_hierarquicos.sql` restringe os status de subtarefa a `Backlog`, `Analise`, `Executando`, `Aguardando`, `Done`; status de tarefa/demanda é derivado como `Backlog`, `Em andamento` ou `Done`. O trigger bloqueia gravação direta do status do pai e recalcula/propaga o status após mudanças de filhos.
- `20261027121010_planejamento_semanal_data_exec.sql` permite data semanal em demanda sem tarefa ou em tarefa. Criar tarefa limpa a data semanal da demanda pai.
- `20261027122157_planejamento_diario_subtarefas.sql` introduz a validação diária; `20261027194247_planejamento_diario_subtarefas_mesma_semana.sql` a altera para exigir que a data da subtarefa esteja na mesma semana de calendário da tarefa pai. Ao mover a tarefa, o trigger limpa `data_exec`, `hora_inicio` e `hora_fim` de subtarefas que ficarem fora da semana nova.
- `20261027123118_planejamento_diario_horarios.sql` exige que uma subtarefa não planejada tenha os três campos temporais nulos; quando planejada, exige data, início, fim e `hora_inicio < hora_fim`. `20261027124443_planejamento_diario_eventos_simultaneos.sql` remove a rejeição de sobreposição; overlaps são válidos e não deslocam outras subtarefas.
- `src/pages/DemandasPage.jsx`, `PlanejamentoSemanalPage.jsx`, `PlanejamentoDiarioPage.jsx` e `KanbanPage.jsx` fazem operações diretamente no cliente Supabase. O diálogo semanal atual detecta somente a existência de algum filho planejado (`limit(1)`), não a lista exata que será limpa. Os flags locais de salvamento não são idempotência durável.
- As migrações existentes concedem operações a `anon` sob políticas permissivas em partes do schema. Isso descreve a aplicação atual e não satisfaz o gate de acesso DEC-001 para uma API nova.

## Decisões de desenho propostas

1. **Capacidade tipada, separada do runtime.** SPEC-002 resolve nome/versão da ferramenta e executa o handler; SPEC-005 aplica o gate DEC-001, autorização, confirmação e idempotência; SPEC-006 fornece os comandos e a lógica de domínio. Consultas continuam pertencendo a SPEC-004.
2. **Uma operação de domínio por comando.** Não aceitar lote arbitrário de writes. Um comando tem um único alvo lógico, DTO estrito, ID persistente, `expectedState` mínimo, chave de idempotência e correlação do runtime.
3. **Transação de ponta a ponta é requisito, não decisão de backend.** Uma atualização do cartão de tarefa pode executar triggers que limpam vários filhos. A leitura de pré-condições, validação da lista afetada, gravação e leitura de volta precisam de um limite transacional. Chamadas REST separadas não devem ser descritas como atômicas. Uma função Postgres/RPC tipada com `SECURITY INVOKER` é a opção recomendada para avaliação; uma conexão transacional server-side é alternativa. A escolha de runtime, schema, role e grants depende do gate DEC-001 e das decisões de integração/runtime. Nenhuma opção é aprovada nesta SPEC.
4. **Privilégios de função permanecem fechados.** As funções do banco têm `EXECUTE` concedido por padrão no PostgreSQL/Supabase. Uma futura opção de RPC exige grants explícitos mínimos, função invoker e nenhuma exposição que contorne DEC-001. Não usar `SECURITY DEFINER`, `service_role` ou grants anon como autorização do proprietário.
5. **Idempotência durável e concorrência explícita.** A porta de ledger de SPEC-002 recebe chave server-side e hash canônico. Mesma chave/hash retorna resultado anterior; mesma chave com hash diferente é conflito; reserva/estado incerto bloqueia repetição. O efeito e o estado durável precisam de recuperação consistente; sem isso, a capability fica desabilitada.
6. **Conflito otimista sem coluna de versão nova.** A tabela observada não tem `updated_at` ou revision. A proposta compara um fingerprint dos campos relevantes ao preview confirmado e revalida/serializa os registros afetados na transação. Mudança concorrente invalida a confirmação e retorna conflito; nenhuma coluna ou constraint nova é escolhida nesta SPEC.
7. **Duplicidade de request não é unicidade de título.** Replays da mesma operação não podem duplicar efeitos. Nomes iguais continuam possíveis porque o banco não os torna únicos; edições exigem ID persistente e alvo ambíguo requer desambiguação, sem dedupe semântico.
8. **DEC-009 proposta, sem habilitação.** A proposta de matriz em `contracts/confirmation-matrix-proposal.md` pede confirmação para cada write efetivo; um `NO_OP` sem efeito não cria grant; status direto de pais e exclusão continuam indisponíveis. A matriz não substitui o gate DEC-001 e não é a decisão DEC-009.

## Riscos de integração

- A remoção de side effects indiretos da resposta não é aceitável: criar a primeira tarefa pode limpar `data_exec` do pai; mover tarefa pode limpar horários de subtarefas. O preview e o resultado precisam incluir cada ID persistente e valores antes/depois.
- Um preview pode ficar stale depois da confirmação. A transação precisa comparar o mesmo conjunto de efeitos e as mesmas pré-condições; caso contrário, retornar `CONFLICT` e exigir nova proposta.
- O trigger de recálculo de status é autoridade para pais. A API escreve status de subtarefa e lê pai/tarefa após a transação; nunca faz write direto no pai.
- A API deve ficar fora de `src/` e do bundle Vite. Nenhum handler é registrado em produção enquanto o gate DEC-001, a política de DEC-009 e a porta durável de idempotência não estiverem prontos.
- Testes de banco usam schema/target isolado e registros sintéticos, nunca as tabelas existentes da aplicação ou produção.

## Decisões pendentes

- **DEC-001:** a decisão está aprovada como manter a passkey existente sem autenticação nova. Nenhum mecanismo adicional que satisfaça o requisito separado de acesso adequado foi aprovado; todos os reads privados de preview e todos os writes permanecem bloqueados até esse controle ser decidido separadamente, implementado e verificado.
- **DEC-009:** matriz por operação, especialmente status e reagendamento. A tabela desta SPEC é proposta para revisão.
- **DEC-010:** runtime, região e conexão transacional disponíveis ao backend.
- **DEC-012:** limites de uso/abuso; não criar orçamento financeiro.
- **SPEC-002:** interface/armazenamento durável do execution ledger e política de recuperação de resultado incerto.
- **DEC-005:** persistência/retenção se o ledger ou evento passar a reter dados além do mínimo operacional.

## Referências oficiais

- PostgreSQL mantém a distinção entre `date`, `time without time zone` e valores com zona; os campos atuais permanecem civis: [Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html).
- PostgreSQL row locks podem serializar alterações concorrentes em registros consultados, e os locks duram até o fim da transação: [Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) e [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html).
- Supabase documenta funções Postgres via Data API, recomenda `SECURITY INVOKER` por padrão e alerta que permissões de execução precisam ser restringidas explicitamente: [Database Functions](https://supabase.com/docs/guides/database/functions), [Securing your data](https://supabase.com/docs/guides/database/secure-data).
