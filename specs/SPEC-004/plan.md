# Implementation Plan: Domain Contracts and Read Tools

**SPEC ID**: SPEC-004 | **Version**: 2 | **Manifest hash**: atribuído ao criar lote
**Branch**: main (preservada; nenhuma branch criada) | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)  
**Status**: Draft — plano técnico proposto para revisão, sem aprovação de implementação.

## Summary

SPEC-004 fornece operações de leitura nomeadas para a hierarquia existente de demandas, tarefas e subtarefas, alocação semanal, programação diária, templates recorrentes e filtros estruturados. O banco Supabase existente é a autoridade transacional. Os contratos preservam IDs persistentes, relações pai-filho, valores de status e datas/horários civis; não criam entidade de compromisso, mutação ou recuperação semântica.

O código futuro fica em módulos JavaScript server-side consumidos pelo runtime da SPEC-002. O módulo aceita DTOs validados e não recebe SQL, colunas, tabelas ou operadores escolhidos pelo modelo. As consultas privadas ficam desabilitadas até o gate da DEC-001 ser aprovado, implementado e verificado. O cliente e as páginas atuais React/Vite, schema, grants e policies permanecem inalterados.

## Technical Context

**Language/Version**: JavaScript ESM, Node/Vite existentes. Nenhuma migração para TypeScript.  
**Primary Dependencies**: @supabase/supabase-js 2.118.0 já instalado; Node node:test. Nenhuma dependência nova.  
**Storage**: PostgreSQL/Supabase existentes: public.demandas e public.recorrente; sem schema/grants/RLS/migration novos.  
**Testing**: `npm test`, `npm run lint`, `npm run build`; doubles unitários e testes de contrato com fixtures sintéticas no Supabase de desenvolvimento FlowZenit V2 autorizado pelo proprietário, com isolamento lógico, preflight e limpeza estritamente seletiva.
**Target Platform**: Módulos server-side consumidos pelo runtime/API cuja execução será definida na SPEC-002 e DEC-010. Não alterar o caminho atual browser→Supabase.  
**Project Type**: SPA React/Vite existente com futura camada de leitura interna para o agente; esta SPEC não implementa o runtime nem endpoints HTTP.  
**Performance Goals**: Nenhuma meta de latência aprovada. Consultas devem ser limitadas, pagináveis e utilizar filtros/ordenação que preservem o comportamento atual.  
**Constraints**: DEC-001 bloqueia leituras privadas via agente. DEC-002 fixa as entidades existentes. DEC-003 fixa America/Cuiaba. Sem SQL arbitrário, mutações, RAG, nova identidade ou mudança de comportamento das telas atuais.  
**Par?metros locais aprovados pelo propriet?rio (2026-10-29)**: `pageSize` padr?o 50/m?ximo 100; texto at? 200 Unicode code points; intervalo civil inclusivo de no m?ximo 366 dias. Busca `ILIKE` literal, case-insensitive e accent-sensitive; `%`, `_` e barra invertida s?o escapados como entrada literal. Isso n?o aprova limites globais de abuso/provedores da DEC-012.

## Constitution Check

*GATE: avaliação antes e depois do desenho.*

| Princípio | Verificação |
| --- | --- |
| Preserve product behavior | Pass: cliente, rotas e comportamento das páginas atuais permanecem inalterados; ferramentas novas só projetam leitura. |
| User-controlled scope | Pass: SPEC permanece Draft; implementação só em lote exato aprovado e pelo supervisor SDD. |
| Security and data protection | Pass: inputs são DTOs allowlisted; SQL/model fragments recusados; consultas privadas fechadas até o gate DEC-001; segredo service_role nunca é autorização. |
| Tests accompany design | Pass: unit, integração sintética, contrato, segurança e critérios de não divulgação estão descritos. |
| Durable and auditable execution | Pass: qualquer execução e evidência futura ficam no SDD run autorizado, sem payload privado. |
| Bounded correction | Pass: nenhuma mudança na política; limites e pausa global continuam sob supervisor. |
| Small, reviewable changes | Pass: apenas módulos de leitura e testes previstos, sem novas dependências/schema/UI. |
| Manual publication | Pass: nenhum commit, push, merge ou deploy por este plano. |

