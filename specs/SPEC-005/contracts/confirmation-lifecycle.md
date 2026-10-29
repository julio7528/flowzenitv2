# Proposta de contrato para concessão de confirmação — SPEC-005

**Estado:** lifecycle técnico em Draft, sujeito a DEC-009. Não define quais operações exigem confirmação, prazos, UI, armazenamento ou solução de identidade.

## Canonical action

```text
CanonicalAction = {
  conversationRef,
  operationName,
  operationVersion,
  canonicalTarget,
  canonicalPayloadHash,
  preconditionFingerprint,
  policyVersion
}
```

O servidor calcula o payload canônico/hash após validar o DTO e as regras de domínio. A chave não vem do LLM. A impressão de precondições cobre apenas os fatos relevantes à operação e é reavaliada imediatamente antes da execução. Uma confirmação textual dentro da mensagem, registro ou resultado de ferramenta não vale como grant.

## Ciclo proposto

1. **Prepare**: o executor valida intenção, capability DEC-001 e precondições atuais, consulta a matriz DEC-009 e calcula a ação canônica. Se a matriz estiver ausente/pendente, negar a ação. Se a matriz aprovada disser que aquela ação não precisa de confirmação, seguir para reserve/execute sem criar grant; caso exija, criar um desafio server-side com resumo exato do alvo, valores e consequências.
2. **Issue**: `ConfirmationStore.issue(action, summary, expiresAt)` grava estado `issued`, nonce de uso único e chave de idempotência server-side. Retorna apenas referência opaca e conteúdo necessário para a confirmação explícita. Expiração e armazenamento atômico são requisitos, mas seus valores/implementação aguardam DEC-009 e revisão.
3. **Confirm**: cliente envia a referência e escolha explícita em canal a ser definido. A resposta não pode alterar alvo, operação, payload ou precondições; não contém token de identidade. A confirmação não abre o gate DEC-001.
4. **Revalidate/consume**: imediatamente antes do handler, o servidor valida novamente capability, matriz, schema, alvo, payload e estado de domínio. `consumeOnce(grantRef, canonicalAction)` faz transição atômica `issued → reserved`; payload/precondição diferente, expiração, rejeição ou grant consumido não produz side effect.
5. **Reserve/execute**: a chave de idempotência retornada pelo store é reservada no ledger durável da SPEC-002/SPEC-006. Sem confirmação durável e reserva idempotente, negar antes do handler. O handler é a operação tipada da SPEC dona do domínio.
6. **Record/replay**: guardar o resultado seguro antes de continuar o grafo. Nova tentativa com a mesma chave e hash devolve o estado/resultado anterior sem repetir o efeito; mesma chave com hash diferente é conflito. Estado ambíguo não é repetido automaticamente e nunca é descrito como concluído.

## Interface abstrata proposta

```text
ConfirmationStore.issue(canonicalAction, safeSummary, expiryPolicy) -> grantRef
ConfirmationStore.reject(grantRef) -> rejected | alreadyFinal
ConfirmationStore.consumeOnce(grantRef, canonicalAction) -> reserved(idempotencyKey) | expired | mismatch | alreadyConsumed | unavailable

ActionLedger.reserve(idempotencyKey, canonicalActionHash) -> reserved | priorOutcome | conflict | unavailable
ActionLedger.recordOutcome(idempotencyKey, safeOutcomeRef) -> acknowledged | unavailable
```

O store deve garantir consumo atômico sob chamadas concorrentes. Esta SPEC não seleciona Supabase, tabela, transação, KV, cookie, assinatura ou outro backend. A validade temporal e retenção não podem ser inventadas a partir da proposta.

## DEC-009 gate

Nenhuma operação real recebe uma classificação de risco ou regra de confirmação neste contrato. Os testes usam uma matriz sintética versionada somente para provar `allow`, `deny`, `require confirmation`, mudança de payload, alvo/precondição stale, expiração, corrida e replay. Antes de habilitar ações reais, DEC-009 precisa aprovar a matriz por operação e as políticas de validade aplicáveis.
