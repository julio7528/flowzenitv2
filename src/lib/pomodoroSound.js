let audioContext = null
let cachedAlarmBuffer = null
let cachedAlarmBufferContext = null
const scheduledAlarms = new Map()

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) return null

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContextConstructor()
    cachedAlarmBuffer = null
    cachedAlarmBufferContext = null
  }
  return audioContext
}

function resumeAudioContext(context) {
  if (context.state === 'running') return Promise.resolve(context)
  return context.resume().then(() => context)
}

function getAlarmBuffer(context) {
  if (cachedAlarmBuffer && cachedAlarmBufferContext === context) return cachedAlarmBuffer

  const sampleRate = context.sampleRate
  const loopDuration = 1.25
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * loopDuration), sampleRate)
  const samples = buffer.getChannelData(0)
  const notes = [
    { offset: 0.025, duration: 0.18, from: 1850, to: 2350 },
    { offset: 0.275, duration: 0.18, from: 2150, to: 1750 },
    { offset: 0.525, duration: 0.18, from: 1850, to: 2350 },
  ]

  notes.forEach((note) => {
    const firstSample = Math.floor(note.offset * sampleRate)
    const sampleCount = Math.ceil(note.duration * sampleRate)
    const frequencyChange = note.to - note.from

    for (let index = 0; index < sampleCount; index += 1) {
      const seconds = index / sampleRate
      const envelope = Math.max(0, Math.min(1, seconds / 0.018, (note.duration - seconds) / 0.045))
      const phase = 2 * Math.PI * (note.from * seconds + (frequencyChange / (2 * note.duration)) * seconds * seconds)
      const tone = Math.sin(phase) + (0.1 * Math.sin(phase * 2))
      samples[firstSample + index] += tone * envelope * 0.24
    }
  })

  cachedAlarmBuffer = buffer
  cachedAlarmBufferContext = context
  return buffer
}

function isAlarmDue(entry) {
  return entry.deadlineAt <= Date.now() + 50
    || Boolean(entry.source && entry.context.currentTime >= entry.startAt - 0.02)
}

function scheduleAlarmEntry(entry) {
  if (scheduledAlarms.get(entry.key) !== entry || entry.source) return
  const context = entry.context
  if (context.state !== 'running') return

  const secondsUntilDeadline = Math.max(0, (entry.deadlineAt - Date.now()) / 1000)
  const source = context.createBufferSource()
  const gain = context.createGain()
  source.buffer = getAlarmBuffer(context)
  source.loop = true
  source.connect(gain)
  gain.connect(context.destination)

  entry.source = source
  entry.gain = gain
  entry.startAt = context.currentTime + secondsUntilDeadline
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
    if (entry.source === source) {
      entry.source = null
      entry.gain = null
      entry.startAt = null
      if (scheduledAlarms.get(entry.key) === entry) scheduledAlarms.delete(entry.key)
    }
  }
  source.start(entry.startAt)
}

function activateAlarmEntry(entry) {
  if (scheduledAlarms.get(entry.key) !== entry) return

  if (entry.context.state === 'closed') {
    entry.context = getAudioContext()
    entry.source = null
    entry.gain = null
    entry.startAt = null
    if (!entry.context) return
  }

  if (entry.context.state !== 'running') {
    void resumeAudioContext(entry.context)
      .then(() => {
        if (entry.context.state === 'running') activateAlarmEntry(entry)
      })
      .catch(() => {})
    return
  }

  if (entry.source) {
    const secondsUntilDeadline = Math.max(0, (entry.deadlineAt - Date.now()) / 1000)
    const secondsUntilAudioStart = Math.max(0, entry.startAt - entry.context.currentTime)
    if (secondsUntilAudioStart <= secondsUntilDeadline + 0.1) return

    try { entry.source.stop() } catch { /* The previous schedule may already have ended. */ }
    try { entry.source.disconnect() } catch { /* The previous source may already be disconnected. */ }
    try { entry.gain?.disconnect() } catch { /* The previous gain may already be disconnected. */ }
    entry.source = null
    entry.gain = null
    entry.startAt = null
  }

  try {
    scheduleAlarmEntry(entry)
  } catch {
    // Audio remains optional if the browser blocks it.
  }
}

function restartAlarmEntry(entry) {
  if (scheduledAlarms.get(entry.key) !== entry) return
  if (entry.context.state === 'closed') {
    entry.context = getAudioContext()
    entry.source = null
    entry.gain = null
    entry.startAt = null
    if (!entry.context) return
  }
  stopAlarmSource(entry)
  activateAlarmEntry(entry)
}

function resumePendingAlarms(context) {
  for (const entry of scheduledAlarms.values()) {
    if (entry.context === context) activateAlarmEntry(entry)
  }
}

