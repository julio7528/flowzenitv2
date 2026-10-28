import { timeToMinutes } from './dailyTimeline.js'

function minutesToTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0 || totalMinutes > 24 * 60) return ''
  if (totalMinutes === 24 * 60) return '24:00'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function addHoursToTime(start, hours) {
  const startMinutes = timeToMinutes(start)
  const duration = Number(hours)
  if (startMinutes === null || !Number.isFinite(duration) || duration <= 0) return ''

  const endMinutes = startMinutes + Math.round(duration * 60)
  if (endMinutes >= 24 * 60) return ''
  return minutesToTime(endMinutes)
}

export function getRoutineEndTime(routine) {
  if (routine?.hora_fim) return String(routine.hora_fim).slice(0, 5)
  const startMinutes = timeToMinutes(routine?.hora)
  if (startMinutes === null) return ''
  return minutesToTime(Math.min(24 * 60, startMinutes + 60))
}

export function getDurationHours(start, end) {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return null
  return (endMinutes - startMinutes) / 60
}

export function formatDurationHoursInput(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return ''
  return String(Number(hours.toFixed(2)))
}

export function formatDurationLabel(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return 'Duração não definida'
  const totalMinutes = Math.round(hours * 60)
  const wholeHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60
  if (remainingMinutes === 0) return `${wholeHours}h`
  if (wholeHours === 0) return `${remainingMinutes} min`
  return `${wholeHours}h ${remainingMinutes} min`
}
