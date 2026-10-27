import test from 'node:test'
import assert from 'node:assert/strict'
import { getIntervalError, layoutScheduledItems, timeToMinutes } from '../src/lib/dailyTimeline.js'

const event = (id, start, end) => ({ id, hora_inicio: start, hora_fim: end })

test('horários sobrepostos ocupam colunas distintas e preservam suas durações', () => {
  const rows = layoutScheduledItems([
    event(1, '08:00', '10:00'), event(2, '08:15', '09:15'), event(3, '08:30', '08:45'),
  ])
  assert.deepEqual(rows.map((row) => row.lane), [0, 1, 2])
  assert.deepEqual(rows.map((row) => row.laneCount), [3, 3, 3])
  assert.deepEqual(rows.map((row) => row.duration), [120, 60, 15])
})

test('intervalos consecutivos não são tratados como sobrepostos', () => {
  const rows = layoutScheduledItems([event(1, '08:00', '09:00'), event(2, '09:00', '10:00')])
  assert.deepEqual(rows.map((row) => [row.lane, row.laneCount]), [[0, 1], [0, 1]])
})

test('uma coluna é reutilizada quando um horário termina durante uma cadeia de sobreposição', () => {
  const rows = layoutScheduledItems([event(1, '08:00', '09:00'), event(2, '08:30', '09:30'), event(3, '09:00', '10:00')])
  assert.deepEqual(rows.map((row) => row.lane), [0, 1, 0])
  assert.deepEqual(rows.map((row) => row.laneCount), [2, 2, 2])
})

test('horários ausentes ou invertidos não geram blocos e são rejeitados na edição', () => {
  assert.deepEqual(layoutScheduledItems([event(1, null, null), event(2, '10:00', '09:00')]), [])
  assert.match(getIntervalError('', '09:00'), /Informe/)
  assert.match(getIntervalError('10:00', '09:00'), /posterior/)
  assert.equal(getIntervalError('08:00', '09:00'), '')
  assert.equal(timeToMinutes('23:59:00'), 1439)
})
