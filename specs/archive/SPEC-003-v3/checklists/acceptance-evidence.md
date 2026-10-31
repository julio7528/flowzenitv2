# Evidências de aceitação — SPEC-003@3

**Lote:** `c60f876e-0e5a-475c-8e5a-d8dcf0aaa557`
**Manifesto:** `2721f8fbccc12d34a0cfd5c5934de40668bc44fdb5a769e732e05fdc291d801e`
**Run:** `d83c6b74-1ced-4e1b-b45d-978c8c6191e4`
**Snapshot:** `5017206ada784abdabdf62adfc46a174dcd97fe2d8350a62227321c7425ef590`

Os estados abaixo refletem testes e evidências registrados no SDD. `PASS` significa que o comportamento indicado foi exercitado. Verificações opcionais ausentes são listadas separadamente como `NOT VERIFIED`; não são inferidas como aprovadas.

## Requisitos funcionais

| Requisito | Estado | Evidência executada |
| --- | --- | --- |
| FR-001 — conversa, mensagens, checkpoints e resumo pertencem a uma única conversa opaca, sem identidade de proprietário adicional | PASS | Migration `conversation_private`; `tests/contracts/conversation/artifact-separation.test.js`; `tests/unit/conversation/conversation-contracts.test.js` |
| FR-002 — validar IDs sem tratá-los como autorização; gate fechado antes de chamadas privadas | PASS | `tests/unit/conversation/access-gate.test.js`; `tests/security/conversation/conversation-private-access.test.js`; `tests/security/conversation/server-boundary.test.js` (4/4, zero chamadas privadas) |
| FR-003 — papéis canônicos, sequência monotônica e histórico paginado, padrão 50/máximo 100 | PASS | `tests/unit/conversation/history-cursor.test.js`; `tests/integration/conversation/history-concurrency.test.js` |
| FR-004 — checkpoint separado com thread, versões, turno, correlação, namespace e integridade | PASS | `tests/unit/conversation/checkpoint-envelope.test.js`; `tests/contracts/conversation/checkpoint-resume.test.js`; `tests/unit/conversation/checkpoint-resume-adapter.test.js` (3/3); migration/PostgresSaver 1.1.2 no PostgreSQL 17.11 |
| FR-005 — rejeitar checkpoint ausente, expirado, corrompido, incompatível ou ledger inconclusivo antes de ferramenta | PASS | `tests/integration/conversation/resume-fail-closed.test.js`; `tests/contracts/conversation/checkpoint-resume.test.js`; `tests/unit/conversation/checkpoint-resume-adapter.test.js` |
| FR-006 — classificação separada e DTO JSON de exportação canônico, sem endpoint | PASS | `tests/unit/conversation/conversation-contracts.test.js` (8/8: versão, cursor, campos privados, conversa e snapshot); `tests/security/conversation/conversation-private-access.test.js` confirma ausência de endpoint de histórico/exportação |
| FR-007 — não registrar transcrições, prompts, checkpoints ou payloads privados em logs/traces | PASS | `tests/contracts/conversation/redaction.test.js`; `tests/security/conversation/server-boundary.test.js`; testes de redaction do runtime em `npm test` |
| FR-008 — `dec005-spec003-v1`, expiração de 365 dias para histórico e 30 dias para checkpoint; purge manual | PASS | `tests/security/conversation/maintenance-target.test.js` (6/6); `tests/contracts/conversation/lifecycle.test.js` (11/11); regressão de timestamp estável; rotina manual sem scheduler presumido |
| FR-009 — exclusão bloqueia acesso/escrita, reconcilia turnos, remove artefatos e recupera após falha | PASS | `tests/contracts/conversation/lifecycle.test.js`; `tests/integration/conversation/deletion-race.test.js`; `tests/integration/conversation/deletion-recovery.test.js` (1/1); transação sintética real via SQL MCP preservou `deleting` após falha e limpou zero resíduos após retry |
| FR-010 — vazio explícito e cursor opaco, vinculado à conversa/tamanho/snapshot e íntegro | PASS | `tests/unit/conversation/history-cursor.test.js`; `tests/security/conversation/history-cursor.test.js`; `tests/integration/conversation/history-concurrency.test.js` |
| FR-011 — cobrir IDs/cursors, replay, concorrência, retenção, exclusão, redaction e gate fechado | PASS | `npm test` (235 aprovados, 0 falhos, 2 skips anotados); `tests/security/conversation/server-boundary.test.js` |
| FR-012 — cancelamento/reconciliação de turnos, falha parcial, checkpoint stale e ledger incerto | PASS | `tests/contracts/conversation/lifecycle.test.js`; `tests/integration/conversation/deletion-race.test.js`; `tests/integration/conversation/deletion-recovery.test.js`; `tests/integration/conversation/resume-fail-closed.test.js` |
| FR-013 — contexto dentro do orçamento SPEC-002, mensagens inteiras e transcript canônico imutável | PASS | `tests/unit/conversation/context-builder.test.js`; `tests/integration/conversation/context-compaction.test.js`; `tests/contracts/conversation/artifact-separation.test.js` |
| FR-014 — resumo derivado, versionado, limitado à conversa e sem autoridade transacional | PASS | `tests/integration/conversation/context-compaction.test.js`; `tests/contracts/conversation/artifact-separation.test.js` |
| FR-015 — preflight valida vínculo, versões, digest, expiração e ledger | PASS | `tests/contracts/conversation/checkpoint-resume.test.js`; `tests/integration/conversation/resume-fail-closed.test.js`; testes do adapter PostgresSaver |
| FR-016 — turnos idempotentes e serializados; exclusão impede novos writes e não repete efeito concluído | PASS | `tests/integration/conversation/idempotency-race.test.js`; `tests/integration/conversation/history-concurrency.test.js`; `tests/integration/conversation/deletion-recovery.test.js`; testes do ledger |

