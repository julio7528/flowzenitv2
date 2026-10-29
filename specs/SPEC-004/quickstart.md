# Quickstart de validação — SPEC-004

**SPEC Version**: 2

Este guia descreve verificações futuras após implementação autorizada. Não executa consultas nem altera banco neste trabalho documental.

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
