# Quickstart de validação futura — SPEC-009

**Draft, sem execução:** este documento define a sequência futura de avaliação. Não cria API, query Supabase, geração de embedding, migration ou chamada de modelo. Nenhum passo abaixo foi executado agora.

## Pré-requisitos para implementação/ativação

1. Lote SDD exato que contenha SPEC-009 explicitamente aprovado; Draft não autoriza implementação.
2. SPEC-001 access-control gate aprovado, implementado e verificado para leitura de dados privados.
3. DEC-006 disclosure/redaction/localização, DEC-007 allowlist/corpus, DEC-010 runtime, DEC-011 model/dimensions e DEC-012 contenção de calls aprovadas/resolvidas.
4. SPEC-008 sincronização/idempotência/freshness validadas em database isolado; extensão/vector generation verificada localmente conforme dimension.
5. SPEC-004 typed reads e SPEC-005 tool guardrails compatíveis com exact-query route e untrusted content.

## Suite sintética de primeiro uso

1. Criar corpus artificial com nomes de demanda, tarefa e subtarefa, hierarquia, rotina-template opcional, status/data para perguntas exatas, fontes stale/deleted e aliases em português.
2. Implementar `StructuredReadFake`, `LexicalRetrieverFake`, `VectorRetrieverFake` e `ModelFake`; nenhuma chamada Gemini/DeepSeek e nenhum registro real.
3. Testar roteamento: ID/status/count/date/hour/schedule → SPEC-004 fake; pergunta semântica → canais lexical/vector; misto → subperguntas separadas; ambíguo → clarify.
4. Testar os dois canais com mesmo typed scope, freshness e lifecycle; alterar parent, apagar source e atrasar outbox; candidato inválido deve ser retirado antes do contexto.
5. Calcular ranks determinísticos e testar dedupe, RRF, falta em um canal, desempate e generation incompatível. Não fixar `k`, candidate limit, peso ou threshold sem decisão.
6. Incluir casos com texto injetado, sem relevância, canal degradado, citation inventada e claim factual sem fonte. Conferir que texto é tratado como dado, sem SQL/ferramenta/policy change.
7. Rodar evaluation versionada lexical-only, vector-only, RRF e structured; registrar Recall@k/Recall@5, MRR, nDCG@k, exact-routing, no-result precision e citation coverage por classe. Só decidir habilitação depois de aprovação do baseline e resultados documentados.
8. Em banco de teste isolado, validar GIN/FTS, vector scope, filtros seletivos, fonte atual e versão realmente disponível. Não usar conexão ou dados de projeto Supabase remoto.

## Gates gerais após implementação autorizada

Com teste focal adicionado ao projeto e depois de lote autorizado:

```powershell
npm test
npm run lint
npm run build
```

Database/segurança/RAG evaluation são gates adicionais, não substituídos por estes comandos. `npm run test:sdd-db` cobre o control plane SDD, não prova comportamento de RAG.

## Habilitação externa

Este quickstart não inclui request de provider nem configuração de segredo. Qualquer smoke futuro necessita dos gates DEC-001/006/007/010/011/012, opt-in explícito, provider/runtime aprovados, dados sintéticos ou campos expressamente allowlisted, confirmação do payload e logging redigido. Query do usuário também é dado potencialmente privado. Se a avaliação não mostrar ganho suficiente, manter embeddings/RAG vetorial desligados.
