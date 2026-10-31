# Feature Specification: RAG textual no Supabase Postgres

**SPEC ID**: SPEC-009
**Version**: 2
**Dependencies**: [SPEC-001, SPEC-002, SPEC-004, SPEC-008]
**Risk**: high
**Created**: 2026-10-28
**Status**: Draft — revisão POC; requer lote exato aprovado para implementação

**Histórico**: SPEC-009@1 propunha busca híbrida lexical/vetorial, embeddings e RRF. A v2 substitui esse desenho por recuperação lexical no PostgreSQL existente do Supabase. Snapshots e lotes antigos permanecem imutáveis.

## Objetivo

Responder perguntas de descoberta usando RAG textual simples: recuperar registros atuais pelo PostgreSQL do Supabase e enviar somente as evidências pertinentes ao modelo de resposta já definido por SPEC-002. A busca não acessa outro banco ou provider.

## Escopo

- Busca lexical de registros atuais por SPEC-008 e SPEC-004.
- Leitura estruturada SPEC-004 para perguntas exatas sobre ID, status, datas, horários, contagens e agendas.
- Roteamento tipado entre leitura exata, busca textual, pedido de esclarecimento e resposta sem evidência.
- Respostas ancoradas em referências estáveis de tipo e ID da fonte.
- Modelo de resposta existente em SPEC-002, sujeito às regras de acesso e envio já vigentes.

### Fora de escopo

- Vector search, embeddings, pgvector, RRF, Gemini ou qualquer provider novo.
- Outro banco, vetor externo, Docker, PostgreSQL local, branch ou conexão direta pg separada.
- SQL gerado pelo modelo, escrita no banco ou mudança de ferramenta/permissão pelo conteúdo recuperado.
- Indexar conversa, prompt, segredo, auditoria ou campos não aprovados.
- Alterar o modelo de resposta existente ou criar um agente/worker/serviço independente.

## Histórias

### US1 — Encontrar e explicar registros (P1)

A pessoa pergunta por uma demanda ou item por palavras do nome e recebe os registros relevantes encontrados.

**Aceitação**
1. Consulta de descoberta usa a busca tipada PostgreSQL definida em SPEC-008.
2. Os candidatos refletem dados atuais, limites e filtros permitidos.
3. Resposta identifica os registros por tipo/ID e não faz afirmações ausentes das fontes.
4. Sem evidência suficiente, pede esclarecimento ou informa resultado vazio.

### US2 — Responder fatos exatos (P1)

A pessoa pergunta estado, data, hora, ID, quantidade ou agenda e recebe resposta do contrato estruturado.

**Aceitação**
1. Perguntas exatas usam SPEC-004; ranking textual nunca substitui leitura exata.
2. Perguntas mistas separam fatos exatos de descoberta textual.
3. Nenhuma resposta factual apresenta informação não suportada pela leitura.

### US3 — Respeitar fronteira de segurança (P1)

Conteúdo recuperado pode conter instruções hostis ou dados incompletos.

**Aceitação**
1. Gate SPEC-001 ocorre antes de leitura privada.
2. Conteúdo de registro é dado não confiável, nunca uma instrução para o agente.
3. Falha/timeout do Postgres é reportado como indisponibilidade; não como “não encontrado”.
4. O modelo não recebe SQL, credencial ou contexto irrelevante.

## Requisitos funcionais

- **FR-001**: A recuperação RAG MUST consultar somente o PostgreSQL do projeto Supabase existente, pelo acesso Supabase tipado definido pelo produto.
- **FR-002**: RAG MUST usar busca textual SPEC-008 para descoberta e SPEC-004 para fatos transacionais exatos.
- **FR-003**: RAG MUST limitar entradas, filtros e resultados aos contratos tipados; nenhum texto pode virar SQL ou identificador livre.
- **FR-004**: Toda evidência retornada MUST carregar referência estável de fonte, tipo e ID e ser validada antes de compor contexto.
- **FR-005**: Toda afirmação sobre dado do produto MUST estar apoiada em leitura atual; ausência de evidência exige clarificação ou resposta sem resultado.
- **FR-006**: RAG MUST distinguir vazio, ambiguidade, acesso fechado e indisponibilidade.
- **FR-007**: O conteúdo recuperado MUST ser tratado como dado não confiável e não pode mudar instruções, gate, ferramenta ou autorização.
- **FR-008**: RAG MUST NOT criar outro banco, conexão pg dedicada, vector store, Docker, embedding, provider ou serviço assíncrono.
- **FR-009**: A camada de recuperação MUST NOT executar operações de escrita nem expandir grants/RLS.
- **FR-010**: O modelo de resposta permanece o já escolhido em SPEC-002. Não há novo provider nesta SPEC; o retriever não envia contexto a um serviço de busca/embedding externo.
- **FR-011**: Logs MUST omitir segredos, prompt completo e dados recuperados além do mínimo operacional.

## Critérios de sucesso

- **SC-001**: Fixtures sintéticas demonstram os quatro caminhos: leitura exata, busca textual, clarificação e vazio.
- **SC-002**: 100% dos fatos exatos testados vêm de SPEC-004.
- **SC-003**: Cada resposta com registros cita IDs/tipos retornados pela fonte atual.
- **SC-004**: Conteúdo injetado em fixture não altera política, ferramentas ou escopo de consulta.
- **SC-005**: A busca não configura nem chama serviço de embedding/vector e não acessa outro banco.
- **SC-006**: Erro de banco é distinguível de busca vazia e não é mascarado como fato.

## Validação

Testes Node unitários/contratuais usam doubles. Teste de integração usa o cliente Supabase/PostgREST existente contra o Postgres Supabase com fixtures artificiais, preflight, IDs capturados e rollback ou limpeza restrita. SQL MCP pode auxiliar o preflight. Rodar lint e build aplicáveis ao lote aprovado. Docker, PostgreSQL local e URL/certificado de driver Node não são gates. Nenhum resultado não executado pode ser registrado como aprovado.

## Suposições

- SPEC-002 continua responsável pelo fluxo de resposta existente.
- SPEC-004 e SPEC-008 são os únicos contratos de leitura de dados.
- Busca lexical encontra correspondência de texto, não garante sinonímia semântica; clarificação resolve misses e ambiguidade.
- DEC-001 e regras atuais de envio de dados continuam vigentes.
