# Checklist de qualidade — SPEC-008@2

- [x] PostgreSQL Supabase existente é a única fonte.
- [x] Reutiliza searchItems e contrato SPEC-004.
- [x] Sem banco/cópia/índice/SQL novo, outbox, worker, embedding, Gemini, pgvector ou Docker.
- [x] Entrada, filtros, limites e provenance são definidos por contrato tipado.
- [x] Fatos exatos continuam em SPEC-004.
- [x] Gate SPEC-001 permanece obrigatório.
- [x] Teste direto de conexão Node/Postgres não é requisito.
- [x] Revisar integração e segurança no lote.
- [x] Executar fixtures sintéticas, testes Node, lint e build no lote aprovado.
