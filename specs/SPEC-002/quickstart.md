# Quickstart de validação — SPEC-002@2

Este roteiro aplica-se somente a uma execução autorizada do snapshot exato de SPEC-002@2 por meio de $sdd-run. Não instala nem publica mudanças por conta própria.

## Pré-condições e limites

- Confirme o manifesto aprovado, o snapshot imutável, o run, as dependências SPEC-001@2 e SPEC-004@2 concluídas e a ausência de outro lote ativo.
- Mantenha DEC-001 fechada. O endpoint deve negar antes de qualquer chamada ao modelo, Supabase ou ferramenta.
- Nunca trate passkey ou sessionStorage como autenticação server-side.
- Nunca envie dados reais do FlowZenit, demandas, histórico pessoal, prompts armazenados, credenciais ou dados Supabase para DeepSeek.
- A chamada externa opcional é no máximo uma, com conteúdo sintético ou público, e somente se uma credencial server-only válida já existir. A ausência da chave não bloqueia testes determinísticos.
- Não ative tracing LangSmith, persistência real, conversas, checkpoints de produção, ferramentas de escrita, região ou deploy.
- O cursor de hierarquia existente é um token AES-256-GCM opaco. Preserve-o sem decodificar, reconstruir ou alterar; HIERARCHY_CURSOR_SECRET deve ser uma Uint8Array server-only de ao menos 32 bytes, igual entre instâncias e sem valor fixo no código. Nunca inclua valores de ambiente na saída do terminal ou nas evidências.

## Verificações

1. Verifique as versões fixas e peer dependencies com o lockfile; use Node 24 ESM.
2. Execute os testes focados do StateGraph real para resposta textual, chamada tipada, recusa, esclarecimento, erro, proposta malformada/desconhecida, budgets e terminal único.
3. Teste ChatDeepSeek com transporte HTTP simulado: deepseek-flash, Chat Completions, thinking desativado, tool schemas, max_tokens, usage, finish_reason, argumentos inválidos, timeout, cancellation e erro seguro.
4. Teste o executor para as seis ferramentas SPEC-004 com handlers sintéticos. Confirme a preservação de UNSUPPORTED_ENTITY, requiresNarrowing, candidatos, hierarquia, cursores AES-256-GCM opacos passados sem alteração, bigint strings e truncamento. Não acesse o Supabase de produto.
5. Teste o endpoint POST /api/agent/turn. Com DEC-001 fechado deve retornar CAPABILITY_DISABLED/403 e demonstrar zero invocações de modelo, repositório e ferramentas. Valide também os status 405/415/400/413 para erros de transporte e o mapeamento de status dos outcomes por meio das capacidades sintéticas de teste.
6. Teste limites: 12 etapas, 3 invocações de modelo, 4 de ferramenta, 15 segundos por chamada de modelo, 5 por ferramenta, deadline 45 segundos, request 8 KiB, response 16 KiB e max_tokens 2.048 quando suportado.
7. Teste que apenas falhas transitórias elegíveis recebem uma tentativa adicional, dentro dos budgets; validação, autorização, domínio, configuração e falhas permanentes não repetem.
8. Teste cancellation com AbortSignal e confirme que nenhuma nova etapa/ferramenta começa após o cancelamento.
9. Use o ledger fake para provar que replay de um efeito sintético concluído não o repete. Não execute mutação no produto.
10. Execute npm test, npm run lint e npm run build. Execute também Node ESM/syntax checks e análise de bundle para provar que api/, server/, provider secrets e cursor secrets não entram nos assets do Vite.
11. Se existir credencial DeepSeek server-only, o smoke opcional pode fazer no máximo uma solicitação sintética, com saída máxima reduzida. Não imprima nem registre a credencial. Caso contrário registre NOT VERIFIED.
12. Registre cada gate com comando, exit code, resultado real e evidência segura no run exato do SDD. Não marque como PASS o smoke opcional ou o deploy que não forem executados.

## Vercel e disponibilidade

Não executar deploy. A verificação local não prova região, plano, domínio, disponibilidade de secrets no projeto Vercel nem identidade server-side. Essas condições permanecem NOT VERIFIED. Mesmo se a função for posteriormente implantada, ela continua fail-closed e não fica disponível a usuários até decisão futura de acesso e dados.

## Critério de conclusão

Todos os gates obrigatórios têm evidência real e passam; o run não tem falha pendente; T035 aprova o snapshot; e o supervisor registra a SPEC e o lote COMPLETED. Os gates DEC-001, DEC-006 global, persistência e mutações continuam no estado restrito.
