# Modelo temporal e de recorrência — SPEC-007

**Estado:** contrato conceitual Draft. Reusa o schema existente; nenhuma migração ou entidade persistida nova é prevista.

## Persistência existente

### `public.recorrente`

| Campo | Tipo/regra observada | Contrato de uso |
|---|---|---|
| `id` | `bigint` identity, primary key | ID persistente; trafegar como string decimal. |
| `demanda` | `text NOT NULL`, `char_length(btrim(demanda)) > 0` | Nome não vazio após trim; não inventar tamanho máximo ou unicidade. |
| `hora` | `time without time zone NOT NULL` | Horário civil local de início; não converter a UTC. |
| `hora_fim` | `time without time zone NULL`; `hora_fim is null or hora_fim > hora` | Valor null é legítimo; manter null. Se informado, deve ser posterior ao início segundo constraint atual. |
| `dias_semana` | `smallint[] NOT NULL`; cardinalidade 1–7 e elementos contidos em `[1,2,3,4,5,6,7]` | Weekday ISO, 1=segunda e 7=domingo. O check do banco não impede duplicatas; validador de entrada rejeita duplicatas sem alterar schema. |
| `data_inicial` | `date NOT NULL` | Primeiro dia inclusivo de aplicabilidade. Valor civil `YYYY-MM-DD`. |
| `data_final` | `date NOT NULL`; `data_inicial <= data_final` | Último dia inclusivo de aplicabilidade. Valor civil `YYYY-MM-DD`. |

Não há FK para `public.demandas`, atributo active/enabled, timezone, duração, ocorrência, occurrence ID, skip, edição de instância, feriado ou tabela de exceção. A série não é compromisso independente. A constraint é fonte final para escrita futura, mas não substitui validação nem autorização.

### Agenda existente de demandas

`public.demandas.data_exec` é `date`; `hora_inicio` e `hora_fim` são `time without time zone`. A SPEC-007 não os altera; SPEC-006 possui seus contratos de escrita. Os valores são civis em `America/Cuiaba` e não são convertidos para UTC. A regra existente de sobreposição permite itens coincidentes; nenhum item deve ser deslocado para “corrigir” overlap.

## Tipos conceituais sem persistência

### `TemporalContext`

| Campo | Regra |
|---|---|
| `referenceInstant` | Instant ISO 8601 com offset ou `Z`, fornecido pelo server/runtime confiável. |
| `locale` | `pt-BR` para interpretação de frases em português brasileiro. |
| `timeZone` | Literal aprovado `America/Cuiaba`; não controlado pelo modelo. |
| `intent` | `query`, `schedule`, `reschedule` ou `series`, quando conhecido do chamador. |
| `tzdbVersion` | Evidência da versão realmente usada, obtida do runtime quando disponível; não é coluna do domínio. |

### `TemporalResolution`

Estado discriminado `resolved | ambiguous | invalid | unsupported`; inclui frase de entrada na memória efêmera, instante de referência, zone, valores civis resolvidos (`date`, `startTime`, `endTime` ou null), eventual instant ISO normalizado, e motivos de ambiguidade/erro. Resultado nunca vira registro ou histórico durável nesta SPEC.

### `RoutineDisplayProjection`

Projeção efêmera de uma série que se aplica a uma data: `{ templateId, selectedDate, title, weekday, startTime, endTime|null }`. A chave de exibição é par template/data no contexto da resposta. Não atribuir `occurrenceId`, ID de demanda/subtarefa ou persistência.

## Regras puras

- `today(referenceInstant, America/Cuiaba)` retorna a data civil em Cuiabá no instant. `tomorrow` é a data civil seguinte, não um delta de duração 24h.
- Timestamp explícito com offset → instant → data/hora local em Cuiabá. Data e hora locais explícitas continuam valores civis sem inferir offset.
- Bare weekday e “próxima semana” são ambíguos para consulta ou gravação até DEC-013 definir os dois contextos. Não escolher a proposta antiga do roadmap.
- Wall-clock gap/fold segundo TZDB é ambíguo/inválido; sem deslocamento ou escolha arbitrária de offset.
- Semana de calendário observada começa segunda e termina domingo; weekday é ISO 1–7. A expressão natural “próxima semana” ainda depende DEC-013.
- Uma rotina aplica-se se o weekday ISO da data pertencer a `dias_semana` e `data_inicial <= selectedDate <= data_final`.
- End time null permanece null. Intervalos que cruzam a meia-noite não atendem `hora_fim > hora` e não são reinterpretados como terminando no dia seguinte.
- Intervalo sobreposto é informativo; nenhum registro existente é rejeitado, alterado ou movido por causa do overlap.

## Mutação, concorrência e integridade

Comandos futuros usam operação/versão allowlisted, string ID bigint, `expectedStateFingerprint`, confirmação aprovada e chave idempotente server-side. Edit de template é de série inteira e apresenta campos/range/weekdays anteriores e novos. Revalidar alvo e estado antes da escrita, usar o adapter transacional/idempotente aprovado por SPEC-002/006 e ler de volta. Conflito, confirmação ausente, DEC-001 fechado ou estado incerto não podem responder sucesso. Não usar chamadas REST separadas como promessa de atomicidade.

DEC-004 bloqueia operações de exceção, mas não bloqueia a projeção e edição da série inteira já representada. DEC-009 bloqueia writes sem linha de confirmação aprovada. DEC-013 bloqueia seleção implícita de datas/intervalos para as frases cobertas. Nenhuma destas pendências exige alterar o modelo atual para terminar o planejamento.
