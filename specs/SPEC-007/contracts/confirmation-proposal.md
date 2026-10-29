# Proposta de confirmação de recorrências — SPEC-007

**Estado:** proposta para revisão. DEC-009 continua `PENDING`; esta tabela não autoriza nenhuma ação nem abre o gate DEC-001.

| Operação candidata | Proposta de confirmação | Resumo proposto |
|---|---|---|
| Criar série | Pedir confirmação para cada write efetivo, conforme futuro DEC-009. | Nome, dias ISO com nomes, início/fim inclusivos, horários e `America/Cuiaba`. |
| Editar série | Pedir confirmação para todo write efetivo; vincular grant aos valores completos anteriores/novos. | ID e nome da série, dias/range/horários antes/depois, data a partir da qual a série inteira muda. |
| Consultar série/projeção | Não é confirmação de ação; requer autorização de leitura e gate DEC-001. | Data civil selecionada, timezone e resultado read-only. |
| Reagendar horário/data de série | Tratar como edição de série inteira; pedir confirmação. | Mostrar impacto na faixa e weekdays da série, nunca descrever como mudança de uma única ocorrência. |
| Excluir série, exceção de ocorrência ou pause/resume | Negar/desabilitar neste escopo enquanto não houver aprovação explícita de escopo/política e DEC-004 quando aplicável. | Categoria estável de indisponibilidade; não sugerir mudança em massa como equivalente a uma exceção individual. |

Qualquer confirmação fica ligada a uma proposta canonical e one-time, com alvo, conteúdo, estado e resultado temporal. Alteração de interpretação, campos, range, weekday ou estado exige nova proposta. Confirmação não autentica o proprietário. DEC-001 continua bloqueando qualquer read privado/write real até controle de acesso separado ser decidido, implementado e verificado.

Nenhuma linha desta proposta pode ser usada como policy de produção. Transporte, TTL, armazenamento, retenção e assinatura de grant permanecem nas dependências de SPEC-005/DEC-005/DEC-009.
