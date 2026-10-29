# Contratos propostos de ferramentas de leitura — SPEC-004

**Estado:** contratos Draft para ferramentas internas do agente. Não são endpoints HTTP nem autorizam exposição de dados. Qualquer leitura privada em produção fica fechada até o gate DEC-001.

## Princípios comuns

- Operações são nomeadas e têm DTOs validados em runtime JavaScript; o modelo não escolhe tabela, coluna, SQL, operador, expressão PostgREST ou ordenação.
- Datas de entrada são `YYYY-MM-DD` civil já resolvidas. O contrato não interpreta linguagem natural; `America/Cuiaba` e `SPEC-007` governam a resolução externa.
- IDs de entrada/saída são strings decimais; valores `bigint` devem ser projetados como texto antes de qualquer coerção a `Number`.
- Aplicar filtros suportados com AND, projeção mínima de colunas, ordenação determinística com ID persistente como desempate e limites aprovados localmente: `pageSize=50` por padrão/máximo 100; texto até 200 Unicode code points; faixa civil inclusiva até 366 dias. Estes parâmetros não aprovam limites globais da DEC-012.
- Cursores são opacos para o consumidor, vinculados ao hash dos filtros e ordenação. Paginação não promete snapshot transacional se a base mudar entre páginas.
- Supabase `error` não é confundido com `data=[]`; erros internos não incluem query, chave, stack ou payload privado na resposta ao modelo. Cada item retornado carrega `sourceRef` estável formado pelo tipo de registro e ID persistente.

## Operações

### `getHierarchy`

**Request**: `{ itemId: DecimalId }`.

Retorna a cadeia persistida de pai até o item e os descendentes aplicáveis ao tipo consultado: demanda → tarefas → subtarefas; tarefa → demanda e subtarefas; subtarefa → tarefa e demanda. Todos os nós incluem ID persistente, tipo, pai, nome e status com origem `stored|derived`. Numeração visual, se incluída pelo chamador, é marcada como `displayOnly`.

### `getItemById`

**Request**: `{ itemId: DecimalId }`.

Retorna um único item existente com os campos permitidos. ID inválido é `INVALID_INPUT`; ausência retorna o mesmo resultado externo `NOT_FOUND` sem tentar representar foreign owner/tenant, pois não há esse modelo.

### `searchItems`

**Request**: `{ text?, kinds?, statuses?, dateFrom?, dateTo?, parentId?, pageSize?, cursor? }`.

