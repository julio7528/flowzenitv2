# Quickstart de validação futura — SPEC-008

**Draft, sem execução:** este guia documenta a sequência de validação quando SPEC-008 estiver incluída em lote SDD exatamente aprovado. Não habilita o worker, Supabase, extensão pgvector ou Gemini. Nesta tarefa nenhum comando abaixo foi executado.

## Gates antes de qualquer dado real

1. Confirmar SPEC-001 access-control gate aprovado, implementado e verificado.
2. Resolver DEC-006 (allowlist, redaction, localização e provider handling) e DEC-007 (conteúdo, representação, rotina e ganho semântico).
3. Resolver DEC-010 (runtime/worker/outbox/connection/timeouts) e DEC-011 (modelo/versionamento/dimensão/migração); DEC-012 informa contenção de chamadas.
4. Usar lote SDD que inclua SPEC-008 e seja aprovado explicitamente. Planning Draft ou este quickstart não autorizam implementação.
5. Confirmar em ambiente isolado, sem tocar no projeto remoto, que versão de pgvector e índice/tipo suportam a dimensão escolhida. Não inferir isso de `[storage.vector]` em `config.toml`.

## Validação local inicial com dados sintéticos

1. Criar fixtures artificiais para demanda, tarefa, subtarefa, rotina-template opcional, parent rename/move, status, agenda e deletes em cascade.
2. Injetar `FakeEmbeddingProvider`; fixar dimensão em fixture e nunca configurar Gemini real.
3. Testar serialização do evento com source reference e comprovar ausência de texto, segredo, prompt e vetor na fila.
4. Em database isolado, testar commit/rollback de source + outbox, duplicação/reordenação, concorrência, lease, retry, DLQ, delete/tombstone e backfill retomável.
5. Provar zero fake-provider calls para metadata-only `status`/data/hora; mudança do canonical input atualiza exatamente chunks dependentes do template. Provar que ancestor change atualiza descendentes quando ancestor text integra a representação.
6. Verificar vector length/model version/type e falhar dimensão incompatível antes da gravação. Verificar que o índice antigo e novo não são comparados durante migração.
7. Conferir source freshness no lado de leitura: fonte ausente, stale ou inelegível nunca produz candidato retornável, mesmo com fila atrasada.
8. Revisar grants, schema não exposto, RLS, trigger/function, segredo server-side e payload de saída; sem mecanismo de acesso adequado, produção privada continua fechada.

## Gates de qualidade do repositório

Depois da implementação autorizada e com paths de teste adicionados ao projeto:

```powershell
npm test
npm run lint
npm run build
```

Os testes PostgreSQL devem usar projeto/database isolado e fixtures sintéticas. `npm run test:sdd-db` é smoke do control plane SDD, não teste do indexer, e não substitui os testes específicos. Registrar comandos, código de saída e evidência real; não considerar provider fake como validação de compatibilidade Gemini.

## Provider real e operação

Este quickstart não inclui request/cURL/SDK Gemini nem dados reais. Um smoke de provider só pode ser criado numa revisão futura, depois dos gates acima, com opt-in explícito, dados sintéticos, orçamento/controles de DEC-012, segredo no runtime aprovado e payload revisado. Monitorar lag, backlog, dead-letter, divergência e geração ativa sem registrar conteúdo, request body, embedding ou credencial.
