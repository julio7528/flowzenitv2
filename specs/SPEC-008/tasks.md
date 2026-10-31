# Tarefas — SPEC-008@2

**Status**: Draft. Executar somente em lote exato aprovado via sdd-run. Sem Docker, Postgres local, URL/cert Node, embeddings ou provider novo.

- [x] **T001 — Revisar fronteira**: confirmar que searchItems de SPEC-004 é a única busca e os campos/filtros são os aprovados.
- [x] **T002 — Integrar recuperação**: conectar o fluxo de RAG à ferramenta tipada atual; não adicionar SQL, repository ou busca duplicada.
- [x] **T003 — Validar proveniência**: preservar tipo, ID e hierarquia, validar erro/vazio e encaminhar somente resultados correntes.
- [x] **T004 — Testes Node**: cobrir uso da ferramenta, filtros, resultado vazio, erro e provenance com doubles.
- [x] **T005 — Teste Supabase**: usar fixtures sintéticas pela busca existente via cliente Supabase/PostgREST após preflight; testar texto, escape, update e delete; capturar IDs e limpar somente fixtures próprias.
- [x] **T006 — Gates do projeto**: executar testes focais, lint e build, registrar comandos e resultados verdadeiros.
- [x] **T007 — Auditoria final**: confirmar banco único, gate SPEC-001, SPEC-004 como busca e fatos exatos, sem schema novo/provider/vetor/worker e evidências completas.

## Critério de conclusão
Gates do lote passam; dados sintéticos são limpos; nenhuma mudança de schema, grants/RLS ou caminho de conexão independente foi adicionada. Conexão direta Node/Postgres não é gate.
