# Validação e operação — SPEC-003@4

**Lote**: `e52e1b23-e9d9-49ec-bb06-c2438a1fe7f8`
**Manifesto**: `d792b4cf5f48ea52d636561f8259cb52c040827bf9d299e493d4f9eba65f56e9`
**Snapshot**: `859895764ca7898123bdee6c0a19ccceff8446762e74fcb68a05970704b1b8b4`
**Estado documentado**: tarefas T001–T005 concluídas; auditoria independente T006 pendente.

## Escopo da POC

- Único banco: Supabase PostgreSQL de desenvolvimento `flowzenithv2`, projeto `twikxeloeftczwbpjvzr`, PostgreSQL 17.11.
- Sem Docker, PostgreSQL local, branch de banco ou teste de conexão TCP do Node.
- DEC-001 continua fechado; nenhum endpoint privado nem persistência de conversa real foi habilitado.
- Testes Node com doubles validam contratos do adapter/LangGraph. SQL MCP valida o PostgreSQL real; uma evidência não substitui a outra.

## Resultados observados neste run

- Os testes Node/LangGraph direcionados passaram: **92 testes, 0 falhas, 0 skips**. Incluíram o adapter de checkpoint com doubles, lifecycle, exclusão/recuperação, redaction, cursores e server boundary.
- `npm test`: exit code **0**, 357 testes, 355 aprovados, 0 falhas e 2 skips.
- `rtk proxy npm run lint`: exit code **0**.
- `npm run build`: exit code **0**, 165 módulos transformados.
- Supabase SQL MCP: schema `conversation_private` presente com 10 tabelas; as 10 têm RLS habilitado e nenhuma policy. Não foram encontrados grants de schema/tabela para PUBLIC, anon, authenticated ou service_role. As versões do checkpointer no banco são 0–5.
- A transação SQL sintética testou constraints de sequência, role e retenção, limite de expiração do envelope, inserção válida, cascade de artefatos e rollback. A consulta posterior encontrou zero fixture ou resíduo.
- A lista de schemas expostos do PostgREST não foi disponibilizada pela sessão SQL; não afirmar que essa configuração foi lida. O schema e as tabelas não concedem acesso aos roles de aplicação examinados.

## Skips e limites

- `tests/integration/conversation/postgres-adapter.test.js`: skip porque `CONVERSATION_TEST_DATABASE_URL` não foi configurada. A conexão direta Node `pg` → Supabase permanece **NOT REQUIRED / NOT VERIFIED** nesta POC.
- `tests/contracts/domain-read/bigint-projection.test.js`: skip porque `RUN_SPEC004_SUPABASE_CONTRACT` não foi configurada; esse teste remoto pertence a SPEC-004 e não foi habilitado por este lote.
- Os skips não contam como passes. Nenhuma fixture persistiu após o rollback.
- A auditoria independente de critérios FR/SC e estado SDD ainda será feita na T006.
