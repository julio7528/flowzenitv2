# Quickstart de validação futura — SPEC-002

Este roteiro descreve evidência que deverá ser coletada após implementação autorizada. Não executa testes, instala dependências, ativa provedor, cria rota ou acessa dados FlowZenit neste trabalho documental.

## Pré-condições

- Executar somente a versão exata de SPEC-002 incluída em lote aprovado e admitido por `$sdd-run`.
- Confirmar SPEC-001 e SPEC-004 concluídas na ordem do manifesto; manter o gate DEC-001 fechado até que um controle adequado seja aprovado, implementado e verificado.
- Não fazer chamadas a DeepSeek nem enviar conteúdo real do FlowZenit antes de DEC-006/011 e da configuração aprovada. Os testes ordinários usam doubles.
- Não habilitar persistência/conversa ou recuperação entre solicitações até SPEC-003 e DEC-005 fornecerem o contrato e política aplicáveis.
- Não habilitar ações de escrita até DEC-001, DEC-009, SPEC-005, SPEC-006/007 e ledger durável atenderem seus gates.
- Não adotar Vercel Functions, Nitro, região, plano, timeout de plataforma ou streaming sem a decisão/aprovação correspondente de DEC-010 e contrato do cliente.

## Verificações futuras

1. Executar `npm test` com doubles para resposta de texto, uma/mais chamadas de ferramenta, argumentos malformados, chamada desconhecida, resposta vazia/mista e erro do provedor.
2. Verificar cada nó e rota do grafo: validação, gate fechado, chamada ao modelo, proposta válida, recusa, esclarecimento, sucesso, falha, timeout, cancelamento e orçamento de passos esgotado.
3. Provar com spy que access gate fechado produz zero chamadas privadas Supabase, zero execução de ferramenta e zero envio de conteúdo privado ao provedor.
4. Exercitar transientes, erro permanente, `Retry-After`, retries limitados, ferramenta de leitura idempotente e interrupção por `AbortSignal`; nenhuma validação/negação é repetida automaticamente.
5. Simular o checkpoint antes/depois da execução sintética; verificar que uma mutação futura não executa sem reserva durável e que replay de resultado concluído não repete o efeito.
6. Validar a normalização do contrato DeepSeek com fixtures sintéticas/versionadas, incluindo `finish_reason`, `tool_calls`, conteúdo misto, uso de tokens e campos de continuação necessários; remover reasoning do output/logs. Nenhuma chamada real é necessária para os testes de rotina.
7. Executar `npm run lint` e `npm run build`; verificar que `server/` e credenciais não entram no bundle Vite e que não há variável `VITE_*` de provedor.
8. Se Vercel Node Functions forem aprovadas, validar handler de `/api`, desenvolvimento local equivalente, SPA deep-link/rewrite, região/duração, streaming/cancelamento conforme decidido, segredo server-only e build de produção. Se outro runtime for aprovado, substituir por seus gates específicos.
9. Registrar cada gate como `PASS`, `FAIL` ou `NOT VERIFIED` com comando e resultado observado no SDD run autorizado. Não inferir aprovação por teste planejado.

## Critério de conclusão

Todos os testes determinísticos e gates aplicáveis passam com evidência real; cada execução termina em exatamente um estado terminal; propostas inválidas/negadas executam zero ferramentas; retry e budgets são finitos; replay não duplica mutações sintéticas; logs/respostas não expõem dados sensíveis. Se runtime, provider, persistence ou access gates não estiverem aprovados, marcar as capacidades correspondentes como desabilitadas e os gates como `NOT VERIFIED`.
