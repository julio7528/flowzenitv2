# Contrato de série recorrente — SPEC-007

**Estado:** operações tipadas propostas, Draft; nenhuma ferramenta é registrada ou habilitada por este contrato.

## Operações propostas

| Operação | Entrada | Efeito/resultado |
|---|---|---|
| `create_routine_series/v1` | nome, weekdays ISO únicos, data inicial/final inclusivas, hora inicial e final opcional | Insere somente uma linha de template; retorna ID string e valores lidos do banco. |
| `edit_routine_series/v1` | ID exato, estado/fingerprint esperado e campos permitidos | Altera a série inteira; exibe dias e range afetados. Não modifica uma data isolada. |
| `get_routine_series/v1` | ID exato ou query tipada autorizada | Retorna séries, nunca ocorrência. A query só funciona após DEC-001. |
| `get_routine_projection/v1` | data civil explícita, weekday ISO derivado pelo domínio | Retorna templates cujo dia e range inclusivo correspondem. Cada item é projection `{templateId, selectedDate, ...}`, read-only. |

Não há `delete`, pause/resume/active toggle, `skip_occurrence`, `edit_occurrence`, feriado, replacement, cancelamento/restauração por instância ou operação multi-série nesta capability. Criar outra entidade não é fallback.

## Validação estrita

- `id` bigint é string decimal. Nunca escolher alvo por nome duplicado.
- `name` é trim-não-vazio conforme schema; nenhum limite/unicidade inventado.
- `weekdays` é array de inteiros ISO de 1 a 7, com pelo menos um valor e sem duplicatas na entrada. Ordenar para forma canônica; não adicionar constraint SQL.
- Datas obedecem `YYYY-MM-DD`, `startDate <= endDate`; ambos são inclusivos.
- `startTime` é valor civil válido. `endTime` é `null` ou maior que `startTime`, conforme constraint atual. Manter null exatamente; não derivar uma hora nem aceitar cross-midnight.
- Overlap com outro template/subtarefa pode ser informado, mas não bloqueia, move ou altera itens.
- Nenhum campo `timezone`, `active`, `occurrenceId`, `exception`, `demandId` ou `subtaskId` é persistido no template.

## Confirmação, transação e outcomes

Create/edit só podem produzir efeito com DEC-001 satisfeito, linha DEC-009 aprovada, policy SPEC-005 autorizada e confirmação vinculada ao ID, operation/version, conjunto canonical de campos, range/weekdays, estado esperado e resultado temporal. DEC-009 permanece pendente; teste usa somente fixture sintética. Reserva idempotente é server-side segundo SPEC-002/006. Aplicar uma operação atômica pelo adapter escolhido futuramente, revalidar estado e fazer read-back. Não apresentar PostgREST calls múltiplas como transação.

Outcomes candidatos: `COMMITTED`, `NO_OP`, `VALIDATION_ERROR`, `DENIED`, `CONFIRMATION_REQUIRED`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `FAILED`. O sucesso inclui ID, série persistida e correlation ID; logs e erros não vazam nomes, frases, SQL, resultados brutos ou credenciais.

## Testes de contrato

- Create/edit série conserva exatamente valores persistidos; rejeita array vazio/duplicado/fora de 1–7, range invertido, nome em branco, hora inválida e end <= start.
- `hora_fim=null` round trip continua null; não inferir uma hora a partir do renderer client-side.
- Query aplica weekday e duas fronteiras inclusivas; fora da faixa ou weekday não selecionado não retorna projeção.
- Projeções têm `templateId + selectedDate`, sem ocorrência persistida, sem inserir demanda/subtarefa e sem mudar counts.
- Overlap é encontrado e reportado apenas como informativo; ambos itens e horários ficam inalterados.
- DEC-001 fechado, DEC-009 sem regra aprovada, exceção DEC-004 e weekday/“próxima semana” DEC-013 não causam write/read privado.
