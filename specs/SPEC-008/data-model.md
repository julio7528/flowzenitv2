# Modelo de dados — SPEC-008@2

SPEC-008@2 não cria entidades persistentes. Reusa os contratos da busca SPEC-004, que lê as linhas atuais do PostgreSQL Supabase.

## Entrada
    SearchRequest = {
      text: string limitada,
      kinds?: tipos permitidos,
      statuses?: enum por tipo,
      dateFrom?: data civil,
      dateTo?: data civil,
      parentId?: ID decimal,
      pageSize?: limite configurado,
      cursor?: cursor opaco
    }

A definição integral pertence ao contrato SPEC-004. O agente não fornece SQL, tabela, coluna, expressão PostgREST ou operador.

## Resultado
    SearchResult = {
      sourceType: tipo permitido,
      sourceId: ID persistente em string,
      displayText: texto retornado pela linha atual,
      parentChain: referências tipadas atuais,
      sourceRef: tipo e ID estáveis
    }

## Persistência
Não criar cópia de conteúdo, embedding, tabela de indexação, função SQL, migration ou cache persistente. A consulta direta à fonte corrente faz com que update/delete sejam observados sem sincronização assíncrona.
