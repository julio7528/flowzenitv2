# Quickstart de validação — SPEC-009@2

**Draft**: nada aqui foi executado ou aprovado por este documento.

1. Preparar fixtures artificiais e casos rotulados para busca, consulta exata, pergunta mista, ambiguidade, sem resultado, indisponibilidade e prompt injection.
2. Validar as rotas e citações em testes Node com doubles.
3. Confirmar que estado fechado de acesso não chama repository e que saída do banco não pode disparar outra tool ou escrita.
4. Validar a busca pelo cliente Supabase/PostgREST existente contra o Postgres do Supabase após preflight; registrar IDs fixture e fazer rollback ou limpeza restrita. SQL MCP pode auxiliar o preflight.
5. Conferir que exatos retornam por SPEC-004 e discovery por SPEC-008.
6. Executar testes focais, lint e build do lote; registrar resultados reais.

Sem Docker, PostgreSQL local, segunda base, vector provider ou URL/certificado para driver Node. Não usar conteúdo privado na validação sem passar pelos gates atuais de acesso e envio.
