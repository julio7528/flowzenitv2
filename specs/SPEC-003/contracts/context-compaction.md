# Contrato de contexto e compactação — SPEC-003

**Estado:** estratégia proposta; modelos, limites e divulgação ainda dependem de DEC-005/006/011/012 e SPEC-002.

## Build do contexto

```text
ContextBuild = {
  conversationId,
  throughMessageSeq,
  contextItems: complete message | conversation summary | trusted domain reference,
  inputBudget: approved runtime/provider configuration,
  omittedThroughMessageSeq?,
  summaryFormatVersion?,
  outcome: "complete" | "compacted" | "needs_clarification" | "budget_unavailable"
}
```

- Carregar somente mensagens da conversa selecionada depois do DEC-001 gate.
- Preservar instruções de sistema e budget/reservas do runtime SPEC-002. Escolher mensagens recentes por limites de tokens/bytes configurados; não cortar uma mensagem estruturada no meio.
- Primeiro fallback proposto é uma janela recente mais antiga marcada como omitida. Summary por conversa é opção subsequente, somente após divulgação real aprovada. O summary informa precisamente as sequências cobertas e versão; messages canônicas nunca são reescritas/descartadas pela compactação.
- Priorizar fonte relacional typed atual para status, datas, horas e relações. Summary/checkpoint é contexto auxiliar e não prova fato transacional.
- Sem budget executável, falhar com `budget_unavailable`/pedir esclarecimento; não truncar silenciosamente, ultrapassar limite ou inventar que o agente lembra conteúdo.
- Não gravar em LangGraph Store ou vector index cross-thread nesta SPEC.

## Reprocessamento de summary

Summary é stale se há nova transcript sequence além de `throughMessageSeq`, serializer/formato mudou, dado de origem foi apagado ou a versão de disclosure/provider mudou. Regenerar do transcript segundo DEC-006 ou usar só janela recente. Resumos antigos seguem deleção/retention do mesmo dataset de conversa.

## Privacidade e teste

Não enviar transcript real a Gemini, DeepSeek ou LangSmith sem DEC-006. Em planejamento, doubles trabalham apenas com dados sintéticos. Testes com sentinel verificam que conteúdo não cai em logs, tracing, audit, response erro, provider stub não autorizado ou cliente Vite.
