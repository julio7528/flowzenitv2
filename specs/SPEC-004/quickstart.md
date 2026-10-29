# Quickstart de validação — SPEC-004

**SPEC Version**: 2

Este guia registra os comandos e resultados observados na execução autorizada da SPEC-004@2. T025 acessou diretamente o repositório Supabase somente com fixtures sintéticas; nenhuma API privada de agente foi aberta.

## Pré-condições

- Executar somente a versão exata de SPEC-004 incluída em lote aprovado e admitido por `$sdd-run`.
- Manter consultas privadas indisponíveis em runtime até o gate DEC-001 estar aprovado, implementado e verificado.
- Unit tests usam doubles e fixtures em memória. Exceção autorizada somente para T025: fixtures sintéticas temporárias no Supabase de desenvolvimento FlowZenit V2 existente, projeto `flowzenithv2` (`twikxeloeftczwbpjvzr`). Não exigir Docker Desktop nem projeto Supabase adicional.
- Essa exceção não autoriza acesso a dados privados por serviço ou endpoint. Não alterar schema, migrations, grants, RLS, policies, nem registros preexistentes; não reutilizar credenciais privilegiadas como identidade do proprietário.
- Nunca imprimir credenciais ou valores privados. O Supabase URL/ref pode ser verificado sem imprimir qualquer key; evidências registram somente resultados, IDs sintéticos e relações necessárias.
- Não instalar dependências. Usar JavaScript ESM, Node `node:test`, doubles e `@supabase/supabase-js` já instalado.

## Verificações previstas

1. Executar `npm test` para validação de DTOs, hierarquia, status, filtros, paginação, datas, horários, rotina e bloqueio de acesso.
2. Executar `npm run lint` e `npm run build`.
3. Validar IDs decimais com fixture superior ao intervalo seguro de JavaScript e confirmar que o cast/projeção não os converte em `Number` arredondado.
4. Testar data diária e semana que cruzem mês/ano, início de semana na segunda-feira, faixa semanal de sete datas e limites inclusivos de rotina em `America/Cuiaba`.
5. Confirmar que subtarefas em horários sobrepostos permanecem presentes, que subtarefa não aparece como cartão semanal, e que rotina não vira ocorrência persistida.
6. Exercitar `ILIKE` via PostgREST com caixa, acento, percent, underscore, barra invertida, vazio e múltiplos candidatos. Percent, underscore e barra invertida devem ser escapados literalmente. Acentos permanecem significativos; não exigir equivalência NFC/NFD nem full case-folding além do comportamento observado/documentado da collation.
7. Testar o serviço com Supabase double e confirmar por spy que o gate fechado impede qualquer chamada ao repositório. Separadamente, testar projeções `bigint` e filtros diretamente no repositório com fixtures sintéticas temporárias no projeto autorizado; não chamar endpoints do agente.
8. Registrar cada gate como PASS/FAIL/NOT VERIFIED no SDD run autorizado; nenhuma falha não executada é inferida como sucesso.

## Preflight e ciclo de vida das fixtures de T025

1. Confirmar que a conexão aponta exatamente para o projeto de desenvolvimento `twikxeloeftczwbpjvzr`, PostgreSQL 17.x; se o alvo divergir, interromper antes de consultar ou escrever.
2. Verificar em leitura os tipos/colunas, relações, constraints, triggers, collation de `public.demandas.demanda`, e permissões existentes necessárias à fixture. Não alterar permissões, RLS, schema ou grants.
3. Generate a unique synthetic run marker and a candidate bigint ID above `Number.MAX_SAFE_INTEGER`. Verify only the exact marker and candidate ID for collisions; do not scan or export existing records. If the schema or current permissions do not safely permit the synthetic high-ID fixture, stop T025 and report the limitation.
4. Antes de inserir, garantir que fixture possa ser capturada e limpa. Criar somente registros sintéticos necessários; capturar imediatamente cada ID decimal retornado e cada parent ID em um manifesto de teste sem segredos. Registrar somente IDs sintéticos, relações pai-filho e estado final da limpeza como evidência T025 do run SDD.
5. Preferir transação com rollback quando a conexão de teste permitir. Chamadas PostgREST não são transacionais em conjunto; nesse caso, executar cleanup em `finally`, usando exclusivamente IDs capturados e ordem child-first (subtarefas, tarefas, demandas; rotina pelo próprio ID).
6. Verificar remoção apenas pelos IDs da fixture. Se não for possível provar a abrangência de escrita/limpeza, parar essa operação e reportar IDs/relacionamentos sintéticos e alternativa segura. Não tentar limpeza ampla.

O gate de banco segue obrigatório. Se o preflight não confirmar projeto, schema, permissão e limpeza seletiva, o teste T025 não passa e a SPEC não pode ser concluída; não reclassificar o gate como `NOT APPLICABLE`.

## Conclusão

