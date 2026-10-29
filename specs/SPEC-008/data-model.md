# Modelo conceitual de chunks, fila e versões — SPEC-008

**Estado**: proposta Draft. Não aprova DDL, extensão, grants, RLS, índice físico, conteúdo externo, retenção ou dimensão. `public.demandas` e `public.recorrente` continuam fontes de verdade; não criar entidade de compromisso nem ocorrência de rotina.

## Identidade e fontes

### SourceRef

`{ sourceType, sourceId }` é uma identidade tipada e persistente. IDs `bigint` são transportados como string decimal, sem coerção a `Number`. A hierarquia de `demandas` vem de `tipo`/`raizid`: demanda (`tipo=1`), tarefa (`tipo=2`) e subtarefa (`tipo=3`). Uma rotina, se DEC-007 a considerar elegível, usa um `sourceType` separado como `routine_template` e seu próprio ID de `recorrente`; não tem `parentId`, ocorrência derivada nem equivalência a compromisso.

### Fonte `demandas`

| Campo atual | Função no índice candidato | Recalcula embedding por padrão? |
|---|---|---|
| `id` | `sourceId`, preservado como texto decimal. | Não; identidade/metadata. |
| `tipo` | Tipo estrutural, parte do tipo/template e metadado. | Sim se codificado no texto de embedding. |
| `raizid` | ID do pai; lineage metadata. | Só se o template incorporar relação/título do pai. |
| `demanda` | Texto-fonte candidato sob allowlist DEC-006/007. | Sim quando a representação aprovada muda. |
| `status` | Metadado opcional para filtro; domínio continua autoritativo. | Não, a menos que futuramente seja aprovado como parte do texto. |
| `data_exec`, `hora_inicio`, `hora_fim` | Valores civis de planejamento; metadata opcional. | Não por padrão. Datas e horas mantêm semântica de DEC-003 `America/Cuiaba`. |

### Fonte `recorrente`

O registro é template de rotina, com `id`, `demanda`, horário, weekday(s) e período de vigência, conforme migrations existentes. A inclusão é pendente DEC-007. Se incluído, o índice guarda somente template atual e metadata; não materializa cada dia, não cria identidade de ocorrência, nem converte rotina em demanda, tarefa ou compromisso.

## EmbeddingVersion

Descriptor lógico versionado para espaço vetorial compatível:

```text
EmbeddingVersion = {
  versionId,
  provider,
  modelId,
  modelRevisionOrStabilityMode,
  inputTemplateVersion,
  taskInstructionOrTaskType,
  outputDimensions,
  storageVectorType,
  distanceOperatorClass,
  normalizationContract,
  indexGeneration,
  createdAt
}
```

Todos os campos ligados a seleção, dimensão, normalização e troca dependem de DEC-011; os nomes acima são conceituais. `provider/modelId` não é configurável pelo usuário ou pelo LLM. Uma geração só compara vetores da mesma combinação aprovada. Troca incompatível cria geração paralela, backfill, validação e troca atômica do ponteiro ativo; nunca mistura os espaços nem apaga a geração anterior antes da confirmação de cutover e da política operacional.

## CanonicalRepresentation

```text
CanonicalRepresentation = {
  sourceRef,
  entityKind,
  canonicalText?,
  inputTemplateVersion,
  canonicalInputFingerprint,
  parentChain: [{ entityKind, sourceId }],
  hierarchyFingerprint,
  metadataFingerprint,
  sourceState: eligible | skipped | deleted,
  skipReason?
}
```

`canonicalText` é a única entrada possível para o provider e só pode conter campos aprovados. Nunca contém ID ou metadata de fonte a menos que DEC-006/007 aprovem explicitamente. A representação é uma unidade lógica por item para manter ID/proveniência. Estratégias sintéticas a comparar: texto `tipo + título`, com cadeia apenas em metadata; ou texto incluindo títulos ancestrais. `DEC-007` define qual usar e se nomes curtos devem ser descartados.

