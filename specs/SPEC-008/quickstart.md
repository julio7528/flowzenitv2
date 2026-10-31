# Quickstart de validação — SPEC-008@2

**Draft**: nenhum passo abaixo foi executado/aprovado por este documento.

Usar somente o Postgres do projeto Supabase de desenvolvimento. A recuperação de runtime usa a ferramenta Supabase já existente. Node unit tests usam doubles; teste de integração obrigatório usa o cliente Supabase/PostgREST existente. SQL MCP pode auxiliar o preflight. Não usar Docker, banco local, branch, segunda base ou exigir URL/certificado de driver Node.

No lote aprovado:
1. Confirmar projeto/ref, schema, permissões e ausência do marcador exclusivo deste run.
2. Criar apenas fixtures artificiais; registrar os IDs.
3. Consultar pelo caminho aprovado: busca, filtro, caracteres especiais, update e delete.
4. Reverter quando possível; caso não seja, limpar somente IDs capturados na ordem de dependência.
5. Registrar ferramenta/SQL usado e resultado real sem credenciais/dados privados.
6. Executar testes focais, lint e build.

Não confundir testes com doubles, SQL MCP e chamada pela biblioteca Supabase: cada um valida camadas diferentes; a chamada pelo cliente Supabase é a evidência do caminho de runtime.