Aceitação exige contratos e critérios da SPEC, ausência de alteração no esquema/permissões/cliente do produto, testes do resultado limitado e ausência de exposição privada antes do gate. Passar os testes de contrato não habilita a API privada.

## Execução observada: SPEC-004@2

**Lote:** `f1363558-237b-46c8-8ddf-259ac7ede903`

**Run:** `fdafac5f-7521-4e83-9051-c1b9badeec3e`

**Snapshot:** `92f0c83a8c24c44119b5709a8fb3a2b1eb6846d4819f5d4624358091e854e956`
**Data:** 2026-10-29

### Quality gates executados

- `npm test`: exit 0; 53 passaram, 0 falharam e 1 foi ignorado por ser o contrato Supabase opt-in de T025. T025 foi executado separadamente e passou.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; Vite construiu 165 módulos.
- Suíte focada de contratos e segurança SPEC-004: 20 passaram, 0 falharam e 1 teste opt-in foi ignorado nesse modo.
- Testes de segurança `node --test tests/security/domain-read/access-gate.test.js tests/security/domain-read/error-disclosure.test.js`: 3 passaram, 0 falharam.
- Varredura de `src` e `dist`: nenhuma referência aos módulos `server/domain/read`; os módulos de leitura não foram incluídos no cliente.
- T025, teste direto de contrato PostgREST/Supabase com `RUN_SPEC004_SUPABASE_CONTRACT=1`: 1 passou, 0 falharam, exit 0. A execução usou somente a chave publicável, acessou diretamente o repositório com dados sintéticos e não chamou endpoint do agente.

### Evidência de T025 e limpeza

O preflight confirmou o projeto de desenvolvimento autorizado `twikxeloeftczwbpjvzr`, o esquema e as colunas usadas, constraints e permissões existentes. Foram inseridos temporariamente 13 registros sintéticos na tabela `demandas`, com IDs bigint decimais capturados no intervalo `9927026350032428`–`9927026350032440` e relações de demanda, tarefa e subtarefa. O T025 verificou IDs e marcador sem inserir linhas em `recorrente`; templates de rotina foram cobertos por fixtures unitárias. Os testes confirmaram projeção exata de bigint, filtros tipados, busca literal case-insensitive e accent-sensitive, escaping de `%`, `_` e barra invertida, hierarquia, datas e ordenação determinística.

A limpeza removeu somente os IDs capturados, em ordem child-first. As verificações posteriores confirmaram zero registros desses IDs, zero marcador sintético e zero registros na data de teste. Nenhum registro preexistente, schema, migration, grant, RLS ou policy foi alterado.

### Limites do resultado

O gate DEC-001 permaneceu fechado: todas as seis operações de serviço negam acesso antes de consultar o repositório. Os testes diretos T025 validam apenas o contrato do repositório com fixtures sintéticas; não habilitam leitura privada do agente. Nenhum fluxo visual foi alterado, portanto E2E de navegador/acessibilidade permaneceu condicional e não foi executado.


### Resultado da auditoria T029

- SC-001 a SC-004: cobertura sintética e de contratos observada; a seleção final de candidatos ambíguos continua pertencendo ao runtime consumidor.
- SC-005 / FR-013: `NOT VERIFIED`. Nenhuma das seis operações tem um pedido tipado de compromisso independente que produza uma resposta estruturada de limitação. Os testes atuais provam ausência de IDs de ocorrência e ausência de escrita em consultas de rotina, mas não provam a resposta requerida.
- FR-002 / FR-009: há um ponto de contrato pendente para `getHierarchy`: o request aprovado contém apenas `itemId`, enquanto a implementação percorre todos os descendentes e informa `complete`, sem limite total nem cursor público.
- FR-010: candidatos duplicados permanecem separados em ordenação determinística; não existe ranking de relevância nem sinal explícito de narrowing nesta camada. Não se declara ranking semântico.
- Não foi alterado o snapshot aprovado para resolver esses pontos. É necessária uma decisão de escopo/contrato antes de declarar a SPEC integralmente aceita.

## Reexecução após reparo controlado — 2026-10-29

Este registro complementa a auditoria bloqueada acima, preservada como histórico. O lote, o run e o snapshot aprovados foram mantidos; o hash do snapshot continua `92f0c83a8c24c44119b5709a8fb3a2b1eb6846d4819f5d4624358091e854e956`.

### Reparo do plano de controle SDD

