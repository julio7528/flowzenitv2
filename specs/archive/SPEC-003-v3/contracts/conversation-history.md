# Contrato de histórico de conversa — SPEC-003@3

**Estado**: contrato interno aprovado para implementação e fixtures sintéticas. Nenhum endpoint privado fica habilitado.

## Request e response

HistoryRequest contém conversationId, cursor opcional e pageSize opcional. ID é UUID opaco e validado; não autentica.

HistoryPage contém conversationId, mensagens canônicas, nextCursor ou null, snapshotMaxMessageSeq e outcome: ok, empty, invalid_id, not_found, access_disabled, expired ou unavailable.

Cada mensagem tem messageId, messageSeq, turnId, role, content allowlisted e createdAt. Checkpoints, resumos, prompts ocultos, argumentos/resultados privados de tool e reasoning não são messages.

## Paginação e cursor

- pageSize default 50; valores válidos de 1 a 100.
- Ordem ascendente e determinística por messageSeq.
- Primeira página captura snapshotMaxMessageSeq. Cursor inclui versão, conversationId, pageSize, snapshot máximo e última sequência devolvida.
- Cursor é codificado opacamente e autenticado por HMAC-SHA-256 usando chave server-only injetada de pelo menos 32 bytes; comparação timing-safe.
- Cursor de outra conversa, tamanho diferente, formato/versão inválida ou MAC incorreto falha antes da consulta de conteúdo.
- Continuação consulta lastMessageSeq < messageSeq <= snapshotMaxMessageSeq.
- O cursor não é autorização. Gate DEC-001 antecede validação com storage e toda leitura.
- Novas mensagens acima do snapshot ficam para uma nova paginação; não se promete snapshot MVCC entre requisições. Conversa expirada/deleting falha fechada mesmo com cursor válido.

## Append e idempotência

Turn request tem idempotencyKey server-side e hash canônico do payload. Mesma chave e mesmo hash retorna o turno/mensagens já persistidos; mesmo identificador com hash diferente resulta em conflict seguro. Reserva, message sequence, append e renovação de last_activity_at são serializados em transação por conversa.

Mensagens visíveis só incluem user, assistant final e tool summary explicitamente allowlisted. Redação de tool não expõe payload bruto ou estado oculto. Erros e logs contêm apenas outcome category e correlation segura.

## Export e privacidade

Export DTO interno é objeto JSON versionado com conversation metadata mínima e mensagens canônicas paginadas/ordenadas. Exclui credentials, hidden reasoning, checkpoint bruto, ledger refs privadas, tool payloads e summaries apresentados como transcript. Não há route ou endpoint export sob DEC-001 fechado.

ConversationId, request ID e cursor não autenticam. Não aceitar ownerId/role do browser. Com DEC-001 fechado, retornar access_disabled antes de qualquer operação privada.
