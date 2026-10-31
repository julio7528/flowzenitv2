# Plano técnico: fonte lexical do RAG no Supabase Postgres

**SPEC ID**: SPEC-008 | **Versão**: 2 | **Status**: Draft
**Manifest hash**: atribuído somente ao registrar lote | **Spec**: [spec.md](spec.md)

## Resumo
Reutilizar searchItems de SPEC-004, já conectado ao PostgreSQL Supabase pelo cliente Supabase/PostgREST. Esta SPEC define somente seu uso como recuperação para o RAG e os limites de conteúdo/provenance. Não criar busca duplicada, função SQL, índice, migration ou outro recurso.

## Arquitetura e limites
- Fonte: PostgreSQL do projeto Supabase existente.
- Acesso: repositório Supabase atual e ferramenta tipada SPEC-004; sem conexão pg direta.
- Busca: substring literal conforme contrato SPEC-004; sem RRF, FTS adicional ou vetor.
- Fatos exatos: leituras estruturadas SPEC-004.
- Resposta: modelo já usado por SPEC-002; nenhum provider novo.
- Segurança: gate SPEC-001; grants/RLS e schema atuais sem alteração.

## Sequência
1. Auditar que implementação e DTO de searchItems correspondem ao contrato SPEC-004.
2. Confirmar o fluxo RAG chama somente a ferramenta tipada e valida resultados/provenance.
3. Testar pelo cliente Supabase/PostgREST existente com fixtures sintéticas: termo, filtros, escape literal, update e delete.
4. Rodar testes focais, lint e build do lote aprovado.
5. Registrar resultados reais. Não alegar conexão Node/PostgreSQL direta se só houve teste pelo cliente Supabase, MCP ou doubles.

## Dependências
- SPEC-001: gate de acesso.
- SPEC-004: busca textual, filtros, limites, entidades e proveniência.
- SPEC-002: resposta já existente.
- Não depende de Gemini, pgvector, outbox, worker ou decisões de embedding.

## Riscos
- Substring não encontra sinônimos: clarificar/reformular.
- Resultado desatualizado: sempre consultar linha atual.
- Tentativa de SQL livre: parâmetros/DTOs tipados.
- Dado privado sem autorização: gate antes de repository; não mudar RLS/grants.

## Gate
| Verificação | Regra |
|---|---|
| Conexão direta Node pg | Não é gate. Se não executada, registrar NOT VERIFIED. |
| Cliente Supabase/PostgREST com fixtures sintéticas | Obrigatório para conclusão, usando o caminho existente. SQL MCP pode ajudar no preflight, mas não o substitui. |