**Post-design gate**: pass. Nenhum conflito constitucional identificado.

## Dependencies and Contracts

- **Prerequisite SPECs**: SPEC-001 v2 fornece o gate fail-closed, os erros tipados e o contexto de log seguro; não fornece um cliente Supabase server-side nem um endpoint. Essa é a única dependência declarada no cabeçalho da SPEC-004.
- **Downstream consumers**: SPEC-002 runtime; SPEC-005 guardrails; SPEC-006/007 mutações e datas; SPEC-008/009 indexação e recuperação. A ordem aprovada continua SPEC-004 → SPEC-002 → SPEC-005.
- **API/data contracts**: ferramentas internas documentadas em [contracts/read-tools.md](contracts/read-tools.md); não são rotas HTTP. A SPEC-002 expõe o runtime somente depois de seus próprios gates.
- **Temporal contract**: esta camada aceita datas civis canônicas. A resolução de frases relativas pertence ao runtime/contrato temporal da SPEC-007; SPEC-004 não depende da SPEC-007 para operar sobre datas recebidas.
- **Database changes**: nenhuma. Migrations existentes são apenas evidência das regras atuais.
- **Security boundary**: o repositório recebe um cliente Supabase server-side estreito por injeção da integração futura do runtime; a SPEC-004 não cria esse cliente, endpoint, credencial, sessão ou mecanismo de identidade. `server/security/accessGate.js` da SPEC-001 permanece incondicionalmente fechado e não chama a operação protegida. O gate DEC-001 precisa estar satisfeito antes de qualquer leitura privada por runtime ou endpoint de agente; nenhum parâmetro, variável de ambiente ou fixture pode abri-lo.
- **Out-of-scope files/systems**: páginas React, src/lib/supabase.js, schema/policies/grants, migrations, memória, chat, API/runtime, writes, busca semântica/RAG e provedores externos.

## Domain and Query Design

### Entity mapping

- public.demandas: tipo 1 demanda, tipo 2 tarefa, tipo 3 subtarefa; raizid referencia o pai. IDs bigint são transportados como string decimal, nunca como Number potencialmente arredondado.
- Status de subtarefa é armazenado. Status de tarefa/demanda é derivado por triggers existentes; consultas retornam o valor da fonte e statusSource=stored|derived, sem reimplementar a regra.
- data_exec é date; hora_inicio/hora_fim são time without time zone. Datas e horários são retornados como valores civis, sem conversão UTC.
- public.recorrente contém templates somente leitura, dias ISO 1–7 e vigência inclusiva; template não representa ocorrência persistida.
- A semana começa na segunda-feira e representa sete datas civis [weekStart, nextWeekStart). A data de início é recebida já resolvida em America/Cuiaba.

### Named read operations

1. getHierarchy(itemId) para cadeia pai/filhos, com IDs persistentes e tipos.
2. getItemById(itemId) para consulta exata.
3. searchItems(filters) para texto literal, tipo, status, pai e faixa civil.
4. getDailySchedule(date) para subtarefas cuja data é exatamente a solicitada; rotina é buscada separadamente. Backlog não é confundido com atividade agendada.
5. getWeeklyAllocation(weekStart) para cartões semanais existentes (demanda sem tarefas e tarefa), incluindo itens sem data em coleção separada de backlog; subtarefas não são cartões semanais.
6. getRoutineTemplates(date) para templates cujo weekday ISO corresponde e cuja data está no intervalo inclusivo.

Busca textual não existe nas telas atuais. Para SPEC-004@2, aplicar substring literal via PostgREST/Supabase `ilike` sobre `demanda`, com `%`, `_` e `\\` escapados; o campo `text` é envolvido por curingas somente pelo código da consulta. `ILIKE` usa a locale/collation ativa; a collation existente deve preservar diferenças de acento e ser compatível com pattern matching. Não normalizar Unicode nem prometer equivalência NFC/NFD ou full case-folding. Testar caixa, acento, `%`, `_` e `\\` por PostgREST. Resultados múltiplos permanecem candidatos e exigem narrowing, sem seleção silenciosa. RAG/FTS pertencem a SPEC-008/009.

### Bounds, order, and metadata

