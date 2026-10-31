# Plano técnico: RAG textual no Supabase Postgres

**SPEC ID**: SPEC-009 | **Versão**: 2 | **Status**: Draft
**Manifest hash**: atribuído somente ao registrar lote | **Spec**: [spec.md](spec.md)

## Resumo
O agente identifica intenção e segue um caminho tipado. Fatos exatos usam SPEC-004; descoberta por texto usa SPEC-008 no PostgreSQL Supabase; evidência aprovada forma o contexto para o modelo de resposta já existente em SPEC-002. Uma única fonte de dados, sem vetor, provider de embeddings, banco paralelo ou serviço novo.

## Fluxo

1. Executar gate SPEC-001 antes de leitura privada.
2. Validar consulta e limitar tipo/filtros/quantidade.
3. Roteamento: ID/status/data/hora/count/agendas usam SPEC-004; descoberta textual usa SPEC-008; mistura divide a intenção; dúvida pede esclarecimento.
4. Validar provenance e atualidade dos resultados contra as leituras permitidas.
5. Montar contexto curto com referência de tipo e ID.
6. Passar evidência ao modelo existente em SPEC-002, respeitando seus gates de privacidade.
7. Se fonte falha, informar indisponibilidade; se não há resultado, informar vazio ou pedir clarificação.

## Fronteiras
- Único banco: PostgreSQL do projeto Supabase existente.
- Acesso: interface tipada existente e SPEC-008; sem conexão pg independente.
- Nunca aceitar SQL, tabela, coluna ou política da saída do modelo.
- Conteúdo recuperado é input não confiável; não autoriza tools nem escrita.
- Resposta é gerada pela configuração já existente em SPEC-002; não adicionar provider.
- Nenhuma mudança em grant/RLS, autenticação, schema de produção ou deploy fora do lote autorizado.

## Testes e evidência
Usar fixtures sintéticas. Unit/contract tests Node exercitam roteamento e grounding com doubles. A chamada de integração via cliente Supabase/PostgREST demonstra a busca real após preflight e captura de IDs, com rollback/limpeza; SQL MCP pode auxiliar o preflight. Rodar lint e build aplicáveis. Sem Docker, banco local, URL/cert Node ou mock que substitua a chamada real pelo cliente Supabase.

## Dependências
- SPEC-001: gate de acesso.
- SPEC-002: runtime/resposta existente.
- SPEC-004: leituras estruturadas e provenance.
- SPEC-008: recuperação lexical no PostgreSQL.

## Políticas de gate
| Gate | Regra |
|---|---|
| Conexão direta Node pg | Não requerida nesta versão; registrar NOT VERIFIED se não executada. |
| Cliente Supabase/PostgREST com fixtures sintéticas | Obrigatório para validar o caminho de runtime. |
| SQL MCP | Opcional para preflight; não substitui a chamada pelo cliente Supabase. |
| Teste de conteúdo real enviado ao modelo | Não executar sem os gates de privacidade/provider já vigentes. |
