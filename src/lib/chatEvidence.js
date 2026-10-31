const SOURCE_LABELS = Object.freeze({
  demand: 'Demanda',
  task: 'Tarefa',
  subtask: 'Subtarefa',
  routine: 'Rotina',
  routine_template: 'Rotina',
  'routine-template': 'Rotina',
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sourceReference(candidate) {
  if (!isRecord(candidate)) return null
  const sourceRef = isRecord(candidate.sourceRef) ? candidate.sourceRef : null
  const sourceType = typeof candidate.sourceType === 'string'
    ? candidate.sourceType
    : sourceRef?.kind
  const sourceId = typeof candidate.sourceId === 'string'
    ? candidate.sourceId
    : (typeof sourceRef?.id === 'string' || typeof sourceRef?.id === 'number')
      ? String(sourceRef.id)
      : null
  const citationRef = typeof candidate.citationRef === 'string'
    ? candidate.citationRef.slice(0, 120)
    : null

  if ((!sourceId || typeof sourceType !== 'string') && !citationRef) return null
  return Object.freeze({
    key: citationRef || `${sourceType || 'source'}:${sourceId}`,
    label: SOURCE_LABELS[sourceType] || 'Fonte',
    citation: citationRef || `${SOURCE_LABELS[sourceType] || 'Registro'} ${sourceId}`,
    displayText: typeof candidate.displayText === 'string'
      ? candidate.displayText.trim().slice(0, 180)
      : '',
  })
}

/** Extract only allowlisted citation fields; returned values are rendered as text. */
export function getChatSourceReferences(evidence) {
  if (!Array.isArray(evidence)) return []
  const references = new Map()

  function visit(value, depth = 0) {
    if (!isRecord(value) || depth > 2 || references.size >= 6) return
    const direct = sourceReference(value)
    if (direct) references.set(direct.key, direct)
    for (const key of ['evidence', 'items']) {
      const children = value[key]
      if (!Array.isArray(children)) continue
      for (const child of children) {
        const nested = sourceReference(child)
        if (nested && references.size < 6) references.set(nested.key, nested)
        if (isRecord(child)) visit(child, depth + 1)
        if (references.size >= 6) break
      }
    }
  }

  for (const item of evidence) {
    visit(item)
    if (references.size >= 6) break
  }
  return [...references.values()]
}
