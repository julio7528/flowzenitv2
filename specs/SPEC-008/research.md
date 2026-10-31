# Pesquisa técnica — SPEC-008@2

**Estado**: documentação Draft; não afirma teste remoto executado.

## Baseline
O checkout já tem ferramenta searchItems e repositório Supabase que faz substring literal com PostgREST ILIKE; testes de contrato cobrem escaping de curingas. Esse caminho já consulta o PostgreSQL hospedado pelo Supabase e é suficiente para busca inicial em uma POC pequena.

Adicionar FTS, GIN, função SQL, tabela derivada ou indexador aumenta schema e manutenção sem necessidade demonstrada. Esta revisão mantém o caminho existente e testa sua integração com RAG.

## Limites
- Dados atuais do PostgreSQL Supabase são a única fonte.
- SPEC-004 determina texto, filtros, limites e escaping.
- SPEC-001 determina o gate antes de leitura privada.
- SPEC-002 mantém o modelo de resposta.
- Um teste Supabase/MCP valida comportamento do banco; não prova conexão TCP do driver pg.

## Evidência pendente
O lote deve comprovar o fluxo com fixtures sintéticas: busca, filtros, caracteres especiais, atualização, exclusão, erro e provenance. Nada nesta pesquisa afirma que esses testes ocorreram.
