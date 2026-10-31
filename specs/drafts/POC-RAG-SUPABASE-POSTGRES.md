# RAG POC com Supabase PostgreSQL

**Status:** Direção confirmada pelo usuário em 2026-10-30. Este documento é Draft e não autoriza implementação nem aprovação de lote.

## Direção

- RAG usa somente dados do PostgreSQL do projeto Supabase existente.
- Recuperação lexical reutiliza searchItems e o acesso Supabase já existente em SPEC-004. Sem índice adicional, FTS nova, migration, banco secundário, conexão pg separada ou sincronização assíncrona.
- Sem Docker, PostgreSQL local/branch, embeddings/Gemini, pgvector, vetor externo, RRF, outbox ou worker.
- Perguntas exatas continuam usando leituras estruturadas SPEC-004; descoberta textual usa searchItems. Resultados incluem provenance e não autorizam escrita.
- O modelo de resposta já definido em SPEC-002 permanece; a alteração limita a fonte e o caminho de recuperação do RAG, não adiciona provider.
- DEC-001 e controles vigentes para acesso e envio de conteúdo ao modelo continuam aplicáveis.
- Testes usam doubles no Node e fixtures artificiais no projeto Supabase de desenvolvimento via cliente Supabase/SQL MCP, com preflight, IDs capturados e rollback/limpeza. URL/certificado para conexão Node pg não é gate.

## Revisões documentais preparadas

- SPEC-003@4: memória conversacional, validação simplificada no Supabase e testes Node com doubles; conexão direta Node/Postgres não obrigatória.
- SPEC-008@2: busca lexical reaproveita SPEC-004; sem embeddings, índice duplicado ou serviço.
- SPEC-009@2: RAG textual, roteamento para leituras exatas, grounding e modelo existente.

Snapshots antigos e lotes registrados não serão alterados. Implementação requer registrar um novo manifesto imutável e aprovação explícita do identificador e hash exatos desse manifesto.

