# Contrato de resolução temporal — SPEC-007

**Estado:** interface proposta, Draft. Nenhum parser, pacote, runtime ou política é aprovado.

## Entrada

```text
TemporalRequest = {
  phrase: string,
  locale: "pt-BR",
  referenceInstant: ISO8601Instant,
  timeZone: "America/Cuiaba",
  intent?: "query" | "schedule" | "reschedule" | "series",
  suppliedDate?: "YYYY-MM-DD",
  suppliedTime?: "HH:mm[:ss]"
}
```

O runtime pode invocar o contrato interno nomeado `resolve_temporal/v1`. Ele não acessa banco e apenas normaliza a expressão com o contexto confiável recebido; consultas e gravações continuam operações separadas, cada uma com seu gate próprio.

`referenceInstant` vem do contexto server-side e não do modelo/browser. `timeZone` é fixado pela aplicação. Valores explícitos de data/hora podem complementar a frase; campos extras, timezone alternativo ou SQL são rejeitados.

## Resultado

```text
TemporalResult =
  | { state: "resolved", sourcePhrase, referenceInstant, locale, timeZone,
      civilDate, localStartTime?, localEndTime?, explicitInstant?, tzdbVersion? }
  | { state: "ambiguous", sourcePhrase, referenceInstant, locale, timeZone,
      candidates?: boundedCandidateSummary[], reasons: AmbiguityReason[] }
  | { state: "invalid" | "unsupported", sourcePhrase, reasons: SafeReason[] }
```

Ambiguity reasons são enums controlados: `WEEKDAY_WITHOUT_DATE`, `NEXT_WEEK_SEMANTICS_PENDING`, `REQUIRED_LOCAL_TIME_MISSING`, `NONEXISTENT_LOCAL_TIME`, `REPEATED_LOCAL_TIME`, `MISSING_REFERENCE_CLOCK`, `TIME_RANGE_CROSSES_MIDNIGHT`, `UNSUPPORTED_EXPRESSION`, `INVALID_DATE`, `INVALID_TIME`. A ausência de horário só é erro quando a intenção exige intervalo; query apenas por data não inventa hora. Resultado não contém stack, saída bruta de parser nem prompt formatado.

## Semântica

1. “Hoje” é a data civil de `referenceInstant` em `America/Cuiaba`; “amanhã” é o próximo dia civil.
2. Data local explícita permanece `YYYY-MM-DD`; relógio local explícito permanece sem offset.
3. Um timestamp ISO com offset identifica um instant. Converter esse instant usando regras IANA em Cuiabá para obter valores de planejamento.
4. Bare weekday e “próxima semana” produzem clarification até DEC-013 decidir query e write semantics. Um pedido para obter todo um intervalo explícito continua possível; não inferir intenção ausente.
5. Local wall time inexistente ou repetido não é normalizado automaticamente. Solicitar outro valor/offset explícito.
6. Comparar períodos/horários usa valores civis e zone fixa; não transformar date/time no banco em UTC.
7. Cada horário de confirmação é renderizado com o label `America/Cuiaba`.

## Erros e segurança

Erros públicos são categorias (`INVALID_TEMPORAL_INPUT`, `AMBIGUOUS_TEMPORAL_INPUT`, `TEMPORAL_RULE_UNAVAILABLE`, `UNSUPPORTED_TEMPORAL_EXPRESSION`). Não afirmar que foi agendado em resultado `ambiguous`, `invalid` ou `unsupported`. Não registrar frase, prompt, linha privada ou saída completa de parser em logs.

O resolver pode produzir resultado local sem DB. Qualquer query privada ou escrita subsequente verifica gate DEC-001, policy/confirmation de SPEC-005 e idempotência/runtime de SPEC-002/006 antes de acesso ou efeito. Um resultado temporal não autentica nem autoriza.

## Testes de contrato

- Fixar instante exato e verificar datas Cuiaba perto da meia-noite e da virada de ano/mês.
- Verificar que amanhã é próximo dia civil e que explícito `Z`/offset converte primeiro em instant.
- Antes de DEC-013, verificar clarification para weekday solto e “próxima semana” tanto em query quanto em write.
- Fixtures de histórico IANA identificam a versão tzdb/ICU; testar gaps/folds aplicáveis sem shift.
- Entrada sem relógio de referência, sem timezone/contexto confiável, data inválida, horário inválido e intervalo overnight não produzem candidato exato.
- Round trip de `date`/`time without time zone` conserva exatamente os valores civis e o label da zona aparece em confirmação.
