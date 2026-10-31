# Contrato de contexto e compactação — SPEC-003@3

**Estado**: construção interna com dados sintéticos; não chama provedor e não habilita endpoint.

## ContextBuild

Inclui conversationId, throughMessageSeq, inputBudget do runtime SPEC-002, itens de contexto completos, omittedThroughMessageSeq opcional, summaryFormatVersion e outcome complete, compacted, needs_clarification ou budget_unavailable.

## Regras

- Verificar MemoryAccessGate antes de acessar transcript/summaries. Gate fechado causa zero chamadas a storage.
- Respeitar o budget e o token/size estimator configurados pelo runtime; nenhum parâmetro de request pode ampliá-lo.
- Selecionar mensagens completas. Nunca cortar JSON, tool result, mensagem ou estrutura no meio. Reservar orçamento para instruções e saída conforme SPEC-002.
- Priorizar mensagens recentes. Marcar sequência omitida; usar summary somente se pertencer à mesma conversa, versão de formato suportada e source interval corresponder ao transcript.
- Summary registra fromMessageSeq, throughMessageSeq, sourceTranscriptVersion e formato. Mensagens novas após throughMessageSeq são adicionadas como delta; summary stale não é anunciado como completo.
- Canonical transcript fica byte-for-byte inalterado. Checkpoint e summary não são apresentados como mensagens.
- Summary é contexto geral, não prova de estado transacional. Estado atual de produto depende da operação tipada SPEC-004.
- Quando nenhum conjunto de mensagens completas cabe, falhar com budget_unavailable/needs_clarification, sem truncamento silencioso ou alegação de memória.
- ContextSummary é derivado e segue o acesso, prazo e deleção da conversa.
- DEC-006 continua proibindo envio de transcript real a DeepSeek, Gemini ou LangSmith. Teste usa summarizer determinístico e fixtures sintéticas.

## Isolamento

Não usar LangGraph Store, embeddings, vector index ou recuperação de outra conversa. Budget, cursor, versão e referências internas não são incluídos em resposta de usuário.
