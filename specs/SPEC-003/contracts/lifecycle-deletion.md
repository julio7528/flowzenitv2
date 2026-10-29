# Contrato de ciclo de vida e exclusão — SPEC-003

**Estado:** lifecycle para revisão; DEC-005 continua `PENDING`. Este documento não seleciona prazo, retention, exportação, sharing, tombstone ou grace period.

## Lifecycle proposto

`active -> deleting -> deleted` é uma proposta de estado interno. Conversa marcada `deleting` bloqueia turn novo e history retrieval imediatamente. Um turno ativo recebe cancelamento; sua escrita/outcome é reconciliada pelo ExecutionLedger. Depois do terminal state, remover artifacts da política aprovada: transcript, checkpoints, pending writes, context summaries, derivados/cache/indexes que existirem. Se persistir tombstone, ele é mínimo e explicitamente permitido pela DEC-005. `deleted` não tem conteúdo acessível.

## Retenção e expiração

`expiresAt`/TTL só pode ser calculado após a versão aprovada da DEC-005. Worker/cron e região dependem de DEC-010. Antes da política, não iniciar produção nem inventar “ilimitado”, data padrão ou cron de limpeza. Testes usam uma política fixture sintética, identificada como fixture.

## Falhas

- Erro ao bloquear a conversa: não afirmar exclusão concluída; deixar retrieval/append fail-closed até reconciliar estado.
- Interrupção em `deleting`: retry idempotente por request/deletion ID; consultar ledger/status para não duplicar side effects.
- Partial delete: manter `deleting`, proibir retorno de artifacts e continuar cleanup delimitado; não marcar `deleted` enquanto uma categoria recuperável permanecer.
- Retenção conflitante com audit: evento de auditoria só preserva campos mínimos aprovados; SPEC-003 não manda apagar/retêr audit contra DEC-005/SPEC-010.

## Isolamento de categorias

Excluir transcript também apaga context summaries associados. Remoção do checkpoint não altera transcript que o usuário ainda pode ver segundo policy. Long-term semantic memory não existe nesta SPEC. Dados de domínio são preservados porque pertencem à aplicação, não à conversa; uma conversa não cria nem apaga demanda/tarefa.
