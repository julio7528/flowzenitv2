# FlowZenit V2 — roadmap de SPECs do agente

**Estado:** catálogo proposto, todas as SPECs em `Draft`, aguardando revisão do usuário. Este documento não registra nem aprova lotes e não autoriza implementação.

**Gate transversal da DEC-001:** preservar a passkey e o caminho de acesso existentes, sem implementar nova autenticação nesta etapa. A passkey client-side não verifica a identidade do proprietário no servidor. Nenhum endpoint do agente pode expor dados privados ou executar operações privilegiadas até que um controle de acesso adequado seja aprovado, implementado e verificado; o mecanismo futuro permanece sem decisão.

## Catálogo

| ID | Foco | Dependências | Risco | Resultado verificável |
| --- | --- | --- | --- | --- |
| `SPEC-001` | Integração do agente com dados e conexão existentes | — | Alto | Preserva o acesso existente e mantém segredos privilegiados fora do frontend; dados privados e operações privilegiadas ficam bloqueados até o gate da DEC-001, sem mecanismo futuro de acesso escolhido. |
| `SPEC-002` | Runtime LangGraph/LangChain e provedor DeepSeek | `SPEC-001`, `SPEC-004` | Alto | Uma conversa percorre estados definidos, usa ferramenta tipada e recupera falhas sem repetir mutações. |
| `SPEC-003` | Memória conversacional e checkpoints persistentes | `SPEC-001`, `SPEC-002` | Alto | Conversas do conjunto de dados de usuário único respeitam retenção, paginação, integridade de checkpoints e exclusão aprovadas. |
| `SPEC-004` | Contratos de domínio e ferramentas de consulta | `SPEC-001` | Alto | Perguntas factuais sobre hierarquia, agenda, status e recorrências retornam registros verificáveis. |
| `SPEC-005` | Guardrails, autorização de ações e confirmações | `SPEC-001`, `SPEC-002`, `SPEC-004` | Crítico | Instruções não confiáveis não ampliam ferramentas; cada ação é autorizada no servidor. |
| `SPEC-006` | Ferramentas de escrita para demandas e planejamento | `SPEC-004`, `SPEC-005` | Crítico | Criar, editar, concluir e reagendar preserva hierarquia, status, idempotência e regras atuais. |
| `SPEC-007` | Interpretação temporal e recorrências | `SPEC-004`, `SPEC-005`, `SPEC-006` | Alto | Datas relativas, horários, recorrências e exceções são interpretados sem ambiguidade nem perda de alocação. |
| SPEC-008 | Fonte lexical do RAG no PostgreSQL Supabase | SPEC-001, SPEC-004 | Médio | Reusa a busca atual sem cópia ou infraestrutura de indexação.
| SPEC-009 | RAG textual e grounding no Supabase | SPEC-001, SPEC-002, SPEC-004, SPEC-008 | Alto | Respostas citadas apoiadas em busca Postgres e leituras exatas.
| `SPEC-010` | LangSmith, tracing e auditoria persistente | `SPEC-001`, `SPEC-002`, `SPEC-005` | Alto | Execuções têm IDs correlacionáveis e eventos seguros, com dados sensíveis redigidos. |
| `SPEC-011` | Dashboard administrativo de observabilidade | `SPEC-010` | Médio | O usuário da aplicação inspeciona execução, estado das integrações e eventos suspeitos pelos mecanismos de acesso existentes. |
| `SPEC-012` | Chat integrado ao FlowZenit | `SPEC-002`, `SPEC-003`, `SPEC-004`, `SPEC-005`, `SPEC-006`, `SPEC-007` | Alto | O proprietário consulta e gerencia dados com histórico, confirmação e feedback acessíveis quando as capacidades protegidas passarem pelo gate da DEC-001. |
| `SPEC-013` | Plataforma de testes e avaliações do agente | `SPEC-001` | Alto | Cada SPEC consegue executar testes isolados de ferramentas, segurança, E2E e regressão de prompts. |
| `SPEC-014` | Ambientes, CI/CD e preparação de release | `SPEC-001`, `SPEC-013` | Alto | Segredos e ambientes ficam isolados e os gates bloqueiam releases sem evidência. Não inclui deploy automático. |
| `SPEC-015` | Tavily como pesquisa externa opcional | `SPEC-002`, `SPEC-005`, `SPEC-010` | Médio | Pesquisa web só ocorre quando habilitada, autorizada e identificada como fonte externa. |

## Ordem técnica recomendada

1. Fundação e gates: `SPEC-001` → `SPEC-013` → `SPEC-014`.
2. Contexto e runtime: `SPEC-004` → `SPEC-002` → `SPEC-005`.
3. Mutação controlada: `SPEC-006` → `SPEC-007`.
4. Memória e recuperação textual: `SPEC-003` e `SPEC-008` (independentes após as dependências) → `SPEC-009`.
5. Operação e interface: `SPEC-010` → `SPEC-011`; `SPEC-012` após as ferramentas e memória necessárias.
6. Pesquisa externa: `SPEC-015`, somente após política de saída de dados e controles de segurança aprovados.

As dependências determinam a ordem; o ID não significa aprovação nem prioridade de lote.

## Lotes futuros sugeridos

- **Lote A — integração e qualidade:** `SPEC-001`, `SPEC-013`, `SPEC-014`.
- **Lote B — consultas e runtime seguro:** `SPEC-004`, `SPEC-002`, `SPEC-005`.
- **Lote C — operações de domínio:** `SPEC-006`, `SPEC-007`.
- **Lote D — memória e recuperação:** `SPEC-003`, `SPEC-008`, `SPEC-009`.
- **Lote E — observabilidade e interface:** `SPEC-010`, `SPEC-011`, `SPEC-012`.
- **Lote opcional:** `SPEC-015`.

Esses agrupamentos são recomendações, não lotes registrados ou autorizados. O usuário escolhe IDs, versões, ordem e aprovação no futuro. SPECs dentro de um lote continuam sequenciais; paralelismo fica restrito a tarefas independentes com arquivos disjuntos.

## Relação com o roadmap anterior

O rascunho `AGENT-001`–`AGENT-010` foi consolidado sem perder cobertura:

| Rascunho anterior | Cobertura nesta versão |
| --- | --- |
| `AGENT-001` ameaça, papéis e segurança | `SPEC-005` |
| `AGENT-002` contratos e consultas | `SPEC-004` |
| `AGENT-003` ferramentas de escrita | `SPEC-006` |
| `AGENT-004` agenda, recorrências e tempo | `SPEC-007` |
| `AGENT-005` LangGraph e provedor | `SPEC-002` |
| `AGENT-006` memória | `SPEC-003` |
| `AGENT-007` busca lexical/vetorial | `SPEC-008`, `SPEC-009` |
| `AGENT-008` guardrails | `SPEC-005` |
| `AGENT-009` observabilidade e dashboard | `SPEC-010`, `SPEC-011` |
| `AGENT-010` Tavily opcional | `SPEC-015` |

Testes por SPEC, interface de chat e CI/CD foram explicitados em `SPEC-013`, `SPEC-012` e `SPEC-014`.
