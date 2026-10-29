# Pesquisa técnica — SPEC-007

**Estado:** pesquisa de Draft, baseada no checkout local e fontes primárias. Nenhum timezone/runtime, parser, provedor, schema ou política de confirmação foi aprovado por este documento.

## Modelo PostgreSQL observado

As migrations `20261027125409_cadastro_demandas_recorrentes.sql`, `20261027130508_recorrente_multiplos_dias.sql` e `20261028093519_recorrente_horario_fim.sql` definem a série `public.recorrente`:

- `id bigint` identity e chave persistente.
- `demanda text NOT NULL`, não vazia depois de `btrim`; sem limite máximo ou unicidade observados.
- `hora time without time zone NOT NULL`.
- `dias_semana smallint[] NOT NULL`, cardinalidade de 1 a 7 e valores pertencentes a `[1,2,3,4,5,6,7]`. O check não garante unicidade de elementos.
- `data_inicial date NOT NULL`, `data_final date NOT NULL`, com `data_inicial <= data_final`.
- `hora_fim time without time zone NULL`, com check `hora_fim is null or hora_fim > hora`.
- Nenhuma FK para `demandas`; nenhum campo active/enabled; nenhuma chave de ocorrência/exceção; nenhuma tabela de ocorrência.

`src/pages/RecorrentesPage.jsx` faz CRUD da série diretamente pelo cliente Supabase. A UI mapeia segunda a domingo em weekday ISO 1–7 e o `Set` evita duplicatas no formulário, mas essa proteção não é uma constraint PostgreSQL. O formulário atual exige horário final apesar de o banco permitir `null`; ao editar um registro antigo sem `hora_fim`, deriva um horário de exibição de uma hora depois e até pode salvar esse valor. O resolver/agente não deve transformar esse fallback de visualização em duração persistida.

`src/pages/PlanejamentoDiarioPage.jsx` consulta rotinas para uma data selecionada quando o dia está na série e `data_inicial <= data <= data_final`; concatena a projeção read-only com subtarefas para a timeline. `src/lib/recurringTime.js` fornece o fallback visual de uma hora. A projeção não é uma linha de ocorrência e não deve receber ID persistente artificial.

`src/lib/calendarWeek.js` usa aritmética UTC sobre chaves `YYYY-MM-DD` para calcular segunda-feira da semana e não depende do fuso do processo. A página de recorrências, por sua vez, usa `Date`, `getDay()` e construção de datas locais do browser para valores atuais. Nenhum desses comportamentos client-side deve ser reusado pelo parser server-side sem timezone fixo.

As migrações de recorrência concedem leitura e escrita à role `anon` com policies permissivas. São fatos do app atual e não satisfazem o gate de acesso server-side de DEC-001. A SPEC nova não deve criar grants, função SQL, endpoint, nem usar essas policies para agente.

## Regras de produto compatíveis

- DEC-002 limita o agente às entidades existentes. A série `recorrente` é um template; uma linha apresentada para uma data é uma projeção, sem identidade própria.
- DEC-003 aprova `America/Cuiaba` e os valores PostgreSQL `date`/`time without time zone` como valores civis. Um instant com offset e um horário local sem offset são tipos semânticos diferentes.
- A semana usada no planejamento atual é segunda–domingo; `dias_semana` usa ISO 1=segunda…7=domingo. A frase “próxima semana” permanece ambígua para DEC-013 e não herda a regra do componente visual.
- O schema aceita intervalos sobrepostos e a timeline diária coloca itens em faixas adjacentes. Um overlap pode ser reportado com base autorizada, mas não deve impedir nem deslocar itens.
- `hora_fim = null` é valor válido e deve continuar nulo no round trip. Intervalo que cruza meia-noite conflita com o check atual `hora_fim > hora`; não há modelo de dia-offset.
- Não há coluna que pause/retome série. Applicabilidade é calculada pela inclusão de data e weekday. Exclusão de template e interpretação de cancelamento/restauração continuam sem autorização pela política de confirmação/escopo.

## Desenho técnico considerado

