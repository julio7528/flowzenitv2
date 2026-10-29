# Contrato de fonte, representação e chunk — SPEC-008

**Estado**: contrato lógico proposto. Não é endpoint, schema SQL nem autorização para indexar.

## Entrada de leitura tipada

```text
SourceRef = { sourceType: "demand" | "task" | "subtask" | "routine_template", sourceId: DecimalId }
SourceSnapshot = {
  ref: SourceRef,
  sourceExists: boolean,
  entityKind,
  title?: string,
  parent?: SourceRef,
  ancestorPath: SourceRef[],
  metadata: { status?, localDate?, localStart?, localEnd?, weekdays?, validFrom?, validTo? },
  eligibility: eligible | skipped | deleted,
  sourceReadVersion: string
}
```

`routine_template` só será permitida se DEC-007 aprovar a rotina como parte do corpus. Os valores `metadata` são projections do modelo relacional, não verdade independente. Datas e horários mantêm seu formato civil atual e `America/Cuiaba`; não converter para ocorrência UTC. A resposta nunca contém linhas fora do escopo tipado.

## Canonical text

```text
buildRepresentation(snapshot, approvedPolicy)
  -> { canonicalText?, canonicalInputFingerprint, metadataFingerprint,
       inputTemplateVersion, parentChain, disposition, reasonCode? }
```

- `approvedPolicy` contém allowlist e template aprovados em DEC-006/007 e versão de entrada de DEC-011.
- `canonicalText` usa somente texto aprovado. IDs, status, horas, datas, prompts, chat e audit são excluídos por padrão.
- O template pode ser `entity kind + title` ou incluir nomes de ancestrais. A escolha é pendente; nunca combinar árvores diferentes numa única unidade lógica.
- IDs e parent chain persistem como metadados de proveniência. `DecimalId` é string, sem arredondamento JavaScript.
- Normalização e ordenação são determinísticas, Unicode-safe e versionadas. Texto vazio/curto resulta `SKIPPED` com código categórico, nunca provider call vazia.
- O fingerprint do embedding só muda se o texto efetivo ou template aprovado mudar. Metadata fingerprint é independente; status/data/hora por si só não regeneram vetor.
- Mudança de hierarquia atualiza parent metadata. Só altera embedding de descendentes se os nomes/relacionamentos de ancestral participarem do canonical text aprovado.

## Saída de chunk

```text
IndexedChunkInput = {
  sourceRef,
  entityKind,
  parentChain,
  canonicalInputFingerprint,
  metadataFingerprint,
  inputTemplateVersion,
  embeddingVersionId,
  embeddingDimensions,
  embeddingValues,
  sourceReadVersion
}
```

Invariantes:

1. IDs de origem permanecem rastreáveis e entidade/parent chain não se misturam.
2. Vetor e generation identificam modelo + versão + task/instruction + dimensões + template.
3. `embeddingValues.length` deve ser exatamente a dimensão contratada; valores não finitos são inválidos.
4. Gravar só se a revalidação da fonte confirma `sourceExists`, elegibilidade e canonical fingerprint inalterados.
5. O registro nunca determina existência, estado atual, acesso ou mutation target.
6. Não produzir `tsvector`, score RRF ou resposta de usuário; são de SPEC-009.

## Erros estáveis

`ACCESS_DISABLED`, `SOURCE_NOT_FOUND`, `SOURCE_INELIGIBLE`, `EMPTY_CANONICAL_TEXT`, `SOURCE_CHANGED_DURING_EMBEDDING`, `MODEL_VERSION_MISMATCH`, `DIMENSION_MISMATCH`, `NON_FINITE_VECTOR`, `DEPENDENCY_UNAVAILABLE`, `INTERNAL`. Erro não inclui fonte/texto/payload privado ao LLM, log ou DLQ.
