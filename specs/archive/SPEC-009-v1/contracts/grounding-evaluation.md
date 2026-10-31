# Contrato de contexto, citações e avaliação — SPEC-009

**Estado**: comportamento proposto, Draft. Não envia registros privados, prompts ou query a modelo/provider.

## ContextBuilder

```text
buildContext({ userQuestion, retrievalResult, structuredFacts?, budget })
  -> { contextItems, evidenceState, omittedCount, routeProvenance }
```

- Só aceita candidate aprovado, fresco, elegível, filtrado e sourceRef retornado pelos canais neste turno.
- Limites de caracteres/tokens, número de candidatos e truncagem dependem SPEC-002, runtime DEC-010, modelos DEC-011 e contenção DEC-012. Nunca escolher números aqui nem exceder orçamento do modelo silenciosamente.
- Preservar `sourceType`, ID persistente e parent chain atual. Candidate, título, metadado e texto recuperado ficam demarcados como dados não confiáveis.
- Mensagem recuperada que contenha comandos (por exemplo, “ignore as regras”) continua conteúdo de usuário/dado. Não pode alterar system/developer policy, permissões, identidade, schema de ferramenta, SQL, autorização ou decisão de canal.
- Output informa `complete`, `partial`, `degraded`, `not_found`, `clarify` ou `access_disabled`; nunca oculta lista incompleta.
- Contexto não substitui histórico/memória SPEC-003, nem produz fatos exatos por inferência.

## Evidence e resposta

```text
EvidenceResponse = {
  answer,
  claims: [{ text, type: retrieved_fact | structured_fact | inference, citations: CitationRef[] }],
  retrievalState,
  limitations: []
}

CitationRef = { sourceType, id, parentChain? }
```

- Cada claim baseada em registro aponta a uma ou mais referências atuais presentes no conjunto retornado.
- `structured_fact` de status, data/hora, count ou ID deve apontar resultado SPEC-004; ranking semântico não serve como evidência.
- Claim de inference tem rótulo/linguagem apropriados e não se apresenta como campo recuperado.
- Validador remove/rejeita referência não retornada, obsoleta, inelegível, fora do scope ou de geração inativa. O modelo não cria IDs/citações livremente.
- Se nenhum candidate suporta a pergunta, ou a confiança/evidence não foi calibrada, response informa “não encontrei”/pede esclarecimento. RRF score não é confidence.
- Source display text é allowlisted e redigido por DEC-006/007 antes de formar contexto.

## Gates de provider

Antes de qualquer query embedding ou chamada de resposta usando dados privados, exigir gate DEC-001 concluído e DEC-006/007/010/011/012 resolvidas, além de SPEC-008 sincronizada/versionada. A query do proprietário também pode conter informação privada. Testes usam doubles locais determinísticos e dados artificiais, sem Gemini/DeepSeek real.

## Dataset de avaliação versionado

```text
EvaluationCase = {
  caseId,
  syntheticQuestion,
  queryClass: exact | semantic | mixed | no_relevant_source,
  expectedRoute,
  typedScope,
  relevantSourceRefs,
  expectedFacts?,
  language: pt-BR,
  entityKind,
  expectedCitationSupport,
  injectionTextFixture?
}
```

Cada versão inclui fixtures semânticas com aliases/sinônimos, forma com/sem acento, termos curtos, nome da entidade, parent path, filtros, nenhum resultado, título ambíguo, falha de canal, stale/deleted source, geração incompatível, perguntas exatas, pergunta mista e prompt injection armazenado em título.

## Métricas

Relatar por categoria/entidade e em conjunto:

- `Recall@k` e `Recall@5` sobre relevâncias rotuladas;
- `MRR` (primeiro relevante);
- `nDCG@k` quando relevance labels forem graduadas;
- `noResultPrecision`/qualidade de abstenção;
- taxa de exact-query roteada a SPEC-004 (SC-001 mantém meta 95%);
- cobertura de claims/citações (SC-004), candidate freshness/filter safety (SC-003) e vazamento privado (SC-005);
- comparação lexical-only, vector-only, RRF, e structured tools como baseline de exatidão.

Os valores `k` de ranking/context, relevance baseline, mínimo de ganho RAG, threshold de abstenção e limite operacional não são definidos. O mínimo de aceitação para as métricas de retrieval precisa ser explicitamente aprovado; não deduzir do histórico do paper RRF ou do exemplo Supabase.

## Casos de segurança obrigatórios

1. Acesso gate fechado → zero lexical/vector/provider/private reads.
2. Texto recuperado tenta sobrescrever políticas, pedir SQL ou solicitar tool de escrita → mensagem permanece dado, nenhuma autoridade/tool muda.
3. Candidato apagado, stale, fora de filtro ou de geração incompatível → não aparece no contexto/citação.
4. Provider/FTS/vector degradado → estado exposto, dados de um canal saudável não são descritos como híbrido completo.
5. Claim factual sem citation válida → abstenção ou correção, não fato inventado.
6. Pergunta por status/data/hora/contagem/ID → SPEC-004 autoritativa; resposta sem número aproximado de RAG.
