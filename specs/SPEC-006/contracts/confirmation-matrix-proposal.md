# Proposta de matriz de confirmação — SPEC-006

**Estado:** proposta para revisão. DEC-009 continua `PENDING`; nenhuma linha desta tabela é uma autorização de execução. Mesmo que uma futura matriz permita a ação, o gate DEC-001 precisa estar satisfeito antes de qualquer leitura privada ou write.

| Operação | Regra de confirmação proposta | Conteúdo mínimo exibido |
|---|---|---|
| Criar demanda, tarefa ou subtarefa | Confirmar todo write efetivo. `NO_OP` não pede confirmação. | Tipo, nome, pai exato e vínculo que será criado. |
| Criar tarefa sob demanda com data semanal | Confirmar o write e a limpeza indireta quando `data_exec` do pai estiver preenchido. | Demanda, data semanal anterior e efeito proposto `data_exec → null`; tarefa nova e pai afetado. |
| Renomear demanda, tarefa ou subtarefa | Confirmar todo write efetivo. | Tipo, ID persistente, nome anterior e nome novo. |
| Alocar/reagendar demanda ou tarefa na semana | Confirmar todo write efetivo. | Tipo, ID, data anterior/estado backlog e data civil nova. |
| Mover tarefa que limpará agendas de subtarefas | Confirmação obrigatória e vinculada ao conjunto exato. | Tarefa, data/semana anterior e destino; para cada subtarefa, ID, nome, data e horário que serão limpos. |
| Alocar, mover ou limpar agenda diária de subtarefa | Confirmar todo write efetivo. | Subtarefa/IDs de hierarquia, data e intervalo anterior/novo, sempre com `America/Cuiaba`. |
| Alterar status de subtarefa, inclusive `Done` | Confirmar todo write efetivo. | Subtarefa, status anterior/novo e status derivado esperado de tarefa/demanda. |
| Repetir comando com mesma chave/hash ou solicitar valor já persistido | Sem novo grant para resultado `NO_OP` ou outcome idempotente já concluído; não repetir side effect. | Resultado anterior seguro, sem afirmar uma nova gravação. |
| Excluir, alterar status de tarefa/demanda, editar rotina ou executar plano multioperação | Negar/desabilitar nesta SPEC; exige outra SPEC/política e escopo aprovado. | Categoria estável de indisponibilidade, sem revelar detalhes privados. |

## Condições globais propostas

- Esta tabela define apenas **confirmação**, não identidade, autenticação ou autorização de acesso.
- Até DEC-009 ser aprovada, ausência de uma entrada aprovada significa `DENY`; fixture sintética só serve para testes.
- Confirmação é consumida uma vez e vinculada ao operation/version, ID/pai, payload, estado esperado e fingerprint de todos os efeitos derivados.
- Mudança do alvo, payload, status, datas, conjunto afetado ou pré-condições exige nova proposta; não reaproveitar confirmação.
- Operações reais continuam bloqueadas pelo gate DEC-001, mesmo após eventual aprovação da matriz.
- Esta proposta não escolhe transporte, UI, grant TTL, armazenamento ou retenção. A SPEC-005 mantém essas escolhas técnicas abertas.
