# Evidências de aceitação — SPEC-003@4

**Lote**: `e52e1b23-e9d9-49ec-bb06-c2438a1fe7f8`
**Manifesto**: `d792b4cf5f48ea52d636561f8259cb52c040827bf9d299e493d4f9eba65f56e9`
**Snapshot**: `859895764ca7898123bdee6c0a19ccceff8446762e74fcb68a05970704b1b8b4`
**Estado**: evidências T001–T005 registradas; T006 e conclusão da SPEC pendentes.

## Evidência Node

| Verificação | Resultado observado | Distinção |
| --- | --- | --- |
| Contratos direcionados Node/LangGraph | `node --test` nos testes de `tests/unit/conversation/`, `tests/contracts/conversation/`, integração com doubles e segurança server boundary: exit 0; 92 pass, 0 fail, 0 skip | Adapter PostgresSaver exercitado com doubles determinísticos; não é conexão remota |
| Suite | `npm test`: exit 0; 357 testes, 355 pass, 0 fail, 2 skipped | O gate do comando passou; os 2 testes skipped continuam NOT VERIFIED |
| Lint | `rtk proxy npm run lint`: exit 0 | PASS |
| Build | `npm run build`: exit 0; 165 módulos transformados | PASS |
| Bundle/server boundary | Incluído nos testes direcionados e na suíte: DEC-001 bloqueia chamadas privadas; módulos server-only não aparecem no bundle cliente | PASS nas verificações executadas |

### Skips observados

1. `tests/integration/conversation/postgres-adapter.test.js`: `CONVERSATION_TEST_DATABASE_URL` ausente. A conexão Node `pg` ao banco Supabase não foi exercitada; **NOT REQUIRED / NOT VERIFIED**.
2. `tests/contracts/domain-read/bigint-projection.test.js`: `RUN_SPEC004_SUPABASE_CONTRACT` ausente. Teste remoto de SPEC-004 fora do escopo deste lote; não foi habilitado.

## Evidência Supabase SQL MCP

Alvo selecionado: projeto `flowzenithv2`, ref `twikxeloeftczwbpjvzr`; estado ACTIVE_HEALTHY; banco `postgres`, servidor PostgreSQL `17.11.0.003`, role da sessão SQL `postgres`.

| Verificação | Resultado |
| --- | --- |
| Schema e tabelas | `conversation_private` existe; 10 tabelas esperadas; checkpointer registra versões 0, 1, 2, 3, 4 e 5 |
| ACL/RLS | RLS habilitado nas 10 tabelas; 0 policies; nenhum grant de schema ou tabela para PUBLIC, anon, authenticated ou service_role |
| Preflight da fixture | UUID e marcador exclusivos sem linhas preexistentes em conversa, mensagens, reservations, checkpoints, blobs, writes, envelopes, summaries ou deletion metadata |
| Constraints | Violações sintéticas de sequência duplicada, role inválida, retenção e expiração do checkpoint foram rejeitadas; envelope válido foi aceito |
| Cascade e rollback | Cascade removeu todos os artefatos de conteúdo e manteve apenas metadata de exclusão dentro da transação; `ROLLBACK` removeu toda a fixture; consulta posterior encontrou zero linhas em todas as tabelas verificadas |

A transação foi executada apenas contra `conversation_private`. Nenhuma migration, grant, RLS, configuração de produção ou endpoint foi alterado. A sessão SQL não expôs a lista configurada de schemas do PostgREST; por isso a tabela acima não declara esse item como observado. Os grants negados foram confirmados diretamente.

## Estado por critério e gates

| Critério/gate | Estado desta coleta | Evidência |
| --- | --- | --- |
| FR-001–FR-017 | Evidência de código/testes coletada; aguardando parecer T006 por requisito | T001 + testes direcionados, suite e SQL MCP |
| SC-001–SC-007 | Evidência coletada; aguardando parecer T006 por critério | Testes direcionados, suite e SQL MCP |
| Node adapter/LangGraph com doubles | PASS | Gate SDD `node_contracts`; 92 pass |
| Schema, ACL/RLS, constraints, transação e cleanup Supabase | PASS | Gate SDD `supabase_postgres_contract`; preflight e rollback |
| Suite `npm test` | PASS com 2 skipped explicitamente NOT VERIFIED | Gate SDD `full_test_suite`; 355 pass, 0 fail, 2 skipped |
| Lint | PASS | Gate SDD `lint`; exit 0 |
| Build | PASS | Gate SDD `production_build`; exit 0 |
| Integração direta Node `pg` → Postgres Supabase | NOT REQUIRED / NOT VERIFIED | Gate opcional `node_pg_remote` SKIPPED |
| Auditoria independente final | PENDENTE | T006 ainda não executada |

Os gates só representam os comandos e consultas executados neste run. Nenhum resultado foi copiado da SPEC-003@3.

