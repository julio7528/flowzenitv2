# Contrato de outbox e worker — SPEC-008

**Estado**: proposta Draft. Transporte, scheduler, runtime, schema e DDL não escolhidos (DEC-010); não alterar banco nesta fase.

## Producer e atomicidade

```text
Source transaction:
  mutate source row
  append OutboxEvent(sourceType, sourceId, operation, eventId)
  commit both together or roll both back
```

O produtor captura insert/update/delete nas tabelas elegíveis sem depender de um componente de UI específico. Como o app atual escreve diretamente via cliente Supabase, uma trigger outbox é candidata; mudar todas as gravações para um serviço é outra arquitetura e exige revisão própria. A escolha do mecanismo de privilégios da trigger não está aprovada. Não conceder acesso ao browser em outbox/índice, não adicionar função privilegiada sem revisão de segurança e não abrir endpoint antes do gate DEC-001. Se não for possível obter atomicidade sem ampliar acesso, a indexação permanece desligada até decisão.

Rollback da transação source remove também o evento. Evento não contém conteúdo do registro, vetor, prompt ou segredo. IDs e categorias em logs permanecem minimizados e sujeitos a política de observabilidade.

## Consumer lifecycle

```text
claim(event) -> reread current source -> validate gate/policy -> canonicalize
  -> skip | refresh metadata | request embedding -> revalidate source
  -> upsert generation | tombstone -> ack
```

- Claim/lease evita dois workers mutarem o mesmo `(sourceRef, generation)` ao mesmo tempo. A fila continua tolerante a entrega duplicada.
- `eventId` e fingerprint tornam o replay idempotente. Event order/timestamp é informativo: worker rereads current source and never trusts old payload as version.
- Superseded event pode ack sem provider se um evento novo já atualizou fingerprint; também pode recalcular para o snapshot mais recente. Não criar duas versões ativas.
- Mudança de metadata apenas atualiza projection se o fingerprint de texto permaneceu igual; provider não é chamado.
- Remoção, cascata ou perda de elegibilidade marca chunk anterior indisponível. Source validation/query-side join bloqueia candidato stale antes da conclusão assíncrona do tombstone.
- Após request de embedding, fazer nova leitura da fonte; se o canonical fingerprint mudou no voo, descartar vetor e agendar leitura atual, sem persistir resultado obsoleto.

## Retry e dead-letter

| Falha | Próxima ação |
|---|---|
| Provider timeout/rate-limit/network transiente | Retentar com política bounded configurada depois de DEC-010/012; estado continua recuperável. |
| JSON/schema/modelo/dimensão inválida | Não persistir; código estável; requer corrigir configuração, sem retry cego. |
| Fonte mudou durante chamada | Descartar resposta; reler versão nova e produzir metadata/embedding se necessário. |
| Fonte deletada/inelegível | Tombstone/skip e ack após confirmar invalidação. |
| DB/queue indisponível ou commit incerto | Não alegar sucesso; releitura idempotente recupera pelo estado persistido. |
| Tentativas esgotadas | DLQ redigida, contador e categoria; replay manual/operacional somente depois da política aprovada. |

Contagem de tentativas, backoff, timeout, lease, retenção e alerta não têm números definidos nesta SPEC. Não existe orçamento financeiro aprovado. Logs/metrics não capturam body externo, conteúdo, vetor ou credencial.

## Concorrência, reindexação e backfill

- Serializar por fonte + generation e usar unique constraint conceitual para uma chunk ativa por origem/generation.
- Reprocessamento de fonte alterada faz compare-and-swap pelo `canonicalInputFingerprint` lido no preflight.
- Backfill paginado e retomável por chave estável; limites e execução dependem DEC-010/012. Escritas da fonte seguem fora da transação longa do provider.
- Nova geração de modelo/dimensão mantém espaço isolado. Backfill e teste na nova geração precedem um cutover único para retrieval; rollback repõe o ponteiro anterior sem mesclar vetores.
- Eventos para metadata de status/data/hora não disparam re-embedding se canonical text permaneceu igual.

## Métricas e segurança

Métricas candidatas: eventos pendentes e em DLQ por categoria, idade/lag, source-to-index drift, quantidade de skips, retry, dimensão/model mismatch, tombstone pendente, última leitura confirmada e geração ativa. Definição e limiares são DEC-010/012/DEC-007, não números desta proposta.

Antes de private indexing: gate DEC-001 aprovado/implementado/verificado, DEC-006/007/010/011 resolvidas e deployment/roles revisados. A chave Gemini é server-side somente; não compor com `VITE_*` e não tratar `service_role` como usuário autenticado. Provider tracing desligado até DEC-006 e SPEC-010.
