# Validação futura — SPEC-003

Roteiro para a implementação autorizada futuramente. Nada foi persistido/executado no planejamento. Até DEC-001, DEC-005 e DEC-006 serem satisfeitas, usar apenas doubles e banco de teste isolado com dados sintéticos; sem endpoints privados, LangSmith ou provedor real.

## Pré-condições futuras

- SPEC-001/002 compatíveis; runtime/checkpointer e adapter selecionados sob DEC-010.
- DEC-001 control de acesso aprovado, implementado e verificado para any private endpoint.
- DEC-005 policy version aprovada para retention/deletion/export/share; DEC-006 aprovada antes de qualquer summary/provider content.
- Database test local/isolation tag não produtivo; nenhuma tabela `sdd` reutilizada.
- Fixed clock, synthetic conversation IDs, deterministic graph/model/tool doubles e fake ledger.

## Cenários de verificação

1. `npm test`: histórico vazio retorna outcome explícito; IDs malformados/desconhecidos retornam categorias estáveis sem stack/data.
2. Inserir mensagens sintéticas com mesmo timestamp e concorrência; verificar sequência monotônica e páginas estáveis pelo snapshot cursor, sem gap/duplicação ao inserir novas mensagens após primeira página.
3. Repetir o mesmo request/turn idempotency key; verificar no máximo uma mensagem user/final assistant visível e uma chamada de cada tool concluída.
4. Rodar duas mensagens concorrentes para mesmo conversation ID; validar o comportamento configurado `serialized` ou `TURN_IN_PROGRESS` sem sequência duplicada e sem context cross-contamination. IDs distintos não compartilham conteúdo.
5. Simular checkpoint absent, malformed JSON, digest mismatch, graph/state/serializer version mismatch e expiry fixture; assegurar zero tool invocations.
6. Checkpoint com tool ledger `completed`: resultado anterior sem side effect; `not_started`: só retomar de checkpoint seguro; `started/uncertain/missing`: negar ferramenta até reconciliação.
7. Interromper provider/node e cancelar request; terminal state não é `completed` sem ledger/outcome. Retry do request não duplica mensagem nem repete ferramenta completa.
8. Testar context builder com budget artificial pequeno; preserva limites, `throughMessageSeq`/coverage corretos, histórico canônico byte-for-byte unchanged e domain facts typed (não summary) para consultas exatas.
9. Summary stale após nova mensagem ou mudança de versão é ignorado/regenerado via stub; confirmar que summary não atravessa conversa nem aparece como transcript/tool permission.
10. Exclusão sob policy fixture sintética: apagar transcript, checkpoints, summaries e cache; uma execução ativa é cancelada/reconciliada; tentativas concorrentes são idempotentes; `deleting` não retorna conteúdo.
11. Security sentinel: DEC-001 closed produz zero repository/checkpointer calls; nenhum ID/cursor autentica; transcript/checkpoint/tool args não aparecem em log, audit, trace, browser bundle ou error response.
12. Executar `npm test`, `npm run lint`, `npm run build` e teste de DB LangGraph isolado; registrar commands, exit codes e evidência redacted. Checks não executados ficam `NOT VERIFIED`.

Este guia não aprova política DEC-005/006, retention values, model/provider, checkpointer package/version, schema/grant, runtime/region ou lifecycle worker.
