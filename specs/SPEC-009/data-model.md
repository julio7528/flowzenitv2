# Modelo conceitual de retrieval, ranking e evidência — SPEC-009

**Estado**: proposta Draft. Não aprova tabelas, função SQL/RPC, index, provider, thresholds ou exposição privada. A fonte de verdade continua relacional.

## RetrievalRequest

```text
RetrievalRequest = {
  queryText: bounded string,
  intent: exact | semantic | mixed | unknown,
  scope: {
    entityKinds?: demand | task | subtask | routine_template[],
    rootDemandId?: DecimalId,
    parentId?: DecimalId,
    localDateFrom?: LocalDate,
    localDateTo?: LocalDate,
    allowedAttributes?: typed enum fields
  },
  requestCorrelationId
}
```

`routine_template` só existe no retrieval se DEC-007 aprovar a entidade textual separada. `DecimalId` é string decimal; nenhum BigInt vira JS Number. Os campos de scope têm esquema server-side e validação; query não escolhe tabela, coluna, operador, SQL, tsquery grammar, raw PostgREST filter ou vector generation.

Status, data, hora, contagem, permissão e IDs usados como valor de resposta são lidos pela SPEC-004. Scope pode reduzir candidatos de uma exploração semântica; não transforma metadata do índice em verdade atual. Datas civis respeitam `America/Cuiaba`/DEC-003.

## RouteDecision

```text
RouteDecision = structured_only | semantic_hybrid | split_exact_and_semantic | clarify
```

- Pergunta por ID/status/count/date/range/schedule/permission/mutation target -> `structured_only`.
- Pedido semanticamente descritivo -> `semantic_hybrid` apenas depois do gate.
- Pedido misto -> separar subconsultas exatas e de descoberta; não inferir exatidão de ranking.
- Incerteza na classificação -> `clarify` ou leitura estruturada de escopo seguro; não SQL generativo.

## LexicalDocument e VectorDocument

### LexicalDocument

```text
LexicalDocument = {
  sourceRef,
  lexicalFieldsVersion,
  textSearchConfig,
  tsvector,
  sourceFingerprint,
  sourceHierarchy,
  lifecycle
}
```

Conteúdo lexical vem somente do corpus allowlisted por DEC-007. Fonte atual baseline é nome `demanda`; FTS generated column, expression index ou projeção privada são alternativas de schema. Nenhuma é escolhida. Texto lexical e `tsvector` são derivados; sourceRef, freshness e scope são revalidated. Enviar qualquer query/texto a provedor externo também exige a política de disclosure DEC-006.

### VectorDocument

```text
VectorDocument = {
  sourceRef,
  canonicalInputFingerprint,
  metadataFingerprint,
  parentChain,
  embeddingVersionId,
  indexGeneration,
  sourceFingerprint,
  lifecycle
}
```

Documento vetorial, conteúdo canônico, dimension/type/operator e geração pertencem à SPEC-008. Busca não usa vetor de outra versão e não é dona de reindexação. Source fingerprint precisa ser confirmado via contrato de frescor SPEC-008/relational current row.

## ChannelCandidate e rankings

```text
ChannelCandidate = {
  sourceRef,
  ordinalRank: positive integer,
  channel: lexical | vector,
  sourceFingerprint,
  metadataFingerprint,
  freshness: verified | stale | unknown,
  eligible: boolean,
  displayEvidence?: allowlisted current source fields
}
```

Raw `ts_rank` ou vector distance podem ser diagnostics internos, mas não são somados entre métodos nem tratados como confidence. Candidate com stale/unknown source, inactive generation, source inexistente ou fora de filtro não sai para o modelo.

## FusedCandidate

```text
FusedCandidate = {
  sourceRef,
  lexicalRank?,
  vectorRank?,
  rrfScore,
  rankConfigVersion,
  sourceFingerprint,
  parentChainCurrent,
  evidenceText,
  citationRef
}
```

`citationRef` aponta para `{sourceType, id, parentChain}` estável. Identity/dedupe é `(sourceType, sourceId)`; desempate é determinístico por source type/ID. `k`, weights, candidate cutoffs, maximum context sizes e evidence threshold continuam sem valores até avaliação e DEC-010/011/012 aplicáveis. RRF score é ordinal/rank-derived, não probabilidade.

## ChannelState e RetrievalResult

`ChannelState`: `complete`, `degraded_lexical_only`, `degraded_vector_only`, `unavailable`, `empty`, `access_disabled`. Falha de canal não vira lista vazia completa.

`RetrievalResult` carrega estado, candidatos válidos, metadados de cobertura/limite, versão do rank config e warnings redigidos. Não inclui candidate privado se DEC-001 gate não estiver cumprido. Não contém argumento SQL, payload de provider ou score secreto para resposta.

## GroundingEvidence e resposta

```text
GroundingEvidence = {
  factualClaims: [{ claimText, citationRefs: CitationRef[] }],
  inferenceClaims: [{ claimText, label: "inference" }],
  unsupportedClaims: []
}
```

Cada claim sobre registro aponta para sourceRefs válidos, atuais e presentes no retrieved set. Inference é rotulada. Claim exata de status/data/hora/contagem requer resultado relacional; vetor não a sustenta. Quando não há candidato suficiente, resultado é `not_found`/`clarification`, não resposta inventada.

## EvaluationCase

```text
EvaluationCase = {
  caseId,
  syntheticQuery,
  expectedRoute,
  typedScope,
  relevantSourceRefs,
  entityKind,
  languageAndVariant,
  requiresCitation,
  injectionFixture?,
  exactFactExpectation?
}
```

Dataset versionado contém dados artificiais sem prompt/transcript privado. `Recall@k`, `MRR`, `nDCG@k`, `noResultPrecision`, exact-route rate e citation support são outputs; mínimo de ranking além do SC-002 e baselines são aprovados em etapa de decisão.

## Invariantes

- Acesso é decidido antes de consulta privada; scope/lifecycle filter não é controle de acesso.
- Lexical e vector recebem igual scope; a fonte atual decide existência, hierarquia e freshness.
- Exact transactional queries seguem SPEC-004 mesmo se RAG retorna rank 1.
- Retrieved text é untrusted; prompt injection não pode alterar tool/permission/policy.
- RRF combina ranks de retrievers saudáveis; IDs repetidos são fundidos uma vez; raw scores incompatíveis não são somados.
- Resposta incompleta/degradada/stale é explicitamente identificada; falha dupla é dependência indisponível, não “não encontrado”.
- Nenhum objeto introduz usuário, tenant, organização, compromisso ou ocorrência recorrente.
