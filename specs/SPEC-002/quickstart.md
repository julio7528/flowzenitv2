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

## Resultados observados — execução autorizada

Run SDD: `1bc2a7f8-68b8-4dd3-b5c2-0f8ebe0cc28e`, lote `8b693128-c9e4-47a7-ac87-35c07dcdaa2f`, snapshot `608143f34eb680c5ec337f88776fde2e9e691dc71679c2dcad3ef03589cb7e59`.

| Verificação | Comando | Resultado observado |
| --- | --- | --- |
| Runtime | `node --version` | Exit 0; Node `v24.13.0`. |
| Testes focados de runtime, modelo, integração e segurança | `node -e "const {spawnSync}=require('node:child_process'); const files=['tests/unit/agent/graph-routing.test.js','tests/unit/agent/retry-policy.test.js','tests/contracts/agent/turn-flow.test.js','tests/contracts/agent/cancellation-and-bounds.test.js','tests/contracts/agent/replay.test.js','tests/contracts/agent/replay-versioning.test.js','tests/contracts/agent/model-adapter.test.js','tests/security/agent/tool-proposals.test.js','tests/security/agent/safe-terminal-events.test.js','tests/security/agent/redaction.test.js','tests/security/agent/executor-ledger.test.js','tests/security/agent/durability-gate.test.js','tests/security/agent/client-boundary.test.js','tests/security/agentNoPrivateAccess.test.js']; const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'}); process.exit(r.status??1)"` | Exit 0; 74 aprovados, 0 falhas, 0 ignorados. |
| Testes completos | `npm test` | Exit 0; 144 no total, 143 aprovados, 0 falhas, 1 ignorado. O teste ignorado é a verificação PostgREST opcional que exige `RUN_SPEC004_SUPABASE_CONTRACT=1`; nenhum banco de produto foi acessado. |
| Lint | `rtk proxy npm run lint` | Exit 0; Oxlint passou sem diagnósticos. A execução inicial por `npm run lint` apresentou erro de parsing da saída pelo wrapper RTK; o comando via proxy executou o lint real. |
| Build cliente | `npm run build` | Exit 0; Vite 8.3.5 transformou 165 módulos. |
| Bundle server-side e sintaxe ESM | `node --input-type=module -e "const {build}=await import('vite'); const {spawnSync}=await import('node:child_process'); const result=await build({configFile:false,build:{ssr:'api/agent/turn.js',write:false,rollupOptions:{external:['@langchain/core','@langchain/deepseek','@langchain/langgraph','@supabase/supabase-js','zod']}}}); const outputs=Array.isArray(result)?result:[result]; const chunks=outputs.flatMap(o=>o.output.filter(i=>i.type==='chunk')); if(!chunks.length) throw Error('no SSR chunks'); for(const chunk of chunks){const check=spawnSync(process.execPath,['--input-type=module','--check','-'],{input:chunk.code,encoding:'utf8'});if(check.status!==0) throw Error(check.stderr||'ESM syntax failed');} console.log(JSON.stringify({chunks:chunks.map(c=>c.fileName),syntax:'passed',emittedToDisk:false}));"` | Exit 0; 8 módulos transformados, chunk `turn.js` validado como ESM e nenhuma saída escrita em disco. |

Os testes focados exercitam o StateGraph real, o adaptador DeepSeek com transporte simulado, os seis contratos sintéticos SPEC-004, limites/cancelamento, replay/ledger, respostas seguras, isolamento do cliente e negação de acesso privado. O teste opcional com dados sintéticos no DeepSeek não foi executado (`NOT VERIFIED`); deploy e região de produção também seguem `NOT VERIFIED`.

## Vercel e disponibilidade

Não executar deploy. A verificação local não prova região, plano, domínio, disponibilidade de secrets no projeto Vercel nem identidade server-side. Essas condições permanecem NOT VERIFIED. Mesmo se a função for posteriormente implantada, ela continua fail-closed e não fica disponível a usuários até decisão futura de acesso e dados.

## Critério de conclusão

Todos os gates obrigatórios têm evidência real e passam; o run não tem falha pendente; T035 aprova o snapshot; e o supervisor registra a SPEC e o lote COMPLETED. Os gates DEC-001, DEC-006 global, persistência e mutações continuam no estado restrito.
