# Auditoria final — SPEC-008@2

**Lote:** `e52e1b23-e9d9-49ec-bb06-c2438a1fe7f8`  
**Manifest hash:** `d792b4cf5f48ea52d636561f8259cb52c040827bf9d299e493d4f9eba65f56e9`  
**Run:** `c55db91e-669c-44df-bdef-737aa6556a20`  
**Snapshot SPEC-008@2:** `46a17bc75a5e2dcd80da3ac2239986dfc2886b8d83e12ab95d76224468f0c372`

## Resultado

SPEC-008 reutiliza `searchItems` de SPEC-004 através do cliente Supabase/PostgREST existente. Nenhum caminho de SQL ou conexão direta Node/PostgreSQL foi introduzido. Resultados de `searchItems` chegam ao modelo como mensagem de ferramenta e como segmento de recuperação explicitamente marcado como dado não confiável; o JSON e as referências originais permanecem intactos dentro do texto do segmento.

## Rastreabilidade

| Requisito | Evidência | Estado |
|---|---|---|
| FR-001–002: Postgres Supabase como fonte única e busca SPEC-004 reutilizada | Revisão de `server/domain/read/repository.js`, `server/domain/read/search.js`, `server/domain/read/index.js` e `server/agent/tools/registry.js`; teste PostgREST via `tests/integration/domain-read/spec008-supabase.test.js`. | PASS |
| FR-003: DTOs/filtros allowlisted e texto literal | Contratos de busca e teste real com `%`, `_` e `\\`; entradas extras são rejeitadas antes do repositório. | PASS |
| FR-004: tipo, ID e proveniência/hierarquia | Testes de contrato e fixture de demanda → tarefa → subtarefa via PostgREST; IDs bigint retornam como strings decimais. | PASS |
| FR-005: update/delete aparecem na consulta seguinte | Teste real atualizou e excluiu fixtures pela API Supabase; buscas subsequentes refletiram as duas mudanças. | PASS |
| FR-006: gate SPEC-001 antes da leitura | `createDomainReadTools` encaminha `searchItems` por `withDomainReadAccess`; o gate padrão permanece fechado. | PASS |
| FR-007: recuperação é dado não confiável | `build-graph.js` cria segmento server-branded `retrieval`; mensagem de ferramenta preserva o conteúdo como dado e não cria campo de policy/capability. O teste do caminho inclui texto de instrução sintético e verifica que ele permanece no campo `text` do segmento não confiável. | PASS |
| FR-008–009: sem infraestrutura adicional ou mudanças de schema, grants e RLS | Revisão do diff desta SPEC; integração usa `public.demandas` existente. Nenhuma migration, grant ou policy foi criada/modificada nesta SPEC. | PASS |
| FR-010: erros não expõem detalhes privados | Teste de contrato confirma que falhas do repositório são mapeadas para `DEPENDENCY_UNAVAILABLE` sem mensagem interna. | PASS |
| SC-001–002: busca/proveniência e atualização/exclusão sintéticas | Teste Supabase/PostgREST aprovado; nove IDs sintéticos e os três vínculos de hierarquia foram registrados na evidência da tarefa T005. Limpeza por ID exato confirmou zero IDs e zero marcador restantes. | PASS |
| SC-003: sem SQL arbitrário ou operadores fora do DTO | Validação tipada e testes de contrato; ILIKE escapa caracteres de padrão e a API real confirmou a semântica literal. | PASS |
| SC-004–005: nenhum banco/provider auxiliar e nenhum fato exato inferido pelo ranking | Revisão de dependências e fluxo; resultados são candidatos com proveniência/narrowing, e fatos exatos continuam nas leituras estruturadas de SPEC-004. | PASS |

## Verificações executadas

- `node --test tests/contracts/domain-read/search.test.js tests/contracts/domain-read/ambiguity.test.js tests/contracts/agent/turn-flow.test.js tests/unit/guardrails/untrusted-content.test.js tests/security/guardrails/indirect-injection.test.js` — exit 0; 24 passaram, 0 falharam, 0 ignorados.
- `$env:RUN_SPEC008_SUPABASE_CONTRACT='1'; node --test tests/integration/domain-read/spec008-supabase.test.js` — exit 0; 1 teste passou contra `flowzenithv2` (`twikxeloeftczwbpjvzr`) pelo cliente Supabase/PostgREST.
- `rtk proxy npm run lint` — exit 0.
- `npm run build` — exit 0; 165 módulos transformados.
- Preflight confirmatório separado — exit 0; ref do projeto, projeção PostgREST, disponibilidade dos IDs e ausência do marcador foram confirmados antes de qualquer insert.
- A verificação live criou nove registros sintéticos em `public.demandas`, registrou IDs e parent IDs, e a limpeza final confirmou zero fixture ID e zero marcador restantes.

## Limites da evidência

- A integração valida o caminho atual Supabase/PostgREST e o serviço de busca, sem chamar provider real. O caminho de mensagem do agente é coberto com doubles.
- Conexão direta Node `pg` ao banco não é gate para SPEC-008 e não foi executada.
- O teste não altera migrations, schema, grants ou RLS.
