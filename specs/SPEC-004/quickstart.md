# Quickstart de validação — SPEC-004

**SPEC Version**: 2 (proposta para revisão)

Este guia descreve verificações futuras após implementação autorizada. Não executa consultas nem altera banco neste trabalho documental.

## Pré-condições

- Executar somente a versão exata de SPEC-004 incluída em lote aprovado e admitido por `$sdd-run`.
- Manter consultas privadas indisponíveis em runtime até o gate DEC-001 estar aprovado, implementado e verificado.
- Usar fixtures sintéticas e alvo isolado não produtivo para testes de integração; não alterar dados, grants, RLS, schema ou policies existentes.
- A integração de contrato de banco deve chamar o repositório diretamente contra um alvo isolado com dados sintéticos. Ela não pode abrir o gate do serviço nem acessar o banco de produto. Usar credenciais específicas desse alvo, fora do repositório; nunca reutilizar `.env.local` ou credenciais de produção.
- Não instalar dependências. Usar JavaScript ESM, Node `node:test`, doubles e `@supabase/supabase-js` já instalado.

## Verificações previstas

1. Executar `npm test` para validação de DTOs, hierarquia, status, filtros, paginação, datas, horários, rotina e bloqueio de acesso.
2. Executar `npm run lint` e `npm run build`.
3. Validar IDs decimais com fixture superior ao intervalo seguro de JavaScript e confirmar que o cast/projeção não os converte em `Number` arredondado.
4. Testar data diária e semana que cruzem mês/ano, início de semana na segunda-feira, faixa semanal de sete datas e limites inclusivos de rotina em `America/Cuiaba`.
5. Confirmar que subtarefas em horários sobrepostos permanecem presentes, que subtarefa não aparece como cartão semanal, e que rotina não vira ocorrência persistida.
6. Exercitar busca com `%`, `_`, acentos, caixa, nenhum resultado e múltiplos candidatos; nenhum valor pode virar SQL, filtro arbitrário ou seleção silenciosa.
7. Testar o serviço com Supabase double e confirmar por spy que o gate fechado impede qualquer chamada ao repositório. Separadamente, testar a projeção `bigint` chamando o repositório contra alvo isolado com fixtures sintéticas. A integração de banco não autoriza leituras via endpoint.
8. Registrar cada gate como PASS/FAIL/NOT VERIFIED no SDD run autorizado; nenhuma falha não executada é inferida como sucesso.

O gate de banco é obrigatório. Se não houver alvo isolado e verificável, registrar bloqueio/`NOT VERIFIED` e não concluir a SPEC; nunca reclassificar o gate como `NOT APPLICABLE` nem substituir o alvo por produção.

## Conclusão

Aceitação exige contratos e critérios da SPEC, ausência de alteração no esquema/permissões/cliente do produto, testes do resultado limitado e ausência de exposição privada antes do gate. Passar os testes de contrato não habilita a API privada.
