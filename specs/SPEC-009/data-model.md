# Modelo de dados e contratos — SPEC-009@2

## RouteDecision
    RouteDecision =
      structured_exact
      | postgres_text_search
      | split_exact_and_text
      | clarification
      | no_safe_route

Perguntas de ID, estado, data, hora, contagem e agenda são exatas e usam SPEC-004. Descoberta textual usa SPEC-008. O roteamento não produz SQL.

## RetrievalEvidence
    RetrievalEvidence = {
      sourceType: tipo allowlisted,
      sourceId: ID decimal,
      displayText: texto atual permitido,
      parentChain: referências atuais tipadas,
      citationRef: referência estável de fonte
    }

Evidência não contém vetor, score de provider, contexto de outra conversa, credencial ou dado não retornado pelo PostgreSQL.

## RetrievalResult
    RetrievalResult = {
      state: complete | empty | ambiguous | access_disabled | unavailable,
      evidence: RetrievalEvidence[],
      queryKind: structured_exact | postgres_text_search,
      warnings: categorias redigidas
    }

Vazio é diferente de falha. Lista vazia não pode esconder indisponibilidade.

## GroundedAnswer
    GroundedAnswer = {
      answerText: string,
      citations: CitationRef[],
      unsupportedClaims: []
    }

Toda afirmação sobre registro deve apontar à evidência devolvida pela leitura atual. Inferências precisam ser distinguidas de fatos. Um candidato lexical não prova status, data, hora ou quantidade.

## Persistência e providers
Não há modelo de dados RAG novo. PostgreSQL Supabase é a fonte única; SPEC-008 define busca e SPEC-004 define leituras exatas. Não há serviço de embedding, índice vetorial, cópia local ou novo modelo de resposta.
