# Modelo de políticas e confirmações: SPEC-005

**Status:** modelo técnico proposto em Draft. Não cria tabelas nem aprova a matriz DEC-009.

## Objetos

| Objeto | Campos conceituais | Regra |
| --- | --- | --- |
| `UntrustedSegment` | `sourceKind` (`user|domain|memory|model|provider|web|tool`), conteúdo, `sourceRef?`, proveniência | Todo conteúdo externo ao código/política server-side é dado não confiável. O rótulo ajuda a compor contexto e auditoria, mas não impede sozinho prompt injection. Conteúdo não é registrado em evento de segurança. |
| `ActionIntent` | `operationName`, `operationVersion`, `target`, `validatedPayload`, `canonicalPayload`, `payloadHash`, `preconditionFingerprint`, `correlationId`, `turnId` | Proposta original do modelo não é autorização. Nome, alvo, payload e precondições são validados e recanonicalizados no servidor. |
| `PolicyContext` | capability server-side, estado do gate DEC-001, escopo/alvo, resultado da validação, precondições atuais, matriz DEC-009 aprovada e estado da confirmação | Nenhum campo de request, mensagem ou resposta do modelo cria uma capability confiável. Ausência de política/matriz é deny. |
| `PolicyDecision` | `allow|deny|requireConfirmation`, categoria estável, `policyVersion`, `correlationId`, `grantRef?` | Produzido no servidor imediatamente antes do handler. A categoria devolvida ao usuário não revela regra interna nem detalhe que facilite bypass. |
| `ConfirmationGrant` | `grantId`, `conversationRef`, operação/versão, alvo canônico, hash do payload, fingerprint de precondição, `issuedAt`, `expiresAt`, nonce de uso único, `idempotencyKey` server-side, estado `issued|reserved|consumed|expired|rejected` | Proposta de ciclo de vida. Não contém owner UUID nem prova identidade. TTL, persistência e canal de confirmação permanecem sem decisão até DEC-009 e gates aplicáveis. |
| `IdempotencyReservation` | chave server-side, hash do comando, operação/versão, estado, resultado/ponteiro seguro | Integra com o `ExecutionLedger` da SPEC-002 e com a operação proprietária SPEC-006/007; não cria mecanismo de escrita ou armazenamento nesta SPEC. Mesma chave/hash retorna o estado anterior; chave reutilizada com conteúdo diferente é negada. |
| `GuardrailEvent` | `eventId`, `correlationId`, categoria, regra/classificação, operação (se houver), resultado, timestamp e referência sintética/segura | Tipos previstos: validação benigna, sinal suspeito, ataque confirmado. Detecção automatizada pode emitir sinal suspeito, nunca confirmar ataque por si só. Sem prompts, payloads, segredos, linhas privadas ou resposta do provedor. |
| `ValidatedAnswer` | afirmações, classificação `grounded|inference|unknown`, referências de evidência, estado de ação, texto final sanitizado | Afirmação `grounded` precisa apontar para resultado permitido e existente. Sem fonte, tornar inferência explícita ou pedir esclarecimento; nunca declarar ação concluída sem resultado confirmado pelo executor. |

## Invariantes

- Gate DEC-001, capability de domínio, decisão de política, confirmação necessária e idempotência são verificações separadas. Confirmação não autentica o proprietário nem supera o gate.
- A matriz de risco/confirmação não é modelada como aprovada: até DEC-009 definir uma entrada, operações protegidas/privilegiadas continuam negadas.
- Uma concessão cobre somente a operação e versão, alvo, payload canônico e precondições que o servidor apresentou. Qualquer diferença, expiração ou replay sem estado reconciliável nega a execução.
- A concessão é consumida uma única vez por operação atômica/cas do armazenamento escolhido futuramente. Processo local ou texto como “sim” não substitui estado server-side.
- A reserva idempotente é criada antes do efeito colateral e vinculada ao mesmo comando confirmado; o resultado é persistido antes de o runtime alegar sucesso. Replays recuperam o resultado existente, não chamam o handler novamente.
- Revalidação de schema, alvo e estado de domínio ocorre imediatamente antes da escrita. A regra de domínio final continua com SPEC-006/007 e as constraints existentes.
- Texto do modelo, resultado de classificador, instrução dentro de registro, memória, página web ou tool result nunca altera capability, matriz, alvo aprovado ou política server-side.
- Eventos expõem classificação e correlação suficientes para revisão sem conteúdo sensível. `confirmed_attack` requer evidência confirmada por critério independente ainda sujeito a processo futuro; detector automático não pode promovê-lo.

## Canonicalização

Canonicalização é uma serialização determinística de um DTO já validado, não uma alteração semântica livre de texto. Campos tipados usam formas canônicas do próprio contrato (por exemplo, ID decimal, enum, data ISO, hora local). Propriedades desconhecidas e code/SQL são recusados. Texto livre é preservado como dado e incluído exatamente no hash após validação de tamanho/formato; nenhum texto livre vira alvo, operador, política ou instrução privilegiada. Hash do comando cobre operação, versão, alvo, payload e fingerprint das precondições relevantes.

Não há backend de confirmação escolhido. Uma implementação futura precisa demonstrar consumo atômico, expiração, concorrência, idempotência e retenção aprovada sem alterar decisões existentes.
