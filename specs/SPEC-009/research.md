# Pesquisa técnica — SPEC-009 busca híbrida e grounding

**Estado**: pesquisa documental Draft em 2026-10-28. Código e migrations locais foram examinados apenas por leitura. Nenhum teste, query de banco, acesso remoto Supabase, embedding ou chamada de modelo foi executado.

## Baseline local e dependências

- Não há `pgvector`, `vector`, `tsvector`, índice FTS, embeddings, RAG ou função de busca híbrida no código ou nas migrations de produto. `[storage.vector]` em `supabase/config.toml` refere-se a Vector Buckets do Storage, não confirma a extensão PostgreSQL.
- O texto atual é principalmente `public.demandas.demanda` e `public.recorrente.demanda`, nomes curtos. Não encontrei campos confirmados de descrição/comentário nem `updated_at`/revision. A hierarquia de `demandas` é `tipo` + `raizid`; rotina é template separado.
- As telas atuais escrevem diretamente pelo cliente browser. Migrations concedem certos acessos a `anon`; isso é o comportamento legado e não satisfaz o gate DEC-001 para um retriever privado novo.
- SPEC-004 já tem `getHierarchy`, `getItemById`, `searchItems`, `getDailySchedule`, `getWeeklyAllocation`, `getRoutineTemplates`; seu `searchItems.text` é substring literal proposta, não busca fuzzy. IDs bigint devem ser string decimal. O modelo não escolhe tabela, coluna, SQL ou expressão PostgREST.
- SPEC-008 planeja fonte/referência tipada, geração, `canonicalInputFingerprint`, fingerprint de metadata e revalidação da fonte. Não há revisão confiável no schema atual; não inferir frescor de `indexedAt` ou timestamp de evento.
- O roadmap torna SPEC-009 dependente de SPEC-002/004/005/008 e coloca-a depois da sincronização SPEC-008. Os artefatos de ambas permanecem Draft.

## PostgreSQL Full Text Search

Documentação oficial atual descreve `to_tsvector` para normalizar texto, `plainto_tsquery`, `phraseto_tsquery` e `websearch_to_tsquery` para texto de query; a forma web-search suporta texto comum, frases/OR/negação e não gera erros de sintaxe como `to_tsquery` com entrada malformada. Isso não substitui parameter binding nem autorização. Supabase demonstra GIN sobre `tsvector` armazenado/generated para acelerar busca e `ts_rank` para ordenação.

No corpus FlowZenit, o baseline lexical deve começar com nomes aprovados, não inventar descrição. A configuração de idioma (`portuguese` para pt-BR versus `simple` para siglas/nomes), tratamento de acentos, stop words e consulta de frase devem ser testados em fixture; não há resultado para escolher uma configuração em produção. A consulta usa `websearch_to_tsquery` ou outra parser tipada com limite de entrada; não usa SQL/tsquery grammar do LLM. FTS retorna candidatos lexicais, não fato exato transacional.