- Aplicada a migration `20261029135939_sdd_admin_reopen_blocked_task.sql`, somente no schema de governança SDD. Ela adiciona o tipo de autorização `TASK_REOPEN` e a RPC administrativa restrita `public.sdd_reopen_blocked_task(uuid,uuid,text,text,integer,text,text,text,text,uuid)`.
- A RPC exige o lote, manifesto, SPEC-004@2, run, T029, aprovador, motivo, confirmação textual e chave idempotente exatos; verifica estado PAUSED e ausência de lease/execução concorrente; altera apenas T029 para PENDING e grava a autorização e o evento append-only. EXECUTE está revogado de PUBLIC, anon, authenticated e service_role.
- A reabertura autorizada por `proprietario` foi registrada no evento SDD `574` (`ADMIN_TASK_REOPENED`, `BLOCKED` → `PENDING`). O evento preserva estado e timestamps anteriores. T001–T028, o gate final original e a falha original não foram apagados ou reiniciados.
- O lote foi retomado administrativamente no mesmo run `fdafac5f-7521-4e83-9051-c1b9badeec3e`; a expiração posterior do lease interrompeu uma tentativa de correção, que foi preservada. A correção subsequente começou como nova tentativa, dentro do limite existente de cinco; nenhum contador foi estendido ou zerado.
- Testes administrativos transacionais validaram argumentos incorretos, confirmação ausente, idempotência/replay e divergência de payload. A execução por anon, authenticated e service_role foi negada. A migration não altera tabelas, grants, RLS nem dados do produto.

### Contratos corrigidos

- `getHierarchy` retorna no máximo 50 descendentes por padrão e 100 por página, mantém o contexto ancestral e IDs bigint como strings, e só informa `complete` após esgotar a travessia. O cursor é AES-256-GCM, opaco, autenticado e vinculado ao item/ordenação; o runtime servidor injeta uma chave `Uint8Array` com pelo menos 32 bytes. Todas as instâncias que atendem a mesma API devem usar a mesma chave servidor; ela nunca é enviada ao cliente. Rotacionar a chave invalida cursores existentes. Não há promessa de snapshot estável durante mudanças concorrentes.
- Buscas mantêm todos os candidatos com referências persistentes e contexto hierárquico, preservam a ordem determinística do repositório e informam `requiresNarrowing`/`narrowingReason` para ambiguidade ou páginas truncadas. Nenhum candidato é escolhido silenciosamente.
- Pedidos independentes de compromisso/calendário recebem a resposta estruturada `UNSUPPORTED_ENTITY`. Não foram criadas entidade, ID ou sétima ferramenta, nem operação de escrita.

### Verificações observadas após as correções

- `npm test`: exit 0; 70 testes, 69 aprovados, 0 falhas e 1 teste opt-in separado.
- Contratos focados (`tests/contracts/domain-read` e `tests/security/domain-read`): 37 testes, 36 aprovados, 0 falhas e o teste Supabase opt-in separado.
- T025/PostgREST: 1 aprovado, após preflight do projeto `twikxeloeftczwbpjvzr`, schema e permissões; os 13 IDs sintéticos foram limpos e a verificação posterior confirmou zero IDs e zero marcador.
- Segurança: 7/7 aprovados; os seis serviços continuam negando acesso antes de consultar o repositório.
- `npm.cmd run lint`: exit 0, zero avisos e erros. `npm run build`: exit 0, 165 módulos transformados.
- A varredura pós-build não encontrou `server/domain/read` em `src` ou `dist`.
- `npm run test:sdd-db` ficou **NOT VERIFIED**: o Postgres local não estava disponível em `127.0.0.1:54322` e o Docker Desktop não estava ativo. Os testes da migration remota foram executados pelo canal administrativo autorizado.
- DEC-001 permaneceu fechado; nenhuma autenticação, política ou gate de acesso do produto foi alterado.

### Resultado da nova auditoria T029

A auditoria independente final passou e foi registrada no SDD; o evento `QUALITY_GATE_RECORDED` é o `615` e o ID do gate é `8f90cc4c-168a-4aa3-b5fa-1e869b0b485b`. Não foram encontrados bloqueios restantes.

- FR-002 / FR-009: hierarquia paginada, contexto ancestral, truncamento correto, IDs bigint em strings e cursor opaco AES-256-GCM vinculado ao item e à ordenação; adulteração, chave errada e item incompatível são rejeitados.
- FR-010: candidatos determinísticos com referências/contexto e sinalização explícita de narrowing; nenhuma seleção silenciosa ou pontuação semântica.
- FR-013 / SC-005: resposta `UNSUPPORTED_ENTITY` reutilizável, sem IDs, writes ou sétima ferramenta.
- Segurança / DEC-001: ferramentas seguem fechadas antes de qualquer chamada ao repositório.
- Snapshot aprovado preservado; `npm test` 69 aprovados, 0 falhas e 1 teste opt-in executado separadamente; T025/PostgREST aprovado; lint, build e verificação do bundle aprovados.

O run continuou no lote e snapshot originais. O attempt 2 permanece registrado como interrompido após expiração de lease; a tentativa de correção seguinte foi concluída sem extensão dos limites. O smoke test local SDD permanece `NOT VERIFIED` por ausência do Postgres/Docker local; a RPC remota foi aplicada e testada pelo canal administrativo autorizado.
