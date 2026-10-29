# Validação futura — SPEC-007

Roteiro documental para implementação futura. Nada foi implementado ou executado neste planejamento. Não acesse Supabase privado nem habilite endpoint; testes de parser usam apenas fixtures sintéticas. Testes DB só após lote explicitamente aprovado, controle de acesso separado que satisfaz DEC-001, DEC-009 aplicável e alvo isolado não produtivo.

## Contexto fixo dos testes

- Locale `pt-BR`, zone `America/Cuiaba`, instante de referência injetado e exato.
- Registrar Node/ICU/TZDB efetivamente usados; não usar timezone do host implicitamente.
- Dados sintéticos para nomes, IDs e séries; nenhum prompt ou linha real.
- Preservar `date` e `time without time zone`; migrations atuais não são alteradas.

## Cenários de verificação

1. `npm test`: resolver “hoje” e “amanhã” com referência perto de meia-noite em Cuiabá; confirmar data civil e que amanhã não é cálculo fixo de 24h.
2. Testar timestamps ISO com `Z` e offsets; converter instant usando `America/Cuiaba`, depois comparar data e wall-clock civil esperados.
3. Antes de DEC-013, testar queries e writes com weekday solto e “próxima semana”: ambos devem pedir esclarecimento e não escolher uma data/range.
4. Testar Monday–Sunday, domingo/segunda, viradas de semana/mês/ano e weekdays ISO 1–7 sem depender do timezone de máquina.
5. Executar fixtures históricos de regras IANA de Cuiabá para gap/fold quando aplicável; guardar versão Node/ICU/TZDB e exigir ambiguidade explícita, sem shift/offset implícito.
6. Testar formato inválido, dia inválido, horário ausente/inválido, referência ausente, hora final <= inicial, intervalo overnight e mudança de regra IANA.
7. Testar round trip do banco isolado com `date`, `time without time zone`, `hora_fim=null` e horários explícitos; nenhum valor pode sair deslocado.
8. Testar validação de séries com weekdays vazios, repetidos ou fora de 1–7; faixa invertida; nome vazio; end opcional nulo ou maior que start.
9. Consultar weekday/data na borda inicial, final, antes e depois. A projeção inclui apenas templates aplicáveis e não cria ocorrência, subtask, demand ou ID persistido derivado.
10. Sobrepor horários de template com template/subtarefa: reportar conflito informativo e verificar que nenhum registro foi rejeitado, alterado ou movido.
11. Para editar série, alterar weekdays/range/horas e validar resumo de impacto, policy/confirmation, replay, idempotência, estado stale e read-back em alvo isolado.
12. Provar zero chamada privada/mutação com DEC-001 fechado; DEC-009 ausente deve negar write; DEC-004 deve negar exceção individual; nenhuma query/write deve registrar frase ou conteúdo privado.
13. Executar `npm run lint`, `npm run build` e `npm test`; registrar comando, exit code e saída real. Gatilho indisponível é `NOT VERIFIED`, nunca PASS.

O roteiro não escolhe parser/library, regra DEC-013, matriz DEC-009, política DEC-004, runtime/região, grants ou retenção.
