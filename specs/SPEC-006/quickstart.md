# Validação futura — SPEC-006

Este roteiro é para execução após autorização da implementação. Nada foi executado durante o planejamento. Use lote SDD aprovado, um controle separado que satisfaça a condição de acesso imposta por DEC-001 implementado/verificado e as entradas DEC-009 aprovadas que forem necessárias. Até lá, teste somente a camada de validação com doubles sintéticos, sem Supabase privado ou endpoint acessível.

## Pré-condições futuras

- Confirmar SPEC-001/002/004/005 compatíveis; manter DEC-001 como aprovada sem autenticação nova, e não executar reads privados nem writes até um controle de acesso separado ser aprovado, implementado e verificado; escolher/aprovar o limite transacional e o adaptador de idempotência.
- Para testes de banco, usar projeto local/alvo isolado marcado como não produtivo, migrações exclusivamente do lote aprovado, registros sintéticos e limpeza delimitada.
- Usar somente matriz DEC-009 sintética em testes de ramo. Não converter fixture em configuração de produção.
- Manter o gate DEC-001 fechado e provar zero chamadas ao repositório quando o gate faltar.

## Cenários de verificação futuros

1. `npm test`: validar DTOs estritos, IDs bigint como string decimal, nome não vazio após trim, tipos/pais, enum de status e rejeição de campos extras.
2. Criar demanda, tarefa e subtarefa sintéticas; confirmar tipo/pai e IDs persistentes; usar IDs inexistente e pai de tipo incorreto para provar zero efeitos.
3. Criar tarefa sob demanda semanal; o preview/outcome deve listar a data do pai que será limpa. Alterar o pai entre preview e confirmação deve retornar conflito sem write.
4. Mover tarefa na mesma semana e para outra semana/backlog; comparar exatamente a lista de filhos que o trigger limpa, incluindo datas e horários. Alterar um filho antes de executar deve invalidar a confirmação antiga.
5. Atualizar status válido de subtarefa; tentar escrever status direto em tarefa/demanda e status inválido; verificar status dos pais lido do banco após o trigger.
6. Testar planejamento semanal para demanda sem tarefa, tarefa, demanda com tarefa e subtarefa; tentativa inválida não pode alterar linhas.
7. Testar planejamento diário com agenda completa, todos os campos nulos, campos parcialmente nulos, data fora da semana e `hora_inicio >= hora_fim`. Confirmar que overlaps válidos permanecem sem deslocar outros registros.
8. Concorrer dois comandos com mesmo idempotency key/hash, repetir após outcome persistido e tentar chave igual com hash diferente. Provar no máximo um efeito, outcome anterior para replay e conflito para hash diferente.
9. Simular indisponibilidade e timeout antes/depois do commit; consultar ledger antes de decidir qualquer retry e nunca responder `COMMITTED` sem leitura de volta confirmada.
10. Provar que gate DEC-001 fechado, policy/confirmation ausente, grant inválido ou ledger indisponível produzem zero efeito.
11. Executar `npm run lint`, `npm run build` e `npm test`; para gate de banco, registrar comando/target isolado, resultado e evidência sem dados sensíveis.

Registrar cada gate como `PASS`, `FAIL` ou `NOT VERIFIED` com comando e resultado real. Este quickstart não aprova implantação, grants, provider ou ação privilegiada.
