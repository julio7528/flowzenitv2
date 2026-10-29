# Contrato de busca, escopo e RRF — SPEC-009

**Estado**: interface interna proposta para Draft. Não é endpoint público, SQL entregue ao modelo ou autorização de leitura privada.

## Request e roteamento

```text
retrieve({ queryText, intent, typedScope, correlationId })
  -> RetrievalResult

intent = exact | semantic | mixed | unknown
```

1. Validar tamanho e formato de query/scope sob limites configurados; números máximos dependem runtime DEC-010/012.
2. Executar o gate DEC-001 antes de qualquer leitura privada, embedding de query ou consulta dos dois canais. Gate fechado retorna `ACCESS_DISABLED` e chama zero repositórios/providers.
3. `exact` roteia para tool SPEC-004; `semantic` pode executar FTS + vector; `mixed` separa subconsultas e preserva origem de cada resultado; `unknown` pede esclarecimento ou consulta estruturada safe.
4. Query model/LLM pode propor somente campo de request tipado. O runtime valida enum e constrói operação parametrizada; não recebe SQL, table/column, operador ou tsquery do modelo.

## Escopo comum

```text
TypedScope = {
  entityKinds?: enum[],
  rootDemandId?: DecimalId,
  parentId?: DecimalId,
  localDateFrom?: LocalDate,
  localDateTo?: LocalDate,
  allowedAttributes?: validated enums
}
```

- A lista de filtros/limites é idêntica em `LexicalRetriever.search` e `VectorRetriever.search`.
- IDs bigint permanecem decimal strings. Parent/root filters são verificáveis contra hierarquia atual `tipo`/`raizid`.
- Datas civis seguem DEC-003 `America/Cuiaba`; horas não têm timezone na fonte atual. Index metadata pode limitar escopo, mas não responder data/horário/status exatos.
- Routine template é um source kind separado somente se DEC-007 autorizar; nunca é ocorrência/compromisso.
- Scope reduz candidate set; não é authorization. Não há foreign owner/tenant identity model.

## Canais

```text
LexicalRetriever.search({ queryText, typedScope, allowlistedTextVersion })
  -> RankedSourceRef[]

VectorRetriever.search({ queryEmbedding, embeddingVersionId, typedScope })
  -> RankedSourceRef[]
```

- Lexical use FTS fixo/parametrizado sobre campos aprovados; linguagem, normalization, web-query grammar e GIN strategy são validados na suite sintética. `websearch_to_tsquery` é opção para input comum, não execução de DSL livre.
- Vector request/embedding/inference usa somente `embeddingVersionId` ativo da SPEC-008. Incompatibilidade falha fechada.
- Cada canal retorna sourceRef tipado, rank ordinal e fingerprint. Score original pode existir como observabilidade interna, mas não participa da soma RRF.
- Lista passa por current-source existence, eligibility, fresh hierarchy/fingerprint, lifecycle e scope antes de qualquer texto ser retornado.

## Fusion

Proposta de baseline:

```text
RRF(sourceRef) = Σr 1 / (k + rank_r(sourceRef))
```

Só incluir retrievers que concluíram. `rank` é 1-based; se o source não aparece em uma lista, contribuição daquele canal é zero. Dedupe key `(sourceType, sourceId)`. Desempate determinístico por `sourceType`, depois ID decimal comparável como string normalizada ou comparator bigint-safe. `k`, per-channel candidate limits, weights, result limit e threshold de evidência são config versionados ainda sem valor aprovado.

### Estados de resposta

| Estado | Significado |
|---|---|
| `complete` | Ambos canais rodaram, freshness/scope validados e fusão concluída. |
| `degraded_lexical_only` | Vector indisponível; lexical foi concluído e resposta marca modo degradado. |
| `degraded_vector_only` | FTS indisponível; vetor foi concluído e resposta marca modo degradado. |
| `empty` | Canais disponíveis executaram e nenhum resultado passou filtros; diferente de erro. |
| `unavailable` | Ambos canais falharam ou freshness não pôde ser comprovada. Não converter em “nenhum item”. |
| `access_disabled` | Gate fechado; zero private calls. |
| `incompatible_generation` | Query embedding não combina com geração ativa; sem fallback vetorial. |

## Tratamento de falhas e atualização

- Uma falha isolada permite responder somente com o canal saudável e estado degraded explícito. Não dizer “busca híbrida completa”.
- Falha dupla, scope inválido, provider timeout, versão incompatível ou source freshness desconhecida não vira lista vazia ou evidence completa.
- Filtro seletivo vetorial que retorna menos candidatos exige indicar cobertura parcial ou usar caminho de busca compatível validado; nunca inventar k resultados.
- Candidate que foi deletado/alterado durante busca é removido após reler source/ fingerprint. Generation inativa não participa da fusão.
- RRF score/rank não é probability/confidence. Regra de evidence threshold deve ser calibrada com dataset; sem evidência suficiente, response `not_found` ou `clarify`.

## Limites e segurança

Candidate counts, payload/context sizes, request timeouts, HNSW search values, query embedding requests, RRF `k` e provider limits são pendências DEC-010/011/012; nenhum número novo é fixado aqui.

Gate DEC-001 é independente de passkey client-side, Supabase `anon`, RLS grants existentes, source ID, typed filters ou `service_role`. Nenhum item é enviado ao modelo até acesso autorizado, scope/freshness prontos e DEC-006/007 satisfeitas. Nenhum retrieval output habilita write tool.