## Critérios de sucesso

| Critério | Estado | Evidência executada |
| --- | --- | --- |
| SC-001 — IDs inválidos/desconhecidos/expirados retornam resultado estável sem vazamento | PASS | `tests/unit/conversation/history-cursor.test.js`; `tests/integration/conversation/resume-fail-closed.test.js`; `tests/security/conversation/conversation-private-access.test.js` |
| SC-002 — páginas sem duplicatas e com snapshot original determinístico | PASS | `tests/integration/conversation/history-concurrency.test.js`; `tests/security/conversation/history-cursor.test.js` |
| SC-003 — checkpoint corrompido/incompatível bloqueia ferramenta pendente | PASS | `tests/integration/conversation/resume-fail-closed.test.js`; `tests/contracts/conversation/checkpoint-resume.test.js` |
| SC-004 — exclusão concluída deixa zero artefatos recuperáveis no escopo | PASS | PostgreSQL T027/T018/T033 via Supabase SQL MCP; `tests/integration/conversation/deletion-race.test.js`; `tests/integration/conversation/deletion-recovery.test.js`; contagens finais zero |
| SC-005 — contexto dentro do orçamento e transcript sem alteração após compactação | PASS | `tests/unit/conversation/context-builder.test.js`; `tests/integration/conversation/context-compaction.test.js`; `tests/contracts/conversation/artifact-separation.test.js` |
| SC-006 — replay concorrente cria um único turno e não repete efeito concluído | PASS | `tests/integration/conversation/idempotency-race.test.js`; `tests/contracts/conversation/spec-002-ports.test.js` |
| SC-007 — checkpoint expirado/corrompido/incompatível/ledger inconclusivo impede ferramenta, sem expirar o histórico junto | PASS | `tests/integration/conversation/resume-fail-closed.test.js`; `tests/contracts/conversation/checkpoint-resume.test.js`; `tests/security/conversation/maintenance-target.test.js` |

## Gates e verificação de banco

Gates obrigatórios registrados como `PASSED` no SDD: `npm-test`, `lint`, `vite-build`, `server-boundary-bundle`, `checkpoint-adapter-contract`, `export-contract`, `retention-lifecycle`, `deletion-recovery` e `postgresql-synthetic`, `acceptance-evidence-table`.

- `npm test`: exit 0; 235 aprovados, 0 falhos, 2 ignorados. Os skips são o teste Node que requer `CONVERSATION_TEST_DATABASE_URL` verificada e o contrato opcional Supabase da SPEC-004, fora deste lote.
- Lint: `rtk proxy npm run lint`, exit 0, sem diagnósticos.
- Build: `npm run build`, exit 0; Vite transformou 165 módulos.
- Bundle/segurança: `node --test tests/security/conversation/server-boundary.test.js`, exit 0, 4/4.
- Banco: projeto `flowzenithv2` / `twikxeloeftczwbpjvzr`, PostgreSQL 17.11.0.003; migration `20261029204848_spec003_conversation_memory.sql`; dez tabelas PostgresSaver privadas, versões de migration 0–5, RLS habilitado, nenhuma policy aberta e sem grants de schema/tabelas para `anon`, `authenticated` ou `service_role`.
- Fixtures sintéticas T027, T018 e T033 foram removidas por IDs exatos; as verificações finais registraram zero conversas, mensagens, reservas, resumos, envelopes, checkpoints, blobs, writes e operações de exclusão das fixtures.

## Verificações não habilitadas

| Verificação | Estado | Motivo e efeito |
| --- | --- | --- |
| `node --test tests/integration/conversation/postgres-adapter.test.js` com conexão direta PostgreSQL | NOT VERIFIED | O teste foi executado, mas ficou SKIPPED porque `CONVERSATION_TEST_DATABASE_URL` não está verificada no checkout. Não foi contado como aprovação. A prova de banco real foi feita separadamente por SQL MCP no projeto fixado, junto com os testes de adapter com doubles. |
| Contrato PostgREST opcional da SPEC-004 | NOT VERIFIED nesta execução | A variável opt-in não foi habilitada; esta SPEC não criou dados da SPEC-004. |
| Scheduler/worker periódico de retenção | NOT VERIFIED | Nenhum scheduler/worker de produção foi configurado ou presumido; a limpeza é manual e a expiração também é aplicada na leitura. |
| Acesso privado para usuários e exportação por endpoint | NÃO HABILITADO por decisão | DEC-001 continua fechada; a implementação não é apresentada como disponível ao usuário final. |

Nenhuma evidência acima abre DEC-001, ativa tracing externo, envia conteúdo real a provedores ou declara deploy/produção validados.