- Aplicar os limites aprovados para esta SPEC: `pageSize` default 50/max 100, texto máximo 200 Unicode code points e faixa civil inclusiva máxima de 366 dias. Quando só um endpoint da faixa é fornecido, a paginação ainda limita a resposta e o filtro permanece aberto naquele lado.
- Ordenação é explícita e determinística: chave de negócio da operação com ID persistente como desempate. Cursor opaco é vinculado a filtro e ordenação; não promete snapshot imutável entre páginas.
- Resposta distingue sucesso vazio, completa, truncada, erro e, somente se aplicável, parcial/stale. Cursor aparece quando a página foi truncada; não se retorna erro como lista vazia.
- As telas existentes têm diferenças no backlog: planejamento diário exclui Done, Kanban o inclui e semanal não filtra status; o painel inicial usa outra projeção de pai. A API proposta não migra nem uniformiza essas telas. A operação de agenda diária retorna apenas data exata; filtros de backlog/status são pedidos tipados separados.

## Decisions and Risks

### Approved and preserved

- DEC-001: sem nova autenticação; passkey de navegador não prova identidade server-side; leituras privadas do agente permanecem bloqueadas até controle adequado aprovado, implementado e verificado.
- DEC-002: somente demandas, tarefas, subtarefas e templates de rotina; nenhuma entidade independente de compromisso.
- DEC-003: America/Cuiaba; datas e horários civis existentes não são convertidos para UTC.

### Open items for user review

- Os parâmetros locais desta SPEC foram aprovados pelo proprietário em 2026-10-29; não alteram DEC-012, que segue pendente para limites globais de uso/abuso e consumo de provedores.
- A semântica de `ILIKE` depende da collation existente. O preflight e os testes de contrato devem comprovar sensibilidade a acentos e escape literal sem criar collation, extensão ou migration.
- Cursor de paginação deve ser verificado contra mudanças concorrentes; não afirmar snapshot consistente.
- DEC-001 continua bloqueando qualquer leitura privada exposta. A SPEC-004 não escolhe o futuro controle de acesso.
- SPEC-007/DEC-013 definem linguagem relativa e ambiguidades de “próxima semana”; aqui só entram datas civis canônicas.
- Supabase/PostgREST precisa provar cast/projeção textual de bigint no contrato de integração para preservar IDs sem perda.

### Risks and mitigation

- **Precisão de IDs**: bigint ultrapassa o intervalo inteiro seguro de JavaScript. Mitigar com projeção textual e fixture além de Number.MAX_SAFE_INTEGER; sem alterar schema.
- **Views divergentes**: backlog diário, Kanban, dashboard e semanal não exibem exatamente o mesmo conjunto. Mitigar com operações explicitamente nomeadas e não alterar a UI.
- **Timezone implícito no browser**: componentes atuais usam datas locais. Não reutilizar cálculo local para ferramentas; aceitar data civil e aplicar DEC-003/ISO.
- **Consultas sem paginação atuais**: limites novos podem truncar respostas. Exigir metadata, cursor e limites aprovados; nunca truncar silenciosamente.
- **Autorização**: grants anon existentes não autorizam API privada. O gate permanece anterior ao repositório em produção. Nenhuma alteração de grant/RLS será feita nesta SPEC.
- **Text search**: não havia filtro textual compartilhado. Aplicar os parâmetros aprovados via `ILIKE`; preservar acentos, escapar metacaracteres e pedir narrowing quando houver mais de um candidato.

## Execution and Recovery Plan

- **Sequential phases**: fixtures/DTO validators → hierarquia e busca → agenda diária/semanal → templates → revisão de segurança e contratos.
- **Parallel tasks**: apenas testes em arquivos separados, após fixture comum; assignments e evidências futuras devem ser persistidos no SDD run, conforme AGENTS.md. Nesta etapa não há delegação de implementação.
- **Failure fingerprints**: por operação e caso de contrato (hierarchy/status, date-range, routine, pagination, access gate), sem dados reais.
- **Checkpoints**: IDs sintéticos, nome do teste, resultado e hash/versão SPEC; sem registro, prompt ou credencial privada.
- **Recovery**: somente pelo supervisor SDD; limites e pausa global preservados.

## Quality Gates