Fontes primárias: [Supabase Full Text Search](https://supabase.com/docs/guides/database/full-text-search), [PostgreSQL Text Search Controls](https://www.postgresql.org/docs/current/textsearch-controls.html), [PostgreSQL Text Search Indexes](https://www.postgresql.org/docs/current/textsearch-indexes.html).

## pgvector, filtros e frescor

- SPEC-008 determina a dimensão/type/index generation compatível. Query embedding precisa compartilhar o mesmo espaço do índice ativo. Nenhuma versão de pgvector real foi consultada.
- Supabase descreve HNSW e IVFFlat; filtros seletivos dentro do caminho ANN podem reduzir quantidade de resultados abaixo do limite. Iterative scans estão disponíveis a partir de pgvector 0.8.0 e têm modos diferentes. Versão/propriedades do projeto não foram verificadas; medição isolada deve decidir entre over-fetch, scan iterativo ou busca exata.
- A mesma lista tipada de filtros de entidade, hierarquia, período e atributos é aplicada a ambos os retrievers antes do texto ser devolvido. A consulta compara candidate sourceRef/fingerprint com linha fonte atual e remove apagados, stale, inelegíveis, geração antiga ou fora do scope.
- A inferência de status/data/hora nunca vem do vetor. Se pergunta exige valor exato, SPEC-004 reconsulta a fonte relacional. Uma data de filtro representa data civil em `America/Cuiaba`; não cria compromisso nem occurrence.

Fontes primárias: [Supabase vector indexes](https://supabase.com/docs/guides/ai/vector-indexes), [Supabase HNSW indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes), [pgvector README](https://github.com/pgvector/pgvector).

## RRF e ranking

Supabase demonstra juntar listas lexical e semântica com Reciprocal Rank Fusion. Para item `d`, rank `r` em cada lista e constante de suavização `k`, a pontuação é `Σ 1/(k+r)` nas listas onde aparece; ausência em canal contribui zero. Essa forma combina posições sem somar scores incomparáveis. `k`, limites de candidatos, pesos opcionais e desempate de negócio continuam parâmetros versionados e sem valores aprovados. Unit-weight RRF é baseline de comparação, não garantia de melhor resultado neste corpus.

O artigo original de Cormack/Clarke/Büttcher avaliou datasets TREC/LETOR e relatou ganhos de RRF naquele estudo; essa evidência histórica não prediz precisão dos títulos curtos do FlowZenit. Comparação local no conjunto sintético decide se RRF adiciona valor.

Fontes primárias: [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search), [Cormack et al., SIGIR 2009](https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf).

## Utilidade estimada para o domínio

**Inferência do inventário local, não resultado de avaliação:** hoje a consulta tende a buscar status, datas, horários e IDs de demandas/tarefas. Essas consultas já têm ferramentas estruturadas SPEC-004 mais corretas. FTS literal é adequada para localizar nomes; vetor poderia ajudar sinônimos/paráfrases e descobrir títulos que não compartilham palavras. Como registros parecem ter somente nomes curtos e sem detalhes, não há evidência atual de que embeddings ganhem o bastante para justificar enviar queries/texto a Gemini, manter worker/índices/generações e introduzir freshness failure modes.

Portanto, medir no dataset sintético: (a) structured exact tools; (b) lexical-only; (c) vector-only; (d) RRF. Incluir sinônimos de português, acentos, termos de domínio, erros, hierarquia, query sem match e item de título curto. Se resultados vetoriais/fusão não melhorarem descoberta semântica nem evitar misses relevantes, manter vector RAG desabilitado e usar tools estruturadas/FTS. Não criar limiar adicional ao aprovado na SPEC sem decisão.

## Segurança, gates e contradições documentais

- DEC-001 não requer nova autenticação/principal, mas bloqueia endpoint privado até o gate de acesso adequado. Typed scope, RLS/grants existentes e passkey browser não são autorização. SPEC-009 foi esclarecida para evitar leitura de “sem principal” como permissão para ler dados privados.
- DEC-006 impede enviar query ou item privado ao provider/tracing sem allowlist, redaction, localização e tratamento aprovados. Query user prompt também pode conter conteúdo privado.
- DEC-007 decide elegibilidade/textos, aliases, rotina e valor de corpus; DEC-011 modelo/embedding generation; DEC-010 runtime; DEC-012 contenção de chamadas. SPEC-008 precisa passar sync/freshness/generation gates.
- A linha per-SPEC de SPEC-009 no registro central lista DEC-006/007/011 e SPEC-008; DEC-010 e DEC-012 são dependências transversais já pendentes para runtime/provider/limite de chamada. A regra explícita da SPEC-009 de exigir DEC-010/012 é aplicação dos registros gerais dessas decisões, não uma mudança de status ou decisão nova.
- Retrieval outputs não aprovam writes. Conteúdo retornado permanece dado não confiável por SPEC-005; prompt injection não pode alterar instruções, ferramenta, SQL ou gate.

## Limitações de pesquisa

Fontes externas consultadas apenas em documentação técnica oficial/artigo original. Não foram consultados estado remoto, versão Supabase/pgvector instalado, dataset real, Gemini pricing/usage, logs, nem índice existente. Parâmetros e decisões permanecem sujeitos a revisão antes da implementação.
