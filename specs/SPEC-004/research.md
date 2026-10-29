# Research: SPEC-004 domain contracts and read tools

**Data:** 2026-10-28  
**Estado:** evidência para o planejamento candidato SPEC-004@2; nenhuma decisão aprovada é alterada.

## Baseline observado no checkout

- A hierarquia é armazenada em `public.demandas`: `id bigint`, `demanda text`, `tipo smallint` e `raizid bigint`; `tipo` 1/2/3 representa demanda/tarefa/subtarefa. Triggers validam a relação pai-filho e calculam status de pais. Ver migrations `20261027005028_demandas_hierarquia.sql` e `20261027021036_demandas_status_hierarquicos.sql`.
- `public.recorrente` guarda templates, não ocorrências: nome, hora, `dias_semana` ISO 1–7, intervalo de vigência e `hora_fim` opcional. As datas de início e fim da vigência são inclusivas.
- Planejamento semanal usa demandas sem tarefas e tarefas; subtarefas não são cartões semanais. Tarefas/demandas sem alocação aparecem no backlog semanal. Planejamento diário usa subtarefas e templates de rotina; horários são `time without time zone`.
- O banco exige que a data de uma subtarefa planejada pertença à mesma semana civil da tarefa alocada. `date_trunc('week', ...)` e o helper atual usam segunda-feira como início da semana.
- Sobreposições simultâneas são aceitas pelo banco e representadas pela UI; uma consulta não deve suprimi-las.
- As páginas React consultam Supabase diretamente e em geral carregam conjuntos inteiros sem paginação. Não há busca textual compartilhada no código atual. A busca por texto pedida nesta SPEC é nova para o agente.
- Há diferenças de projeção entre telas: o painel inicial filtra subtarefas pela data exata da tarefa pai; planejamento diário/Kanban usam a semana do pai. O backlog diário exclui `Done`, Kanban inclui `Done` e o backlog semanal não filtra status. Esta SPEC não altera as telas existentes.
- O código usa datas locais do navegador sem declarar `America/Cuiaba`. DEC-003 exige que as novas ferramentas usem valores civis canônicos e não dependam do fuso do processo.
- `id` e `raizid` são `bigint`; convertê-los primeiro para JavaScript `Number` pode perder precisão. O contrato de leitura recomenda IDs decimais em string e validação de round-trip, usando projeção/cast textual suportado pelo PostgREST ou alternativa exata verificada, sem migração.
- O cliente instalado é `@supabase/supabase-js` 2.118.0. O projeto está em JavaScript ESM; não há TypeScript, Zod ou biblioteca de datas no `package.json`. Não se propõe instalar dependências nem converter o projeto para TypeScript.
- A implementação concluída da SPEC-001 fornece `server/security/accessGate.js`, erros de API e contexto de log seguro. O gate retorna sempre fechado e não invoca sua callback; não existe cliente Supabase server-side ou endpoint fornecido pela SPEC-001. A integração futura injeta um cliente estreito no repositório sem alterar esse gate.

## Opções técnicas

| Tema | Opção recomendada para revisão | Alternativas/limites |
| --- | --- | --- |
| Contratos | Operações nomeadas e DTOs JavaScript validados em runtime, com JSDoc e projeções de campos explícitas | SQL/expressões PostgREST vindas do modelo são proibidas. Tipos TypeScript gerados não se encaixam no projeto JavaScript sem uma decisão separada. |
| Datas | Entradas de consulta recebem `YYYY-MM-DD` civil já resolvido; início de semana é segunda-feira e a faixa é `[segunda, próxima segunda)` | SPEC-004 não interpreta “hoje”, “próxima semana” nem instantes. Resolução de linguagem natural pertence ao runtime/contrato temporal da SPEC-007, mantendo este módulo sem dependência dela. |
| IDs | Aceitar e retornar IDs decimais em string; verificar representação além do limite seguro de `Number` | A tabela permanece `bigint`; não adicionar UUID/owner ID. A forma exata de seleção/cast deve ser comprovada em teste de contrato. |
| Paginação | Ordem determinística com ID persistente como desempate e cursor vinculado aos filtros canônicos | `.range()` do Supabase depende de ordenação. Offset não promete snapshot se registros mudarem entre páginas; preferir cursor por chave ordenada se suportado pela consulta. |
| Busca textual | Recomendação proposta: substring literal sem distinção entre maiúsculas/minúsculas em `demanda`, sem fuzzy search; múltiplos candidatos são retornados para o agente pedir narrowing | Não há semântica equivalente nas telas atuais. Escape de `%`/`_`/sintaxe PostgREST precisa de teste. Locale, sensibilidade a acentos e normalização Unicode seguem sem definição. O comportamento é uma proposta observável sujeita à revisão do usuário. |
| Limites | Propor `pageSize` default 50/max 100, texto até 200 code points e intervalo de datas até 366 dias como valores técnicos iniciais | São limites novos porque a UI atual carrega todos os resultados. Devem permanecer identificados como proposta e ser revisados antes da implementação; não representam aprovação de DEC-012 nem orçamento. |
| Status | Ler valores persistidos e marcar origem: status de subtarefa armazenado; status de demanda/tarefa derivado pelos triggers atuais | Não recalcular, editar, normalizar ou traduzir os valores de domínio na camada de leitura. O rótulo visual “Análise” não muda o valor persistido `Analise`. |
| Agenda | Consultas separadas: programação diária por data exata; alocação semanal para cartões atuais; rotina como template separado | Não unificar silenciosamente as diferentes projeções de backlog da UI. Não criar ocorrência nem entidade independente de compromisso. |
| Segurança | Serviço consulta `withAgentAccess()` antes do repositório; o gate implementado na SPEC-001 sempre nega e nunca chama a operação protegida. O repositório recebe somente um cliente server-side estreito injetado pelo runtime futuro. | A SPEC-001 não fornece cliente server-side. Chave publicável e grants `anon` não verificam proprietário. Secret/service_role não substitui autorização. Nenhuma política ou grant é alterado. Testes de contrato diretos usam somente alvo isolado e sintético e não abrem o serviço. |

## Recomendação

Manter um módulo de consultas transacionais, server-side e sem efeitos colaterais, com operações explícitas para hierarquia/ID, filtros, agenda diária, alocação semanal e templates de rotina. Filtrar somente por DTO validado e colunas permitidas; retornar status e IDs sem perda; preservar a fonte relacional como autoridade. Busca semântica permanece em SPEC-008/009. O módulo não é exposto nem chamado em produção até o gate DEC-001 ser satisfeito.

## Referências primárias

- Supabase JavaScript: [select](https://supabase.com/docs/reference/javascript/select), [filters](https://supabase.com/docs/reference/javascript/using-filters), [range pagination](https://supabase.com/docs/reference/javascript/using-modifiers-range) e [text search](https://supabase.com/docs/reference/javascript/using-filters-textsearch).
- PostgREST documenta ordenação e cast de projeção `::text`: [Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html).
- PostgreSQL `bigint` ocupa 64 bits e excede o inteiro seguro de JavaScript: [Numeric Types](https://www.postgresql.org/docs/15/datatype-numeric.html).
- Supabase exige combinação de grants e RLS para acesso aos dados expostos; a role `anon` não é identidade autenticada: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) e [Securing your data](https://supabase.com/docs/guides/database/secure-data).
- As decisões de domínio aprovadas continuam em `specs/agent-requirements-and-decisions.md`: DEC-002 entidades atuais, DEC-003 `America/Cuiaba`; o gate DEC-001 continua obrigatório para dados privados.
