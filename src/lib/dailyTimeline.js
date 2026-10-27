export function timeToMinutes(value) {
  if (!value) return null
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

export function getIntervalError(start, end) {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  if (startMinutes === null || endMinutes === null) return 'Informe o horário de início e de término.'
  if (endMinutes <= startMinutes) return 'O horário de término precisa ser posterior ao início.'
  return ''
}

export function layoutScheduledItems(items) {
  const timedItems = items
    .map((item) => ({ item, start: timeToMinutes(item.hora_inicio), end: timeToMinutes(item.hora_fim) }))
    .filter((entry) => entry.start !== null && entry.end !== null && entry.end > entry.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const groups = []
  let group = []
  let groupEnd = -1
  timedItems.forEach((entry) => {
    if (group.length && entry.start >= groupEnd) {
      groups.push(group)
      group = []
      groupEnd = -1
    }
    group.push(entry)
    groupEnd = Math.max(groupEnd, entry.end)
  })
  if (group.length) groups.push(group)
  return groups.flatMap((overlappingGroup) => {
    const laneEnds = []
    const positioned = overlappingGroup.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.start)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = entry.end
      return { ...entry, lane }
    })
    return positioned.map((entry) => ({ ...entry, laneCount: laneEnds.length, duration: entry.end - entry.start }))
  })
}
