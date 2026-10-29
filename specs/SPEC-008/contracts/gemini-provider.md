# Contrato do provider de embeddings — SPEC-008

**Estado**: interface proposta, sem SDK, modelo, dimensão ou credencial aprovados. Nenhuma chamada de rede realizada.

## Interface

```text
EmbeddingProvider.embed({
  canonicalText,
  embeddingVersionId,
  requestContext: { correlationId, sourceType, canonicalInputFingerprint },
  signal
}) -> {
  modelId,
  outputDimensions,
  values,
  providerRequestId?
}
```

Adapter config é server-only e versionado. Browser, LLM ou outbox event não escolhem model, task mode, dimensions, endpoint, credential ou provider. O texto vem de `contracts/source-chunk.md` depois da allowlist. Identificadores, metadata de agenda, parents e hashes não são enviados por padrão; DEC-006 deve aprovar exatamente quais dados saem.

## Validação de request

- Recusar chamada real antes do gate DEC-001, DEC-006, DEC-007, DEC-010 e DEC-011.
- Validar tamanho contra o limite do modelo escolhido antes de request; não há truncamento silencioso nem limite numérico selecionado aqui.
- Request usa só texto; modelo multimodal não autoriza incluir outra modalidade.
- `gemini-embedding-001` e `gemini-embedding-2` têm configuração de tarefa/instrução diferente conforme documentação oficial atual; não trocar API shape por fallback silencioso.
- Credencial fica no ambiente seguro do runtime futuro, nunca em Vite/browser, logs, SPEC snapshot ou checkpoint.

## Validação de response

1. HTTP/provider response normaliza para categoria allowlisted; descartar body e headers brutos.
2. `modelId`/versão devem coincidir com descriptor ativo.
3. `values.length` deve coincidir com `outputDimensions` aprovado e tipo vetorial/index compatível.
4. Cada valor deve ser finito; política de normalização deve coincidir com `EmbeddingVersion`.
5. Resposta fora de contrato não grava/ativa vetor; retry apenas conforme classe transitória e limites DEC-010/012.
6. Request ID externo pode ser guardado somente se DEC-006/010 aprovar e com acesso/retention documentados; não salvar texto do request nem response bruta.

## Dimensões e versionamento

Documentação oficial atual de Gemini apresenta modelos estáveis `gemini-embedding-2` e `gemini-embedding-001`, ambos com saída flexível 128–3072 e recomendações 768/1536/3072; modelos/espaços são incompatíveis e migração requer re-embedding. pgvector/Supabase documenta limites de índice ANN por tipo: `vector` até 2000 dimensões e `halfvec` até 4000 para versões compatíveis. Esses valores tornam dimension/type/opclass um único contrato: dimensão aceita pelo provider não garante suporte ao índice físico escolhido.

Nenhuma dimensão é preferida ou aprovada neste contrato. DEC-011 precisa validar modelo e version pattern atual, dimensão, qualidade/custo em corpus sintético, tipo vetorial, opclass/operator e versão pgvector disponível. Ao implementar, reconsultar [Gemini Embeddings](https://ai.google.dev/gemini-api/docs/embeddings), [Supabase vector indexes](https://supabase.com/docs/guides/ai/vector-indexes) e [pgvector](https://github.com/pgvector/pgvector).

## Erros estáveis

`ACCESS_DISABLED`, `INPUT_NOT_APPROVED`, `INPUT_TOO_LARGE`, `RATE_LIMITED`, `TIMEOUT`, `NETWORK_ERROR`, `PROVIDER_UNAVAILABLE`, `MODEL_MISMATCH`, `DIMENSION_MISMATCH`, `INVALID_VECTOR`, `CONFIGURATION_ERROR`, `INTERNAL`. Mensagem exibível é genérica; segredo, payload, texto, provider body ou vetor nunca são divulgados.

## Test double

Fake determinístico recebe synthetic canonical text e retorna vetores fixos de dimensão de fixture. Deve permitir forçar timeout, rate-limit, malformed response, dimensão incompatível e valores não finitos. Contract/security tests provam que com gate fechado zero chamadas saem do adapter e que os payloads respeitam um allowlist sintético. Test double não é evidência de compatibilidade real com Gemini.
