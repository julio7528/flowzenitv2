# Modelo de dados e comandos de mutação — SPEC-006

**Estado:** contrato conceitual Draft. Reutiliza as relações existentes; não cria entidade de compromisso nem coluna de domínio.

## Persistência existente

### `public.demandas`

| Campo | Tipo observado | Regra usada pelo contrato |
|---|---|---|
| `id` | `bigint` identity | ID persistente. API e JSON usam string decimal. Numeração visual não seleciona um registro. |
| `demanda` | `text NOT NULL` | Deve conter ao menos um caractere não branco após `btrim`. O schema observado não define tamanho máximo nem unicidade. |
| `tipo` | `smallint` | `1=demand`, `2=task`, `3=subtask`; o write tool não altera o tipo. |
| `raizid` | `bigint` nullable + FK | Demanda: `null`; tarefa: pai do tipo 1; subtarefa: pai do tipo 2. Mudança de pai/tipo fora do escopo. |
| `status` | `text` | Subtarefa: `Backlog`, `Analise`, `Executando`, `Aguardando`, `Done`; pai: `Backlog`, `Em andamento`, `Done`, derivado. Só subtarefa recebe write de status. |
| `data_exec` | `date` nullable | Para demanda/tarefa é alocação semanal; para subtarefa é data civil diária. Sem conversão UTC. |
| `hora_inicio`, `hora_fim` | `time without time zone` nullable | Apenas subtarefa. Não planejada: ambos nulos. Planejada: ambos presentes e início menor que fim. |

### Consequências atuais dos triggers

- Inserir uma tarefa limpa `data_exec` da demanda pai se ela estiver alocada semanalmente.
- Mover uma tarefa limpa `data_exec`, `hora_inicio` e `hora_fim` apenas das subtarefas que ficam fora da semana de destino. Um movimento de data dentro da mesma semana preserva filhos.
- Atualizar status de subtarefa recalcula o status da tarefa e depois da demanda segundo as regras atuais. O agente lê esses valores de volta; não grava status de pai.
- Intervalos sobrepostos de subtarefas são aceitos. Nenhuma ação do agente move outra subtarefa implicitamente para resolver overlap.

### `public.recorrente`

Não é alterada por esta SPEC. Rotinas e recorrência pertencem à SPEC-007. Nenhum write path desta SPEC aceita uma rotina como demanda, subtarefa ou compromisso independente.

## Objetos de contrato

### `MutationCommand`

| Campo | Regra |
|---|---|
| `operation` / `version` | Nome allowlisted e versão do write tool; nunca escolhido como SQL pelo modelo. |
| `targetId`, `parentId` | IDs persistentes em strings decimais; obrigatórios conforme operação. |
| `payload` | DTO estrito da operação; campos extras, tipo/pai mutável e status de pai são rejeitados. |
| `idempotencyKey` | Criada e mantida pelo runtime/ledger server-side; não é fornecida pelo LLM ou pelo cliente como prova de autorização. |
| `expectedStateFingerprint` | Hash server-side dos campos relevantes observados no preview/antes da confirmação. Não representa uma coluna nova nem um revision global. |
| `confirmationRef` | Referência opaca da SPEC-005 quando a matriz aprovada pedir confirmação. Não autentica o proprietário. |
| `correlationId` | Correlação server-side da SPEC-002; não contém conteúdo privado. |

### `MutationPreview`

Contém a operação, alvo e pai identificados, campos atuais e propostos, timezone quando exibir horário, conjunto completo de registros afetados, mudanças antes/depois e fingerprint das pré-condições. Para criação de tarefa com data semanal no pai, inclui a limpeza da data do pai. Para movimento de tarefa, inclui cada subtarefa cuja data/horários serão limpos. O conjunto precisa ser recalculado na execução.

### `MutationOutcome`

Estados: `COMMITTED`, `NO_OP`, `VALIDATION_ERROR`, `DENIED`, `CONFIRMATION_REQUIRED`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `FAILED`.

Um `COMMITTED` retorna `operation`, ID persistente, valores confirmados após leitura do banco, status derivados de tarefa/demanda, referências seguras de todos os registros afetados e `correlationId`. `NO_OP` informa que o estado já era o solicitado e não relata uma gravação. Outros estados não afirmam sucesso nem expõem SQL, stack, credenciais ou conteúdo de erro bruto.

### `IdempotencyRecord` (porta, sem armazenamento escolhido)

Chave única + hash canônico do comando + estado (`reserved`, `started`, `completed`, `failed-known`, `uncertain`) + referência segura do resultado. Mesma chave/hash devolve o estado/resultado anterior. Mesma chave com hash diferente é conflito. Uma reserva concorrente não pode iniciar um segundo efeito. Estado `uncertain` nunca autoriza retry cego.

## Regras por operação

| Operação | Validação de alvo/payload | Efeito e leitura de retorno |
|---|---|---|
| `create_demand` | `parentId=null`; nome após trim não vazio | Retorna novo ID persistente e status inicial permitido pelo banco. |
| `create_task` | Pai existente do tipo 1; nome após trim não vazio | Retorna tarefa e inclui eventual limpeza da data semanal do pai no preview/outcome. |
| `create_subtask` | Pai existente do tipo 2; nome após trim não vazio | Retorna subtarefa e status inicial; lê status derivado da tarefa e demanda. |
| `rename_demand`, `rename_task`, `rename_subtask` | ID e tipo exatos; novo nome após trim não vazio | Altera somente `demanda`; não altera tipo, parent ou status. Nomes repetidos continuam permitidos pelo schema e nunca são selecionados sem ID. |
| `set_weekly_allocation` | Alvo demanda sem tarefas ou tarefa; `date` civil ISO ou `null` para backlog; subtask é rejeitada | Lê resultado e consequência exata em subtarefas quando alvo é tarefa. Não escreve em rotina recorrente. |
| `set_daily_subtask_schedule` | Alvo subtarefa; ou todos os campos de agenda `null`, ou data e os dois horários presentes; início < fim; data dentro da mesma semana de calendário da tarefa pai | Não rejeita nem desloca outros intervalos sobrepostos. Retorna a agenda persistida. |
| `set_subtask_status` | Alvo subtarefa; enum existente | Escreve somente a subtarefa e lê tarefa/demanda derivados na mesma conclusão. |

## Estado e concorrência

Não existe coluna de revisão/versão observada. Antes do efeito, a transação revalida IDs, tipos, pais, data da tarefa, status da subtarefa e conjunto de filhos afetados conforme a operação. Alteração desde o preview resulta em `CONFLICT` e nenhum write. Registros envolvidos são bloqueados em ordem determinística pela implementação transacional escolhida; lock, adapter e armazenamento real ainda dependem da fronteira de acesso aprovada.

Todos os valores de data são `YYYY-MM-DD`; horários locais são serializados sem offset e preservam `time without time zone`. Ao apresentar horário em preview/confirmação, exibir explicitamente `America/Cuiaba`. A lógica temporal relativa pertence à SPEC-007.