- `kinds` limita a `demand|task|subtask`; `statuses` valida os enums existentes por tipo: subtarefa `Backlog|Analise|Executando|Aguardando|Done`; demanda/tarefa `Backlog|Em andamento|Done`.
- `dateFrom`/`dateTo` são inclusivos e civis; quando ambos informados, o início não excede o fim e a faixa observa o limite configurado.
- Busca textual é substring literal case-insensitive e accent-sensitive sobre `demanda`, via Supabase/PostgREST `ilike`/PostgreSQL `ILIKE`. Escapar `%`, `_` e `\` conforme o escape padrão de pattern matching do PostgreSQL; esses caracteres fornecidos pelo usuário são literais, não curingas.
- `ILIKE` segue a locale/collation ativa. T025 deve verificar a collation existente, comprovar distinção entre acentuado e não acentuado, e confirmar que pattern matching é suportado sem alteração de schema. Não aplicar `unaccent`, criar collation/extensão, normalizar Unicode ou prometer equivalência NFC/NFD/full case-folding.
- Resultados múltiplos permanecem candidatos separados; a ferramenta não escolhe silenciosamente. O chamador pede mais contexto quando necessário.
- Busca semântica/lexical híbrida/RRF é responsabilidade de SPEC-008/009, não desta operação.

### `getDailySchedule`

**Request**: `{ date: LocalDate, pageSize?, cursor? }`.

Retorna subtarefas agendadas em `data_exec = date`, com hierarquia, status, `hora_inicio`/`hora_fim` e ID persistente. Não inclui rotina como se fosse subtarefa; use `getRoutineTemplates`. Não inclui backlog não agendado. Itens simultâneos permanecem no resultado. A ordem sugerida é horário inicial, nome em locale `pt-BR` e ID.

### `getWeeklyAllocation`

**Request**: `{ weekStart: LocalDate, pageSize?, cursor? }`; `weekStart` precisa ser segunda-feira civil.

Retorna somente cartões semanais suportados: demanda sem tarefas e tarefa. Inclui alocações com data dentro dos sete dias e itens sem data na coleção `backlog`. Não inclui subtarefas como cartões semanais. A ordem sugerida preserva ID para demanda/tarefa e tem desempate determinístico.

### `getRoutineTemplates`

**Request**: `{ date: LocalDate, pageSize?, cursor? }`.

Retorna template se o dia ISO da data está em `dias_semana` e `data_inicial <= date <= data_final`. Limites são inclusivos. Ordenação sugerida: hora, primeiro dia ISO aplicável e ID. Não emite ID de ocorrência nem cria registro.

## Envelope de resposta

```json
{
  "items": [],
  "metadata": {
    "source": "relational",
    "completeness": "complete",
    "freshness": "fresh",
    "readAt": "server timestamp",
    "nextCursor": null
  }
}
```

`resultState=empty` com `items=[]` representa ausência de resultados; os demais resultados usam `resultState=nonEmpty`. `completeness` aceita `complete|partial|truncated`; `freshness` aceita `fresh|stale`. Ao atingir o limite, retornar `truncated` e `nextCursor`. Leituras relacionais sem cache usam `fresh`; falha necessária retorna erro em vez de parcial não rotulado. Esta SPEC não produz `partial` nem `stale`; esses estados só podem ser usados se uma operação composta ou fonte futura os justificar com evidência e sem omissão silenciosa. Cada item inclui `sourceRef: { kind, id }` estável, com ID decimal persistente.

## Erros previstos

`INVALID_INPUT`, `NOT_FOUND`, `ACCESS_DISABLED`, `DEPENDENCY_UNAVAILABLE` e `INTERNAL`. Mapeamento HTTP, se houver API, é da SPEC-002. Se o gate DEC-001 não estiver satisfeito, retornar `ACCESS_DISABLED` antes de chamar o repositório, sem dado ou efeito colateral.

## Critérios de teste de contrato

- IDs `bigint` além do inteiro seguro de JavaScript preservam texto decimal sem arredondamento.
- Entradas inválidas, status não permitido, intervalo reverso, cursor/filtros incompatíveis e query arbitrária são recusados.
- Hierarquia e origem do status correspondem a fixtures sintéticas e às regras do banco.
- Dia/semana usam data civil, segunda-feira inicial, limite semanal exclusivo seguinte, horários sem offset e `America/Cuiaba` sem conversão UTC.
- Overlaps retornam ambos os itens; rotina respeita weekday ISO e limites inclusivos.
- Paginação sinaliza truncamento, cursor e ordenação; erro necessário não vira lista vazia nem resultado completo.
- Testes integrados verificam escape literal de `%`, `_` e `\`, case-insensitivity local e distinção de acentos; formas Unicode compostas/decompostas não têm equivalência garantida.
- Gate fechado impede chamadas privadas pelo serviço; T025 usa apenas fixtures sintéticas temporárias no projeto de desenvolvimento autorizado, com preflight e rollback ou cleanup exato por IDs capturados.

## Fronteira de integração e segurança

- O repositório recebe um cliente Supabase server-side estreito por injeção; sua criação pertence à integração do runtime e não à SPEC-004. SPEC-001 não fornece um cliente server-side.
- Antes do repositório, o serviço consulta o gate `withAgentAccess()` de SPEC-001. Na implementação atualmente concluída, o gate sempre nega e não chama a operação protegida. Nenhum request, variável de ambiente ou fixture de teste pode alterar esse resultado.
- T025 pode testar diretamente o repositório no projeto Supabase de desenvolvimento existente, exclusivamente com registros sintéticos identificados por um marcador único do run. Registrar IDs e relações, preferir transação/rollback e, se PostgREST exigir registros persistidos, remover somente IDs capturados em ordem child-first. Nunca usar DELETE amplo, TRUNCATE, DROP, reset, nem alterar registro preexistente. Se o escopo ou cleanup não for seguro, interromper aquela operação e reportar a alternativa.
- Essa exceção é exclusiva de SPEC-004@2 e não habilita leituras pelo serviço ou endpoint, nem muda o gate DEC-001. Demais SPECs continuam sob o padrão de teste isolado definido em AGENTS.md.
