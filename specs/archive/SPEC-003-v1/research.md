# Pesquisa técnica — SPEC-003 histórico, memória e checkpoints

**Estado:** pesquisa documental Draft. Nenhuma persistência, retenção, conexão, schema, grant, package ou provedor foi escolhido ou ativado.

## Baseline do checkout

- `package.json` declara React/Vite, Supabase JS e testes Node; não contém `@langchain/langgraph`, checkpointer, API de produto ou pacote de persistência conversacional. `src/` não contém histórico/chat. `src/lib/supabase.js` é cliente do browser.
- As migrations de produto definem `public.demandas` e `public.recorrente`, não mensagens. Não há conversas, `thread_id` de agente ou memória em migrations do produto.
- `supabase/migrations/20261028103332_sdd_governance_core.sql` cria `sdd.checkpoints` e `sdd.audit_events` para manifests, runs, tarefas e auditoria do supervisor. Essa área operacional pertence ao SDD; não é store de agente nem pode guardar conversas.
- O baseline do produto mantém passkey apenas no browser, sem identidade server-side. DEC-001 mantém o acesso atual, mas bloqueia novas leituras privadas/ações até controle adequado ser aprovado, implementado e verificado.
- SPEC-002 define `CheckpointPort.load(threadId)`/`save(threadId, graphVersion, checkpoint)` e `ExecutionLedger` como portas; storage e retenção pertencem a SPEC-003/DEC-005. A assinatura nominal não declara state-schema version ou turn correlation como parâmetros; o contrato desta SPEC os exige dentro do metadata/envelope serializado e requer teste de integração, sem alterar o ownership de SPEC-002.
- A suíte atual contém `tests/dailyTimeline.test.js` e `tests/sddctl.test.js`; não encontrei testes de transcript, checkpointer LangGraph, paginação, retenção ou deleção conversacional.

## LangGraph: persistência e memória

