# Auditoria final — SPEC-009@2

**Lote:** `e52e1b23-e9d9-49ec-bb06-c2438a1fe7f8`  
**Manifest hash:** `d792b4cf5f48ea52d636561f8259cb52c040827bf9d299e493d4f9eba65f56e9`  
**Run:** `f4b4eb1a-d9fd-44b1-bf6b-40c6c5fae337`  
**Snapshot SPEC-009@2:** `55e30accdafb810ffc0cdfd118c153fbadb746af437b00b7005e778b2b75442f`

## Resultado

SPEC-009 conecta a descoberta lexical de SPEC-008 e as leituras exatas de SPEC-004 ao fluxo de resposta existente em SPEC-002. O grafo envia ao modelo uma instrução de roteamento fixa e somente mensagens tipadas; cada resultado chega como dado de recuperação não confiável. Busca lexical é compactada em evidência com tipo, ID, cadeia de pais e referência de citação. O gate de acesso atual continua precedendo o modelo e as ferramentas.

## Rastreabilidade

| Requisito | Evidência | Estado |
|---|---|---|
| FR-001–002: Supabase único; SPEC-008 para descoberta e SPEC-004 para fatos exatos | `searchItems` usa o repositório Supabase/PostgREST existente; ferramentas exatas permanecem no registro fixo SPEC-004; teste misto cobre chamadas separadas. | PASS |
| FR-003: entradas e resultados tipados, sem SQL ou identificador livre | Schemas estritos das seis ferramentas; `searchItems` passa por `validateSearchResult`; conteúdo do modelo não escolhe tabela, coluna ou operador. | PASS |
| FR-004: tipo, ID e proveniência antes da composição | `createSearchRetrievalContext` valida candidatos, deduplica por `kind:id`, limita contexto a 20 candidatos e nomes a 256 pontos de código, e expõe `sourceType`, `sourceId`, `parentChain` e `citationRef`. Proveniência inválida resulta em `unavailable` sem enviar candidatos ao modelo. | PASS |
| FR-005: fatos atuais com referências | O prompt do servidor exige somente fatos dos resultados atuais e cita tipo/ID. A resposta mantém resultados estruturados em `answer.evidence`; a prosa do modelo permanece marcada separadamente como `inference`, conforme o contrato existente. | PASS |
| FR-006: vazio, ambiguidade, acesso fechado e indisponibilidade distintos | Testes cobrem estado lexical `empty`, `ambiguous`, falha de ferramenta como `failed` e política padrão fechada antes do modelo. Contexto obsoleto ou inválido vira `unavailable`, nunca `empty`. | PASS |
| FR-007: dado recuperado não altera instruções ou acesso | `prepareReadToolPrompt` aplica segmento server-branded `retrieval` a todos os resultados de leitura. Teste injeta texto hostil sintético e confirma que ele permanece no campo de dado; o modelo recebe somente as seis ferramentas de leitura. | PASS |
| FR-008–010: sem banco auxiliar, escrita, ampliação de acesso ou provider novo | Revisão do grafo e dependências; registro das ferramentas continua read-only; modelo/provedor de SPEC-002 preservado. Nenhum Docker, `pg` direto, vector store, migration, grant ou policy foi adicionado. | PASS |
| FR-011: logs mínimos | Nenhuma nova chamada de log foi adicionada; mensagens e conteúdo recuperado não são incluídos em novos eventos operacionais. | PASS |
| SC-001: rotas exata, lexical, mista, clarificação e vazio | Testes Node com doubles cobrem consulta exata, busca, duas leituras mistas, ambiguidade/clarificação, vazio, erro e acesso fechado. | PASS |
| SC-002–003: fatos estruturados e citações de fonte | A resposta preserva `sourceRef` exato SPEC-004 e `citationRef` lexical de tipo/ID em `answer.evidence`; ranking textual não fornece status ou outro fato exato. | PASS |
| SC-004: injeção não altera ferramenta ou autorização | Teste de fluxo mantém o catálogo nos seis read tools; ferramentas de escrita não entram no registro; o gate fechado impede execução antes de chamada ao modelo. | PASS |
| SC-005: nenhuma dependência externa de embeddings | Revisão da SPEC, registro de ferramentas e dependências não encontrou vector, embedding, provider de busca ou banco auxiliar. | PASS |
| SC-006: erro distinto de busca vazia | Teste de integração Node distingue falha de dependência de `empty`; contexto com proveniência inválida/obsoleta retorna `unavailable`. | PASS |

## Verificações executadas

- `node --test tests/contracts/agent/turn-flow.test.js tests/contracts/agent/rag-grounding.test.js tests/contracts/domain-read/search.test.js tests/contracts/domain-read/ambiguity.test.js tests/unit/guardrails/untrusted-content.test.js tests/security/guardrails/indirect-injection.test.js` — exit 0; 32 passaram, 0 falharam, 0 ignorados.
- `$env:RUN_SPEC008_SUPABASE_CONTRACT='1'; node --test tests/integration/domain-read/spec008-supabase.test.js` — exit 0; 1 teste passou contra `flowzenithv2` (`twikxeloeftczwbpjvzr`) via Supabase/PostgREST existente.
- `rtk proxy npm run lint` — exit 0.
- `npm run build` — exit 0; 165 módulos transformados.
- Preflight de integração separado — exit 0; ref, projeção PostgREST, IDs e marcador foram verificados antes dos inserts.
- Nove IDs sintéticos e os três vínculos pai/filho foram registrados na evidência T006. Update e delete foram observados pela consulta seguinte; limpeza por IDs exatos confirmou zero registros e zero marcador restantes.
- `git diff --check` nos arquivos desta SPEC — exit 0.
- Hash local canônico dos nove documentos do snapshot confirmou `55e30accdafb810ffc0cdfd118c153fbadb746af437b00b7005e778b2b75442f` antes da execução.

## Limites da evidência

- Nenhum conteúdo privado foi enviado ao modelo; o fluxo de modelo foi validado com doubles conforme a versão aprovada. Nenhum provider real foi chamado.
- A integração validou SPEC-008/SPEC-004 pela biblioteca Supabase/PostgREST; conexão Node `pg` direta não é gate e não foi executada.
- O texto do modelo continua sendo inferência; as evidências/citações tipadas são retornadas separadamente. Não foi criado um verificador semântico de prosa.
- O lote não alterou migrations, schema, grants, RLS, deployment ou a decisão de acesso fechada.
