# Checklist de qualidade — SPEC-009@2

- [x] Fonte única de retrieval definida: PostgreSQL Supabase.
- [x] Busca lexical separada das leituras factuais exatas SPEC-004.
- [x] Sem embeddings, pgvector, RRF, provider novo ou banco auxiliar.
- [x] Roteamento, vazio, ambiguidade, acesso fechado e falha diferenciados.
- [x] Provenance e grounding definidos; conteúdo é não confiável.
- [x] Modelo de resposta existente SPEC-002 preservado.
- [x] Integração sintética pelo cliente Supabase/PostgREST; unit tests Node com doubles.
- [x] Interfaces implementadas e compatibilidade SPEC-001/002/004/008 revisada.
- [x] Testes, gates e auditoria executados sob lote aprovado.
