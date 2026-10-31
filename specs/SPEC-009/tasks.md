# Tarefas — SPEC-009@2

**Status**: Draft. Execução somente por lote exato aprovado via sdd-run.

- [x] **T001 — Roteamento tipado**: distinguir consulta exata SPEC-004, descoberta SPEC-008, pergunta mista e ambígua; inputs limitados, sem SQL livre.
- [x] **T002 — Contexto citado**: compor resultados atuais com tipo/ID, dedupe por fonte e limites definidos; descartar candidato sem provenance válida.
- [x] **T003 — Resposta fundamentada**: usar o modelo já configurado por SPEC-002, separar fatos exatos de descoberta e não afirmar fatos sem evidência.
- [x] **T004 — Segurança de conteúdo**: tratar registro como dado não confiável; cobrir tentativa de prompt injection e ausência de autorização.
- [x] **T005 — Testes Node**: cobrir rotas, empty/ambiguous/access disabled/unavailable e suporte a citações com doubles.
- [x] **T006 — Teste Supabase**: validar busca de ponta a ponta pelo cliente Supabase/PostgREST existente, com fixtures sintéticas, preflight, IDs e rollback/limpeza.
- [x] **T007 — Gates do projeto**: executar testes focais, lint e build; registrar comandos/resultados verdadeiros.
- [x] **T008 — Auditoria final**: confirmar uma fonte de dados Supabase, SPEC-004 para fatos exatos, SPEC-008 para busca, modelo existente, sem vector/provider/segundo banco e evidência completa.

## Critério de conclusão
Cada história tem testes/evidências; indisponibilidade não é confundida com vazio; nenhuma escrita ou ampliação de acesso foi introduzida; os gates do lote passam. Não exigir Docker, PostgreSQL local ou conexão direta de Node.
