# Validação e operação — SPEC-003@3

## Escopo e disponibilidade

Este guia descreve a validação interna de histórico conversacional, checkpoints e exclusão. A implementação não está disponível ao usuário final: DEC-001 continua fechada e impede toda operação privada antes de acessar repositório, checkpoint, ledger ou handler. Nenhuma transcrição real foi enviada a provedor externo; DEC-006 e a política global DEC-005 permanecem pendentes fora do escopo desta SPEC.

A retenção aplicada aqui é apenas `dec005-spec003-v1`: histórico de até 365 dias desde atividade válida, checkpoint de até 30 dias e resumos vinculados à conversa. O armazenamento não é memória semântica entre conversas.

## Ambiente e banco

- Runtime: Node.js 24 ESM; dependências fixadas em `package-lock.json`, incluindo `@langchain/langgraph-checkpoint-postgres@1.1.2` e `pg@8.23.1`.
- Projeto de desenvolvimento validado: `flowzenithv2`, ref `twikxeloeftczwbpjvzr`, PostgreSQL 17.11.0.003.
- Migration aditiva: `supabase/migrations/20261029204848_spec003_conversation_memory.sql`, aplicada ao schema privado `conversation_private` no projeto acima.
- RLS está habilitado sem políticas abertas; `anon`, `authenticated` e `service_role` não têm acesso ao schema privado. Não foi alterado o schema `sdd` nem grants/RLS do produto.
- O setup do PostgresSaver é feito pela migration. Não executar setup de tabelas durante inicialização de uma Function.

Antes de qualquer teste que grave no banco, confirmar project ref, schema, permissões e ausência do marcador sintético exclusivo. Usar apenas `conversation_private` e dados sintéticos. Preferir rollback; quando o teste confirmar, remover somente IDs capturados em ordem de dependência e verificar zero resíduos. Não usar `TRUNCATE`, `DELETE` sem filtro, reset, API do agente ou linhas preexistentes do produto. Os IDs e as contagens das fixtures deste run estão registrados no SDD.

## Comandos e evidências desta execução

| Comando | Resultado |
| --- | --- |
| `npm test` | exit 0; 235 aprovados, 0 falhos e 2 ignorados. O teste Node com conexão PostgreSQL real requer `CONVERSATION_TEST_DATABASE_URL`; o contrato de banco correspondente foi validado pelo SQL MCP. O contrato opcional da SPEC-004 não foi habilitado nesta execução. |
| `rtk proxy npm run lint` | exit 0; o wrapper RTK normal retornou erro de parsing sem diagnóstico do linter, então foi repetido pelo proxy previsto em `C:\Users\julio\.codex\RTK.md`. |
| `npm run build` | exit 0; Vite transformou 165 módulos e gerou o bundle do cliente. |
| `node --test tests/security/conversation/server-boundary.test.js` | exit 0; 4/4 aprovados, incluindo DEC-001 sem chamadas privadas e exclusão dos módulos server-only do bundle Vite. |
| `node --test tests/unit/conversation/checkpoint-resume-adapter.test.js` | exit 0; 3/3 aprovados, incluindo o adapter PostgresSaver com namespace e parent checkpoint exatos. |
| `node --test tests/contracts/conversation/lifecycle.test.js` | exit 0; 11/11 aprovados. |
| `node --test tests/security/conversation/maintenance-target.test.js` | exit 0; 6/6 aprovados. |
| `node --test tests/integration/conversation/deletion-recovery.test.js` | exit 0; 1/1 aprovado. |
| `node scripts/conversation-maintenance.js --help` | exit 0; confirma execução manual e ausência de scheduler. |

O teste `tests/integration/conversation/postgres-adapter.test.js` foi executado e ficou `SKIPPED` porque não há `CONVERSATION_TEST_DATABASE_URL` verificada no checkout; esse skip não foi contado como aprovação. A prova PostgreSQL real foi executada pelo SQL MCP privilegiado no projeto fixado: migration, schema/ACL, versões 0–5 do PostgresSaver, constraints, transações sintéticas e limpeza exata. Os registros SDD detalham o resultado de cada teste e fixture.

## Manutenção manual de expiração

Não há scheduler ou worker de produção verificado. Expiração é checada ao ler histórico e a limpeza física é executada por operador via rotina manual. A limpeza não é periódica por si só.

Uso da rotina:

```powershell
node scripts/conversation-maintenance.js `
  --project-ref twikxeloeftczwbpjvzr `
  --confirm-project twikxeloeftczwbpjvzr `
  --batch-size 25
```

A rotina exige `SUPABASE_URL` e `CONVERSATION_DATABASE_URL` server-only, valida host/projeto e usuário antes de iniciar a limpeza, usa lotes de 1 a 100 e relata somente agregados. A conexão `CONVERSATION_DATABASE_URL` não está configurada/verificada neste checkout; por isso a rotina não deve ser executada a partir dele até que exista uma conexão de administração autorizada para o projeto exato. Não passar credenciais privilegiadas ao navegador.

## Limitações operacionais

- DEC-001 permanece fechada: sem leitura ou gravação privada, endpoint de histórico ou exportação, e sem feature disponível ao usuário final.
- Não há autenticação nova, compartilhamento, mutações do agente, persistência de conversa para requests de usuário ou memória semântica cross-thread.
- Não há scheduler/worker validado nem garantia de expurgo periódico.
- O teste Node que exige uma conexão PostgreSQL direta não foi executado; a integração de banco desta SPEC foi verificada por SQL MCP no projeto de desenvolvimento e por testes de adapter com doubles.
- Não realizar commit, push, merge, deploy ou reset do checkout.