O `canonicalInputFingerprint` cobre apenas os bytes normalizados/versionados que determinam o embedding. O `metadataFingerprint` cobre parent IDs/hierarquia e, se aprovados como filtros, status e valores de agenda/rotina. Um update de metadata que não altere input canônico não solicita embedding. Se template incluir ancestor names, a mudança desses nomes reflete no fingerprint dos descendentes afetados.

## OutboxEvent

| Campo conceitual | Significado |
|---|---|
| `eventId` | Identidade opaca/idempotente da entrega; gerador físico pendente. |
| `sourceRef` | Tipo e ID persistente tipados. |
| `operation` | `upsert`, `metadata_refresh`, `delete` ou `eligibility_refresh`. |
| `sourceFingerprintHint` | Opcional; hint somente. Worker relê a fonte atual antes de gravar. |
| `transactionTimestamp` | Observabilidade/ordenação não autoritativa; não substitui fingerprint. |
| `attemptState` | `pending`, `leased`, `completed`, `retryable`, `dead_letter`, `superseded`. |
| `attemptCount`, `leaseUntil`, `failureCode` | Controle operacional. Números de retry e retenção ainda não selecionados. |

O evento guarda referências e operação, nunca título, transcrição, request body, segredo, vetor ou texto do provider. A inserção tem de participar da mesma transação que muda a fonte. Não há `updated_at`/revision na fonte atual; um hint não pode ser usado como autoridade contra a releitura.

## IndexedChunk (derivado)

| Campo conceitual | Regra |
|---|---|
| `chunkId` | Identidade interna do item derivado. |
| `sourceRef` | Identidade persistente do registro de origem; chave única dentro da geração. |
| `entityKind`, `parentChain` | Preservam tipo e hierarquia de origem. |
| `canonicalInputFingerprint`, `inputTemplateVersion` | Determinam se o vetor é reutilizável. |
| `metadataFingerprint`, `filterMetadata` | Projection opcional; freshness precisa ser comprovada contra fonte antes de resposta. |
| `embeddingVersionId`, `indexGeneration` | Impedem comparação entre modelos/dimensões incompatíveis. |
| `embedding` | pgvector vector/halfvec candidato; dimensão e tipo não aprovados. |
| `lifecycle` | `active`, `stale`, `tombstoned`, `skipped`, `failed`; tipos conceituais. |
| `indexedAt`, `invalidatedAt` | Métricas e lifecycle; não definem política de retenção. |

Lexical `tsvector`, RRF, query embedding, result fusion e RAG pertencem à SPEC-009 e não integram o schema desta SPEC.

## Integridade e transições

- A transação origem + evento é tudo-ou-nada; rollback não deixa trabalho órfão.
- Duplicata de event ID ou fingerprint resulta em no-op. Lock/lease serializa mesma origem/geração; upsert idempotente usa `(sourceRef, embeddingVersionId, indexGeneration)` como identidade conceitual.
- Consumidor antigo sempre relê fonte atual e não grava fingerprint desatualizado. Ordem de evento não define versão vencedora.
- Mudança de status/planejamento atualiza metadata, quando presente, sem chamar provider se canonical input não mudou.
- Exclusão em cascata/inelegibilidade cria tombstone; query deve excluir fonte ausente/stale mesmo se a fila estiver atrasada. Não excluir source records neste escopo.
- Dimensão inesperada, `NaN`/infinity, modelo ou versão incompatível não persistem; evento recebe erro categórico sem payload.
- Backfill pode retomar por cursor e só altera o índice. Falha não reverte nem bloqueia escrita da fonte.

## Elementos deliberadamente não definidos

Sem dimensão, modelo, distância, HNSW/IVFFlat, quantidade de candidates, dimensão/tipo de coluna, schema/grant, trigger/function, queue/worker platform, retries numéricos, TTL de outbox/DLQ, qualidade mínima, campos allowlisted, inclusão de rotina ou retenção de vetores antigos. DEC-001/006/007/010/011/012 e benchmark isolado resolvem as decisões aplicáveis; nenhuma escolha neste modelo as aprova.
