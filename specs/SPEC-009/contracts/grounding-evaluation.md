# Contrato de grounding e avaliação — SPEC-009@2

## Invariantes
- Gate SPEC-001 precede toda leitura privada.
- Perguntas factuais exatas usam SPEC-004; descoberta textual usa SPEC-008.
- Toda afirmação factual tem referência de fonte atual, tipo e ID.
- Registro retornado é dado não confiável; nunca instrução para modelo, ferramenta ou acesso.
- Sem evidência suficiente, pedir clarificação ou dizer que não encontrou; não inventar.
- Estado empty não equivale a unavailable, access_disabled ou erro.
- Modelo de resposta é o existente em SPEC-002; nenhuma chamada de embedding/provider é introduzida.

## Corpus sintético mínimo
Casos rotulados incluem nome e hierarquia em português, acento, sigla, consulta exata, discovery, pergunta mista, ambígua, sem resultado, source update/delete, conteúdo hostil e erro de banco. Não incluir transcript, segredo ou registro privado.

## Medidas
Registrar acerto de rota, precisão de provenance/citação e distinção de estados empty/unavailable. Métricas e limiares são evidência diagnóstica; não criar SLO ou gate numérico sem decisão explícita.