export function enableAlarmAudio() {
  try {
    const context = getAudioContext()
    if (!context) return
    void resumeAudioContext(context)
      .then(() => resumePendingAlarms(context))
      .catch(() => {})
  } catch {
    // Audio is optional; the timer and its completion notice still work without it.
  }
}

export function enablePomodoroSound() {
  enableAlarmAudio()
}

function scheduleAlarm(key, deadlineAt) {
  if (!Number.isFinite(deadlineAt)) return

  const context = getAudioContext()
  if (!context) return

  const existing = scheduledAlarms.get(key)
  if (existing) {
    if (existing.deadlineAt === deadlineAt || isAlarmDue(existing)) return
    cancelAlarmEntry(existing)
  }

  const entry = { key, context, deadlineAt, source: null, gain: null, startAt: null }
  scheduledAlarms.set(key, entry)
  activateAlarmEntry(entry)
}

function stopAlarmSource(entry) {
  if (!entry.source) return

  try {
    const now = entry.context.currentTime
    entry.gain?.gain.cancelScheduledValues(now)
    entry.gain?.gain.setValueAtTime(0, now)
  } catch { /* The audio context may be unavailable. */ }
  try { entry.source.stop() } catch { /* The source may already have ended. */ }
  try { entry.source.disconnect() } catch { /* The source may already be disconnected. */ }
  try { entry.gain?.disconnect() } catch { /* The gain may already be disconnected. */ }
  entry.source = null
  entry.gain = null
  entry.startAt = null
}

function cancelAlarmEntry(entry) {
  if (scheduledAlarms.get(entry.key) === entry) scheduledAlarms.delete(entry.key)
  stopAlarmSource(entry)
}

function cancelScheduledAlarms(prefix) {
  const now = Date.now()
  for (const entry of [...scheduledAlarms.values()]) {
    if (entry.key.startsWith(prefix) && entry.deadlineAt > now) cancelAlarmEntry(entry)
  }
}

function startDueAlarms(prefix) {
  const now = Date.now()
  const dueEntries = [...scheduledAlarms.values()].filter((entry) => entry.key.startsWith(prefix) && isAlarmDue(entry))
  if (dueEntries.length > 0) {
    dueEntries.forEach(restartAlarmEntry)
    return
  }

  scheduleAlarm(`${prefix}${now}`, now)
}

function stopDueAlarms(prefix) {
  for (const entry of [...scheduledAlarms.values()]) {
    if (entry.key.startsWith(prefix) && isAlarmDue(entry)) cancelAlarmEntry(entry)
  }
}

function clearAlarms(prefix) {
  for (const entry of [...scheduledAlarms.values()]) {
    if (entry.key.startsWith(prefix)) cancelAlarmEntry(entry)
  }
}

export function schedulePomodoroAlarm(deadlineAt) {
  scheduleAlarm(`pomodoro:${deadlineAt}`, deadlineAt)
}

export function cancelScheduledPomodoroAlarm() {
  cancelScheduledAlarms('pomodoro:')
}

export function startPomodoroAlarm() {
  startDueAlarms('pomodoro:')
}

export function stopPomodoroAlarm() {
  stopDueAlarms('pomodoro:')
}

export function stopAllRingingAlarms() {
  stopDueAlarms('')
}

export function clearPomodoroAlarms() {
  clearAlarms('pomodoro:')
}

export function scheduleDailyTaskAlarm(alarmId, deadlineAt) {
  scheduleAlarm(`daily:${alarmId}`, deadlineAt)
}

export function cancelScheduledDailyTaskAlarms() {
  cancelScheduledAlarms('daily:')
}

export function cancelScheduledDailyTaskAlarm(alarmId) {
  const entry = scheduledAlarms.get(`daily:${alarmId}`)
  if (entry && entry.deadlineAt > Date.now()) cancelAlarmEntry(entry)
}

export function startDailyTaskAlarm(alarmId) {
  const key = `daily:${alarmId}`
  const entry = scheduledAlarms.get(key)
  if (entry && isAlarmDue(entry)) {
    restartAlarmEntry(entry)
    return
  }
  if (!entry) scheduleAlarm(key, Date.now())
}

export function stopDailyTaskAlarm(alarmId) {
  const entry = scheduledAlarms.get(`daily:${alarmId}`)
  if (entry && isAlarmDue(entry)) cancelAlarmEntry(entry)
}

export function clearDailyTaskAlarms() {
  clearAlarms('daily:')
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const entry of [...scheduledAlarms.values()]) cancelAlarmEntry(entry)
    if (audioContext && audioContext.state !== 'closed') void audioContext.close()
  })
}
