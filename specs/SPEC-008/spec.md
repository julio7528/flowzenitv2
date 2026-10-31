# Feature Specification: Fonte lexical do RAG no Supabase Postgres

**SPEC ID**: SPEC-008
**Version**: 2
**Dependencies**: [SPEC-001, SPEC-004]
**Risk**: medium
**Created**: 2026-10-28
**Status**: Draft — revisão POC; requer lote exato aprovado para implementação

**Histórico**: SPEC-008@1 propunha Gemini, embeddings, pgvector, outbox e worker. A v2 substitui esse desenho pelo uso da busca textual existente de SPEC-004 sobre o PostgreSQL atual do Supabase. Snapshots e lotes v1 permanecem imutáveis.

## Objetivo

Definir como o RAG localiza registros por texto usando somente os dados atuais do Postgres do Supabase, sem criar infraestrutura de indexação. Reutilizar o contrato de busca existente e preservar o conteúdo, filtros e proveniência definidos em SPEC-004.

## Escopo

- Usar searchItems de SPEC-004, que consulta o Postgres atual pelo cliente Supabase/PostgREST já existente.
- Restringir texto, tipos, filtros, limites e campos aos DTOs já definidos por SPEC-004.
- Retornar apenas dados atuais com ID persistente, tipo e referência de hierarquia.
- Validar o comportamento de busca com fixtures sintéticas no projeto Supabase de desenvolvimento.

### Fora de escopo

- Docker, PostgreSQL local, branch/segundo banco ou conexão direta pg separada.
- Gemini, embeddings, pgvector, RRF, vetor externo, FTS adicional, outbox, fila, worker, backfill ou cópia de índice.
- Nova função SQL, migration, tabela ou alteração de schema/grants/RLS.
- Indexar transcrições, prompts, credenciais, auditoria ou campos fora do contrato SPEC-004.
- Substituir o modelo de resposta existente em SPEC-002.

## Histórias e critérios

### US1 — Encontrar registros por texto (P1)

A pessoa informa palavras do nome e recebe itens correspondentes para identificar o registro certo.

**Teste independente**: usar fixtures sintéticas no projeto Supabase e verificar texto, filtros, IDs, tipo e hierarquia.

**Aceitação**:
1. A consulta usa somente searchItems e os campos aprovados em SPEC-004.
2. Texto é substring literal, com escaping e limites previstos por SPEC-004; não pode ser SQL, tabela ou filtro arbitrário.
3. Cada resultado representa a linha atual do Supabase e preserva sua referência de origem.
4. Atualização e exclusão são refletidas na consulta seguinte, sem processo de sincronização.

### US2 — Apoiar resposta (P1)

Descoberta textual sugere registros; status/data/ID/contagem/agenda continuam sendo fatos exatos lidos por SPEC-004.

**Aceitação**:
1. Resultado lexical não substitui consulta factual estruturada.
2. O contexto contém referências estáveis de tipo e ID.
3. Sem evidência suficiente, o agente pede esclarecimento ou informa que não encontrou registro.

## Requisitos funcionais

- **FR-001**: Postgres do projeto Supabase existente MUST ser a única fonte de dados do RAG.
- **FR-002**: SPEC-008 MUST reutilizar a consulta atual searchItems de SPEC-004, sem criar um caminho de busca separado.
- **FR-003**: Entradas, filtros e limites MUST obedecer aos DTOs validados; nenhuma entrada fornece SQL, tabela, coluna ou operador.
- **FR-004**: Resultados MUST conter tipo, ID persistente e provenance atuais conforme SPEC-004.
- **FR-005**: Atualização/exclusão da fonte MUST aparecer na consulta seguinte, sem cópia ou worker.
- **FR-006**: O gate SPEC-001 MUST ocorrer antes da leitura privada.
- **FR-007**: Fatos exatos continuam em SPEC-004; conteúdo encontrado é dado não confiável.
- **FR-008**: Docker, banco local/segundo, conexão pg separada, embedding, Gemini, pgvector, RRF, FTS adicional, migration, tabela, outbox e worker NÃO são requisitos desta POC.
- **FR-009**: A execução MUST preservar schema, migrations, grants e RLS existentes.
- **FR-010**: Logs/erros MUST omitir credenciais, prompts completos e conteúdo privado desnecessário.

## Critérios de sucesso

- **SC-001**: Fixtures sintéticas demonstram consulta e provenance correta pela busca SPEC-004.
- **SC-002**: Atualização e exclusão sintéticas são refletidas na próxima consulta.
- **SC-003**: Inputs não podem injetar SQL nem alterar tipo, coluna ou filtro fora do DTO.
- **SC-004**: O fluxo usa zero bancos auxiliares e zero provedores de embedding.
- **SC-005**: Nenhum fato exato é inferido só pelo ranking/ordem textual.

## Validação

Node unit/contract tests usam doubles para validar o contrato. A consulta de integração obrigatória usa o cliente Supabase/PostgREST existente contra o projeto de desenvolvimento com fixtures sintéticas, preflight e limpeza delimitada. SQL MCP pode auxiliar o preflight, mas não substitui o teste do caminho de runtime. Rodar lint e build aplicáveis. Teste de conexão TCP direta de Node, URL/certificado, Docker e banco local não são gates. Evidência não executada fica NOT VERIFIED.

## Suposições

- SPEC-004 já define a busca literal em demanda e os limites/filtros permitidos.
- SPEC-002 mantém o modelo de resposta escolhido; SPEC-008 não adiciona provider.
- Busca por substring não promete sinonímia ampla; a experiência pode pedir reformulação.