O material oficial atual distingue checkpointers (snapshots de estado por thread) de stores (dados arbitrários compartilhados entre threads). Checkpointer sustenta continuidade/interrupção/fault tolerance; Store é caminho de memória durável cross-thread. Esta SPEC usa o primeiro como candidato técnico e deixa o segundo desativado porque memória semântica persistente está fora do escopo. Consulte [LangGraph persistence JS](https://docs.langchain.com/oss/javascript/langgraph/persistence), [checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers), [stores](https://docs.langchain.com/oss/javascript/langgraph/stores) e [memory overview](https://docs.langchain.com/oss/javascript/concepts/memory).

A documentação explica que checkpoint é criado em fronteiras de superstep e que pending writes de nós já concluídos podem ser recuperados sem reexecutá-los em certas falhas. Resume/replay de um checkpoint pode executar novamente nós posteriores; portanto, histórico/checkpoint não garantem idempotência de side effect. SPEC-002 ExecutionLedger continua a autoridade para outcomes de tools: só retomar operação com evidência durável; ledger ambíguo bloqueia o handler.

### Checkpointer Postgres candidato

O README oficial de [`@langchain/langgraph-checkpoint-postgres`](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint-postgres/README.md) documenta `PostgresSaver`, `setup()` inicial e opção de `schema` (default `public`). A instalação do pacote e o setup criam schema/DDL e estão fora deste trabalho. Recomendação para avaliação futura: testar a versão compatível com o LangGraph em database isolado e schema privado explicitamente configurado; rever/registrar migrations e upgrades em lote SDD aprovado. Nunca executar `setup()` automaticamente em toda inicialização de endpoint. Não reutilizar `sdd.checkpoints`.

O mesmo README informa dependência de `node-postgres`/TCP em runtime Node. Vercel Node Function, pooler Supabase, região, conexão persistente e lifespan do runtime dependem de DEC-010 e teste de integração; nenhum é selecionado aqui. `MemorySaver` fica restrito a teste porque não persiste após restart. O checkpointer Postgres e as conversas são candidatos de armazenamento, não autorização: precisam de role/credencial de runtime aprovada e gate DEC-001 antes de private access.

### Cópia de conteúdo e separação

LangGraph state pode incluir mensagem e outros dados que nós precisam, enquanto uma tabela de conversa guardaria transcript visível. Se o graph mantém mensagens, os dados podem existir em ambos os stores. Isso não torna checkpoint igual ao histórico: cada artefato tem purpose, schema, query e acesso distintos. O desenho limita graph state a contexto necessário para retomar um turno e nunca usa `getState()` como endpoint de transcript. Nenhum checkpoint ou tool payload vai para audit genérico.

Histórico tem mensagens user, resposta final assistant e, se necessário para exibição, somente resumo allowlisted de tool. Calls intermediárias, state interno, prompt, reasoning e resultado bruto ficam fora da resposta. Context summary é derivado por conversa com cursor/version, não memória semântica cross-thread. Os transcript messages canônicos permanecem intactos para pagination/deleção e se houver orçamento permite reconstruir contexto. O uso de resumo de conversa enviado a modelo está bloqueado por DEC-006; fixtures usam doubles.

## Data lifecycle e segurança

- DEC-005 define retenção, exclusão, exportação e compartilhamento; não escolher TTL, grace period, legal tombstone ou purge window. Enquanto pendente, produção não persiste conversation/checkpoint/summary.
- DEC-006 define campos que podem sair a provedores, redaction, opt-out e localização. Nenhuma transcrição real pode alimentar summarization, DeepSeek, Gemini ou LangSmith antes dessa decisão.
- DEC-001 bloqueia endpoints privados. Thread ID, cursor e idempotency key são referências de dados/execução, não credenciais. Não usar passkey local, anon grants ou service_role como owner authorization.
- Dados de domínio são reconsultados por SPEC-004 e mudanças por SPEC-006/007. Memória resumida/checkpoint não é fonte de verdade para status, hora ou data.
- Auditoria persistente continua sob SPEC-010. Eventos mínimos de execução podem conter correlation/turn/thread hash, operação e outcome categorizados somente se DEC-005/010 autorizarem; não transcript nem checkpoint payload.

## Proposta técnica e alternativas

1. **Histórico relacional próprio (proposta):** conversas e mensagens em estrutura aditiva e isolada; cursor monotônico por conversa; usado pela paginação e pelo ContextBuilder. Isso mantém o transcript canônico independente do formato interno do LangGraph.
2. **LangGraph PostgresSaver (candidato):** usa suas tabelas/schemas internos para checkpoints e pending writes, via porta SPEC-002. Validar schema selection, driver, migrations, connection pooling, JSONB/serialization, upgrade e pruning; não compor a tabela de mensagem dentro do formato interno do package.
3. **LangGraph Store cross-thread:** descartado para esta SPEC porque o requisito exclui memória semântica persistente entre conversas. Não instanciar `PostgresStore` nem indexar conteúdo.
4. **MemorySaver:** apenas teste determinístico; não prova restart, isolamento concorrente ou persistência.
5. **Checkpointer custom:** alternativa somente se `PostgresSaver` não se integrar com os limites de runtime/schema. Requer implementar interface completa (`put`, `putWrites`, `getTuple`, `list`) e rodar suite de conformance; não é caminho preferido sem evidência.

## Pendências

| Decisão | Mantida pendente | Capacidade bloqueada |
|---|---|---|
| DEC-001 | mecanismo separado de acesso adequado | endpoint/private history/checkpoint. |
| DEC-005 | retention, exclusão, export, compartilhar, grace period e tombstone | persistência de produção e TTL/pruning. |
| DEC-006 | provedor/fields/redaction/location | resumir/enviar transcript real a qualquer provedor/trace externo. |
| DEC-010 | runtime, região, pool, worker e lifecycle deployment | escolha do driver/checkpointer/cleanup runtime. |
| DEC-011/012, SPEC-002 | modelo/context window e limites de chamadas/contexto | valor numérico de contexto, compactação real e cap de payload. |

O planejamento documental pode detalhar contratos e cenários sintéticos sem fechar essas decisões. Nenhum teste foi executado nem banco remoto consultado.
