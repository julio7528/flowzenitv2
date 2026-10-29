# Quickstart de validação futura — SPEC-005

Este roteiro define evidência futura após implementação autorizada. Não executa testes, ativa modelos/provedores, altera dados ou libera qualquer ação neste trabalho documental.

## Pré-condições

- Executar somente a versão exata de SPEC-005 em lote aprovado e admitido por `$sdd-run`.
- Usar os contratos compatíveis das SPECs 001/002/004; manter o gate DEC-001 fechado enquanto não existir controle adequado aprovado, implementado e verificado.
- Usar uma matriz DEC-009 sintética e versionada nos testes. Não converter essa fixture em política de produção.
- Não habilitar operação real se a matriz específica estiver pendente/ausente, se o grant/store atômico não estiver aprovado/configurado, ou se a reserva/resultado idempotente não puder ser persistida.
- Usar apenas corpus, registros, chamadas e sentinelas sintéticos. DEC-005/006 e SPEC-010 continuam controlando persistência, retenção e tracing externo.

## Verificações futuras

1. Executar `npm test` para schemas estritos, campos extras, limites, canonicalização de IDs/datas/enums, hash de payload e rejeição de SQL/código/query arbitrária.
2. Exercitar corpus fixo de prompt injection direta em mensagens e indireta em nomes de demandas, memória, saída de ferramentas e conteúdo web sintético. A política deve manter o conjunto de ferramentas permitido e nenhum classificador pode aprovar uma ação.
3. Usar spy de efeitos colaterais para provar que acesso DEC-001 fechado, capability ausente, ferramenta desconhecida, argumento inválido, matriz DEC-009 não resolvida, precondição stale, budget esgotado e store/ledger indisponível resultam em zero side effects.
4. Cobrir `ALLOW`, `DENY` e `REQUIRE_CONFIRMATION` somente por matriz sintética; verificar que a decisão é reavaliada imediatamente antes do handler.
5. Testar grant para ação/alvo/payload/precondição exatos; alterar cada campo, expirar, rejeitar e repetir a confirmação. Todas as variantes devem falhar fechadas.
6. Executar teste concorrente de `consumeOnce`: múltiplas chamadas simultâneas para um grant permitem no máximo uma reserva de execução/handler.
7. Repetir a mesma chave/hash e confirmar recuperação do mesmo resultado sem segunda execução; reutilizar chave com payload diferente deve retornar conflito e zero side effect.
8. Injetar canários de segredo em prompts, argumentos, resultados, erros, saídas e eventos. Confirmar que respostas, logs e eventos contêm zero sentinelas e não contêm corpo/raw exception.
9. Exercitar classificação de evento: erros de validação viram `benign_validation_failure`; detecção gera no máximo `suspicious_signal`; somente evidência independente prevista por processo aprovado pode marcar `confirmed_attack`.
10. Executar `npm run lint` e `npm run build`; confirmar que os módulos de política e dados sensíveis não entram no bundle Vite.
11. Se uma loja transacional for aprovada, rodar testes de atomicidade/expiração em ambiente isolado sintético, incluindo rollback e corrida; não usar dados de produção.
12. Registrar cada gate como `PASS`, `FAIL` ou `NOT VERIFIED` com comando e resultado observado no SDD run autorizado. Nenhum resultado planejado pode ser marcado como sucesso.

## Critério de conclusão

Todos os testes de schema, no-side-effect, matriz sintética, ação alterada/expirada/replay, concorrência e redaction têm evidência real; cada operação real habilitada tem uma entrada de DEC-009 aprovada e passa pelo gate DEC-001; saídas alegam conclusão somente após resultado durável. Com DEC-009 pendente, os gates de operação real permanecem `NOT VERIFIED` e ações protegidas ficam desabilitadas.
