# Modelo de dados e projeções: SPEC-004

## Persistência existente

Esta SPEC não cria entidades nem altera schema, triggers, grants ou políticas. A fonte transacional continua sendo PostgreSQL/Supabase.

### Hierarquia `public.demandas`

| Campo/projeção | Tipo observado | Regra de leitura |
| --- | --- | --- |
| `id` | `bigint` | ID persistente; DTO/API representa como string decimal para evitar perda de precisão JavaScript. |
| `demanda` | `text` | Nome exibido; é o campo da busca textual proposta. |
| `tipo` | `smallint` | `1=demand`, `2=task`, `3=subtask`; convertido para enum de domínio validado. |
| `raizid` | `bigint` nullable | Referência persistente ao pai; DTO representa em string ou `null`. |
| `status` | texto/valor validado pelo schema e triggers | Subtarefa: `Backlog`, `Analise`, `Executando`, `Aguardando`, `Done`. Demanda/tarefa: `Backlog`, `Em andamento`, `Done`. Para subtarefa é armazenado; para demanda/tarefa é derivado dos filhos. A consulta preserva o valor e inclui `statusSource`. |
| `data_exec` | `date` nullable | Valor civil; semanal para demanda/tarefa, diário para subtarefa. Nenhuma conversão UTC. |
| `hora_inicio`, `hora_fim` | `time without time zone` nullable | Valores civis locais; expostos como horário sem offset e apenas para subtarefas. |

Entidades permitidas por DEC-002 são somente demanda, tarefa e subtarefa. `ScheduleItem` é uma projeção de consulta, não tabela/entidade nova.

### Template `public.recorrente`

| Campo/projeção | Regra |
| --- | --- |
| `id` | Identifica o template persistido; não é ID de ocorrência. |
| `demanda` | Nome da rotina. |
| `hora`, `hora_fim` | Horários locais sem zona; `hora_fim` é opcional e posterior quando presente. |
| `dias_semana` | Array de dias ISO `1..7`; consultado contra o dia civil de `America/Cuiaba`. |
| `data_inicial`, `data_final` | Limites inclusivos da vigência. |

Uma rotina é retornada como template aplicável, nunca como ocorrência persistida, compromisso independente ou subtarefa.

## DTOs de leitura (projeções, não novas entidades)

- **Domain item**: `id`, `name`, `kind`, `parentId`, `status`, `statusSource`, `executionDate`, `startTime`, `endTime`, and stable `sourceRef` (`kind` plus persistent decimal ID).
- **Routine template**: `templateId`, `name`, `weekdaysISO`, `activeFrom`, `activeTo`, `startTime`, `endTime`, and stable `sourceRef` (`routineTemplate` plus persistent decimal ID).
- **Schedule/weekly card**: `sourceKind` (`subtask`, `demand`, `task` ou `routineTemplate` conforme operação), `sourceId`, hierarquia, data civil, tempos locais e status quando aplicável.
- **Query metadata**: `source=relational`, `resultState=empty|nonEmpty`, `completeness=complete|partial|truncated`, `freshness=fresh|stale`, `readAt`, e `nextCursor` quando truncado. Cada item aponta para um `sourceRef` estável com tipo e ID persistente, sempre distinto de numeração visual.

## Estados e limites de resultado

- Uma consulta vazia é sucesso com `items=[]`, `resultState=empty`, `completeness=complete` e metadata de fonte.
- Resultado limitado contém `completeness=truncated` e cursor compatível com os mesmos filtros/ordenação.
- Erro de uma parte necessária falha a operação; não retorna dados incompletos como completos. Se uma operação composta vier a suportar resultado parcial, a metadata deve marcar `partial` e identificar as partes ausentes. As operações relacionais desta SPEC não produzem `partial`.
- Consultas diretas sem cache são atuais no instante de leitura. `freshness=stale` só pode ser produzido por uma fonte com cache/índice e contrato de frescor próprio; isso não pertence a esta SPEC.

## Datas e agenda

Entradas recebem datas civis ISO (`YYYY-MM-DD`), com datas relativas resolvidas antes pelo componente temporal. DEC-003 define `America/Cuiaba`; resultados mantêm `date`/`time without time zone`. Semana canônica começa na segunda-feira; a consulta semanal usa intervalo de sete datas civis `[weekStart, nextWeekStart)`.

Programação diária lista subtarefas com `data_exec` exatamente igual à data pedida. Alocação semanal lista cartões existentes para demanda sem tarefas e tarefa, classificados como agendados (data dentro da semana) ou backlog (data nula); nunca lista subtarefas como cartão semanal. Templates de rotina são consultados por operação separada. Overlaps são preservados.
