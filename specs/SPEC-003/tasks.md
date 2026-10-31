---
description: "Tarefas Draft para SPEC-003@4; execução somente por lote SDD exato aprovado."
---

# Tarefas: SPEC-003@4 — Validação POC no Supabase PostgreSQL

**Entradas**: spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md.
**Pré-requisitos**: SPEC-001@2 e SPEC-002@2 concluídas. SPEC-004@2 fornece contratos de leitura.
**Estado**: Draft; não executar até o manifesto de SPEC-003@4 ser aprovado.

## Fase única — Revalidar implementação existente

- [ ] T001 [sdd_spec_auditor] Revisar somente o código e a evidência existentes contra FR-001–FR-017 e SC-001–SC-007; registrar lacunas concretas em `specs/SPEC-003/checklists/final-audit.md`. Não iniciar mudanças fora deste escopo.
- [ ] T002 [sdd_qa_tests] Executar contratos Node/LangGraph com doubles, incluindo `node --test tests/unit/conversation/checkpoint-resume-adapter.test.js` e testes de lifecycle, deletion recovery, redaction e server boundary; registrar resultados reais.
- [ ] T003 [sdd_qa_tests] Executar `npm test`, `rtk proxy npm run lint` e `npm run build`; registrar skips como NOT VERIFIED, sem tratá-los como passes de integração Node/PostgreSQL.
- [ ] T004 [sdd_supabase_postgres] No projeto Supabase de desenvolvimento autorizado, validar schema, ACL/RLS, constraints e comportamento transacional com fixtures sintéticas via SQL MCP. Confirmar projeto/schema/permissões/marcador antes de writes, usar rollback quando possível e verificar limpeza exata por IDs capturados.
- [ ] T005 [sdd_orchestrator] Atualizar `quickstart.md` e `checklists/acceptance-evidence.md` somente com comandos, resultado e evidência observados neste run; distinguir explicitamente SQL MCP de Node adapter contract tests.
- [ ] T006 [sdd_spec_auditor] Fazer auditoria independente read-only de requisitos, evidência SQL, segurança, cleanup e estado SDD em `specs/SPEC-003/checklists/final-audit.md`.

## Ordem e limites

- Executar T001–T006 em sequência. Não abrir janela de correção para teste que não é obrigatório neste POC.
- O teste `tests/integration/conversation/postgres-adapter.test.js` pode permanecer NOT VERIFIED; não é gate obrigatório desta versão e não pode ser descrito como aprovado.
- Nenhuma tarefa requer Docker, PostgreSQL local, branch de banco, URL de conexão Node para teste ou certificado CA.
- A validação SQL via MCP demonstra comportamento do PostgreSQL, mas não prova que o adapter Node se conectou ao banco.
- DEC-001 permanece fechado. Não expor dados privados, executar agent endpoints, alterar grants/RLS, criar migration ou habilitar runtime privado.
- Se T001 encontrar mudança funcional fora destes limites, interromper e revisar uma nova versão Draft antes de implementação.

## Condição de conclusão

Concluir SPEC-003@4 somente com as seis tarefas executadas no lote aprovado, critérios FR/SC auditados, gates obrigatórios com evidência real, cleanup sem resíduos e auditoria final PASS. Não alegar validação do adapter Node/PostgreSQL se essa conexão não foi exercitada.
