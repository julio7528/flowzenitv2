# Contrato de histórico de conversa — SPEC-003

**Estado:** contrato interno proposto, Draft. Endpoint/route permanece desabilitado por DEC-001 e DEC-005.

## Request e response

```text
HistoryRequest = {
  conversationId: OpaqueConversationId,
  cursor?: OpaqueHistoryCursor,
  pageSize?: bounded integer
}

HistoryPage = {
  conversationId: OpaqueConversationId,
  messages: [{ messageId, messageSeq, turnId, role, content, createdAt }],
  nextCursor: OpaqueHistoryCursor | null,
  snapshotMaxMessageSeq: integer,
  outcome: "ok" | "empty" | "invalid_id" | "not_found" | "access_disabled" | "unavailable"
}
```

`pageSize` precisa ser validado e limitado por configuração aprovada; nenhum default numérico é fixado nesta SPEC. Conteúdo por message segue allowlist. Ferramentas podem aparecer como role `tool` somente em resumo visível permitido; checkpoint, prompt, tool args/raw result e hidden reasoning nunca aparecem.

## Cursor e ordem

- `messageSeq` é único por conversa, gerado transacionalmente e ordenado ascendente.
- Primeira página guarda `snapshotMaxMessageSeq`; cursor contém versão, limite do snapshot e última sequência devolvida. Páginas seguintes consultam somente `lastMessageSeq < seq <= snapshotMaxMessageSeq`.
- Cursor é opaque para compatibilidade, mas não segredo/autorização. Request com cursor de outra conversa, versão desconhecida ou campos alterados retorna validation/stable failure sem dados.
- Conversa nova retorna `outcome=empty`, `messages=[]`, sem checkpoint false-positive. IDs malformed e IDs desconhecidos têm categorias estáveis, sem SQL/stack details.

## Append e duplicatas

Append de user/final assistant/tool summary inclui `turnId` e idempotency reference do servidor. Retry do mesmo request devolve mensagem/outcome já persistido. Request hash diferente associado à mesma chave retorna conflito e não cria message. Mensagens de turno só são expostas após seu status/resposta estar autorizado/terminal conforme o contrato do endpoint; a decisão de streaming fica em SPEC-002/012.

## Privacidade

Gate DEC-001 antes do repository; ID/cursor não autorizam. Nunca aceitar `ownerId`/role do browser. Não reutilizar dados de SDD, nem retornar graph state ou checkpoint metadata. Logs contêm correlation ID, outcome category, duration e counts allowlisted; sem conteúdo, ids em claro, prompts ou tool results brutos. Persistência de produção permanece bloqueada até DEC-005; provider flow bloqueado até DEC-006.