| Gate | Required | Command/method | Acceptance evidence |
| --- | --- | --- | --- |
| Lint | Yes | npm run lint | Exit 0; nenhuma violação nova. |
| Build | Yes | npm run build | Exit 0; módulos de leitura permanecem server-side. |
| Unit/contract | Yes | npm test e doubles | Inputs estritos, hierarquia, status, candidatos, datas, paginação e metadata. |
| Database | Yes | Teste direto do repositório via PostgREST no projeto de desenvolvimento existente, com autorização específica do proprietário; preflight de projeto, schema, permissões e colisão de marcador antes de inserir fixtures | Confirmar casts de `bigint`, filtros e `ILIKE`; registrar somente IDs/relacionamentos sintéticos; usar rollback quando transação direta for possível, senão cleanup por IDs capturados em ordem child-first. Se não puder provar escopo/cleanup, parar aquela operação, não tocar em dados preexistentes, e reportar bloqueio; não exigir Docker/projeto extra. O teste nunca passa por endpoint do agente. |
| Security | Yes | Testes de gate/DTO/IDs/erros | SQL arbitrário recusado; IDs sem perda; sem exposição antes do gate. |
| Agent-tool integration/security | Yes | Testes dos serviços internos com doubles e fixtures sintéticas | Vazio, sobreposição, truncamento, não divulgação e nenhuma chamada ao repositório com gate fechado. |
| Browser E2E/accessibility | Conditional | Nenhuma UI existente é alterada por esta SPEC | Executar apenas se uma futura implementação aprovada alterar fluxo visual. |

## Entry and Completion Criteria

**Entry for implementation**: SPEC-004 versão exata em lote aprovado e admitido pelo supervisor SDD; SPEC-001 access gate permanece fechado para qualquer leitura privada em produção; os parâmetros locais acima já estão aprovados. Antes do T025, verificar a conexão ao projeto de desenvolvimento autorizado, schema/constraints/collation/permissões e inexistência do marcador de fixture daquele run. Nenhum Docker ou projeto Supabase adicional é requisito.

**Completion**: operações nomeadas têm contratos e testes; hierarquia/status/agenda/rotina preservam o modelo atual; limites/truncation são explícitos; IDs bigint não perdem precisão; nenhum SQL arbitrário, mutação, entidade nova, migration ou mudança de UI/permissão foi introduzida; leituras privadas continuam bloqueadas quando DEC-001 não foi satisfeita; todos os gates obrigatórios aplicáveis têm evidência `PASS`. Gate obrigatório sem execução ou evidência mantém a SPEC bloqueada; `NOT VERIFIED` só descreve gates explicitamente condicionais ou critérios futuros que não sejam requisito de conclusão desta SPEC.

Conclusão de SPEC-004 não aprova runtime, SPECs downstream ou acesso privado.

## Project Structure

### Documentation

specs/SPEC-004/ contém spec.md, plan.md, research.md, data-model.md, quickstart.md, contracts/read-tools.md, tasks.md e checklists/requirements.md.

### Proposed future source structure (paths only; not created)

server/domain/read/ contém contracts.js (validators/JSDoc), repository.js (projeções/filtros fixos), hierarchy.js, search.js, planning.js, routines.js e pagination.js.
Testes correspondentes ficam em tests/fixtures/domain-read/, tests/unit/domain-read/, tests/contracts/domain-read/ e tests/integration/domain-read/.

**Structure decision**: módulos ficam fora do grafo de imports do cliente Vite. Esta SPEC fornece serviços de leitura tipados, sem endpoint HTTP ou cliente Supabase server-side. Um runtime/API consumidor pertence ao planejamento futuro da SPEC-002; o gate reutilizado é o da SPEC-001 e permanece fechado.

## Official References

- Supabase JS query shapes e paginação: [select](https://supabase.com/docs/reference/javascript/select), [filters](https://supabase.com/docs/reference/javascript/using-filters), [range](https://supabase.com/docs/reference/javascript/using-modifiers-range).
- Projeção, cast e ordenação PostgREST: [Tables and Views](https://docs.postgrest.org/en/stable/references/api/tables_views.html).
- Intervalo bigint PostgreSQL: [Numeric Types](https://www.postgresql.org/docs/15/datatype-numeric.html).
- Fronteira RLS: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Securing your data](https://supabase.com/docs/guides/database/secure-data).
