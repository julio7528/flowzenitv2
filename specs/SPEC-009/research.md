# Pesquisa técnica — SPEC-009@2

**Estado**: pesquisa documental Draft; avaliação sintética e integração ainda pendentes para o lote.

## Direção para a POC
A busca textual reutiliza searchItems de SPEC-004 no PostgreSQL Supabase. Perguntas sobre status, data, hora, ID, quantidade ou agenda usam leituras estruturadas SPEC-004, que são mais exatas do que ranking lexical.

Não há requisito para embeddings ou busca híbrida nesta POC: os nomes atuais são curtos e não há evidência de que vetor compense complexidade/custo. Quando texto não encontra item, clarificação é uma resposta válida.

## Composição
O agente valida intenção e filtros, executa apenas ferramentas tipadas, valida provenance e envia evidência mínima ao modelo já escolhido por SPEC-002. Conteúdo retornado é dado não confiável. Gate SPEC-001 e controles atuais para enviar dados ao modelo permanecem ativos.

## Contratos internos
A busca textual e seus limites estão documentados no contrato searchItems de SPEC-004. A POC reutiliza o comportamento existente via cliente Supabase/PostgREST; não adiciona Full Text Search nem outro mecanismo de recuperação.

## Limitações
Esta pesquisa não prova disponibilidade do serviço/projeto, latência ou qualidade de recuperação nem afirma teste remoto. Fixtures sintéticas devem cobrir acento, hierarquia, pergunta exata, ambiguidade, vazio, indisponibilidade e texto hostil.