1. Receber instante de referência confiável do runtime, nunca de `Date.now()`/browser como relógio implícito da intenção.
2. Fixar `locale: pt-BR` e `timeZone: America/Cuiaba` no contexto. O usuário não pode alterar zone por conteúdo recuperado ou instrução do modelo.
3. Converter instante em data civil usando regras IANA do timezone. “Hoje” usa essa data; “amanhã” avança um dia civil.
4. Manter valores locais sem offset para persistência. Timestamp ISO explícito com offset primeiro identifica um instant e só depois é convertido para Cuiabá.
5. Usar resultado discriminado `resolved`, `ambiguous`, `invalid` ou `unsupported`; não representar falta de confiança como uma data exata. Semana/dia relativo pendente de DEC-013 resulta em esclarecimento.
6. Consultar `recorrente` somente por operações tipadas. Aplicabilidade usa a data civil e weekday; retornos expõem template ID e data consultada, não occurrence ID.
7. Mutação usa policy/confirmation SPEC-005, idempotência SPEC-002/006, transação aprovada e read-back. Com DEC-009 ausente ou gate DEC-001 fechado, nenhuma escrita real ocorre.

## Dependências runtime/timezone

JavaScript fornece `Intl.DateTimeFormat` com timezone IANA, mas o conjunto de dados e capacidades vêm do runtime/ICU. A documentação do Node expõe versões de runtime e dependências por `process.versions`; a versão exata disponível no ambiente de produção segue pendente em DEC-010. O plano sugere capturar versão Node, ICU e tzdb junto à evidência, não aprova pin ou região.

A documentação da proposta Temporal descreve a resolução de horários locais ambíguos com políticas de disambiguation. Uma interface pode usar a opção equivalente a `reject`, desde que a implementação/runtime seja avaliada; nenhum polyfill/dependency é escolhido aqui. Regras de zona podem mudar historicamente ou em futuras atualizações IANA, então fixtures devem ser fixadas a datas e registrar versão dos dados usados.

## Pendências e riscos

| Item | Situação | Limite atual |
|---|---|---|
| DEC-001 | Aprovada para passkey existente, sem autenticação nova; controle adequado separado não escolhido | Bloqueia queries privadas e writes reais. |
| DEC-003 | Aprovada | Fixa zona e persistência civil. |
| DEC-004 | Pendente | Bloqueia skip, edição individual, feriado e demais exceções, não a série básica. |
| DEC-009 | Pendente | Matriz de confirmação para criar/editar/agendar série não está aprovada; proposta fica isolada em contrato. |
| DEC-010 | Pendente | Sem runtime/região fixados, compatibilidade e TZDB/ICU de produção não estão definidos. |
| DEC-013 | Pendente | Dia da semana sem data e “próxima semana” não podem escolher data/range para query ou write. |
| `hora_fim` nulo | Compatibilidade real do schema | Não inferir 1h como valor persistido; UI atual tem fallback de exibição. |
| Timeout/ambiguidade | Risco de resolução temporal | Não retornar sucesso nem escrever quando relógio, timezone data ou interpretação não estiver disponível. |

## Fontes primárias

- [PostgreSQL: Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html) — distingue `date`, `time without time zone` e timestamps.
- [PostgreSQL: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — referência para semântica de checks no schema observado.
- [Node.js: `process.versions`](https://nodejs.org/api/process.html#processversions) e [Node.js: Internationalization support](https://nodejs.org/api/intl.html) — runtime/ICU precisam ser conhecidos para evidência reprodutível.
- [Temporal `ZonedDateTime`](https://tc39.es/proposal-temporal/docs/zoneddatetime.html) — referência para opções de disambiguation de horário local; não seleciona implementação.
- [Temporal timezone guide](https://tc39.es/proposal-temporal/docs/timezone.html) — distingue instant, timezone e horário local.
- [IANA Time Zone Database — `southamerica`](https://data.iana.org/time-zones/tzdb/southamerica) — regras históricas por zona precisam ser cobertas nos fixtures usados.

Nenhuma referência acima transforma uma proposta arquitetural em decisão de produto ou runtime.
