import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PomodoroContext } from '../context/PomodoroContext.js'
import { usePomodoro } from '../hooks/usePomodoro.js'
import { DEFAULT_POMODORO_SETTINGS } from '../lib/pomodoro.js'
import {
  cancelScheduledPomodoroAlarm,
  clearPomodoroAlarms,
  enablePomodoroSound,
  schedulePomodoroAlarm,
  startPomodoroAlarm,
  stopAllRingingAlarms,
} from '../lib/pomodoroSound.js'
import './Pomodoro.css'

const SETTINGS_KEY = 'flowzenit-pomodoro-settings'
const SESSION_KEY = 'flowzenit-pomodoro-session'
const MINUTE = 60 * 1000

const SETTINGS_LIMITS = {
  focusMinutes: { min: 1, max: 120 },
  shortBreakMinutes: { min: 1, max: 30 },
  longBreakMinutes: { min: 1, max: 60 },
  longBreakEvery: { min: 2, max: 12 },
}

const SETTINGS_LABELS = {
  focusMinutes: 'A duração do foco',
  shortBreakMinutes: 'A duração da pausa curta',
  longBreakMinutes: 'A duração da pausa longa',
  longBreakEvery: 'O intervalo da pausa longa',
}

const PHASES = ['focus', 'shortBreak', 'longBreak']
const PHASE_LABELS = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
}

function safeRead(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // The timer still works for the current page if browser storage is unavailable.
  }
}

function getPhaseDuration(mode, settings) {
  const settingName = {
    focus: 'focusMinutes',
    shortBreak: 'shortBreakMinutes',
    longBreak: 'longBreakMinutes',
  }[mode]
  return settings[settingName] * MINUTE
}

function createInitialSession(settings) {
  const durationMs = getPhaseDuration('focus', settings)
  return {
    mode: 'focus',
    status: 'idle',
    remainingMs: durationMs,
    durationMs,
    endsAt: null,
    completedFocusSessions: 0,
    cycleFocusSessions: 0,
    completedPhases: 0,
    notice: '',
  }
}

function readInitialSettings() {
  try {
    const saved = JSON.parse(safeRead(SETTINGS_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_POMODORO_SETTINGS }
    const values = {}
    for (const [key, limits] of Object.entries(SETTINGS_LIMITS)) {
      const value = Number(saved[key])
      if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
        return { ...DEFAULT_POMODORO_SETTINGS }
      }
      values[key] = value
    }
    return values
  } catch {
    return { ...DEFAULT_POMODORO_SETTINGS }
  }
}

function readInitialSession(settings) {
  try {
    const saved = JSON.parse(safeRead(SESSION_KEY) ?? 'null')
    if (!saved || typeof saved !== 'object' || !PHASES.includes(saved.mode)) return createInitialSession(settings)

    const status = ['idle', 'running', 'paused'].includes(saved.status) ? saved.status : 'idle'
    const configuredDuration = getPhaseDuration(saved.mode, settings)
    const durationMs = Number.isFinite(saved.durationMs) && saved.durationMs > 0 ? saved.durationMs : configuredDuration
    const endsAt = Number.isFinite(saved.endsAt) ? saved.endsAt : null
    const remainingMs = status === 'running' && endsAt
      ? Math.max(0, endsAt - Date.now())
      : Math.max(0, Math.min(durationMs, Number(saved.remainingMs) || 0))

    return {
      mode: saved.mode,
      status: status === 'running' && !endsAt ? 'idle' : status,
      remainingMs: status === 'running' && !endsAt ? durationMs : remainingMs,
      durationMs,
      endsAt,
      completedFocusSessions: Math.max(0, Number(saved.completedFocusSessions) || 0),
      cycleFocusSessions: Math.max(0, Number(saved.cycleFocusSessions) || 0),
      completedPhases: Math.max(0, Number(saved.completedPhases) || 0),
      notice: '',
    }
  } catch {
    return createInitialSession(settings)
  }
}

function validateSettings(input) {
  const values = {}
  for (const [key, limits] of Object.entries(SETTINGS_LIMITS)) {
    const value = Number(input[key])
    if (!Number.isInteger(value) || value < limits.min || value > limits.max) {
      return {
        ok: false,
        key,
        error: `${SETTINGS_LABELS[key]} precisa ser um número inteiro entre ${limits.min} e ${limits.max}.`,
      }
    }
    values[key] = value
  }
  return { ok: true, values }
}

function finishExpiredPhase(current, settings, timestamp) {
  if (current.status !== 'running' || !current.endsAt || current.endsAt > timestamp) return current

  const focusFinished = current.mode === 'focus'
  let nextMode = 'focus'
  let cycleFocusSessions = current.cycleFocusSessions
  let completedFocusSessions = current.completedFocusSessions

  if (focusFinished) {
    completedFocusSessions += 1
    cycleFocusSessions += 1
    nextMode = cycleFocusSessions >= settings.longBreakEvery ? 'longBreak' : 'shortBreak'
  } else if (current.mode === 'longBreak') {
    cycleFocusSessions = 0
  }

  const durationMs = getPhaseDuration(nextMode, settings)
  return {
    ...current,
    mode: nextMode,
    status: 'idle',
    remainingMs: durationMs,
    durationMs,
    endsAt: null,
    completedFocusSessions,
    cycleFocusSessions,
    completedPhases: current.completedPhases + 1,
    notice: focusFinished
      ? `Foco concluído. ${PHASE_LABELS[nextMode]} pronta para iniciar.`
      : 'Pausa concluída. Próximo foco pronto para iniciar.',
  }
}

function PomodoroProvider({ children }) {
  const [initialState] = useState(() => {
    const settings = readInitialSettings()
    return { settings, session: readInitialSession(settings) }
  })
  const [settings, setSettings] = useState(initialState.settings)
  const [session, setSession] = useState(initialState.session)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    safeWrite(SETTINGS_KEY, settings)
  }, [settings])

  useEffect(() => {
    safeWrite(SESSION_KEY, session)
  }, [session])

  useEffect(() => {
    const updateClock = () => {
      const timestamp = Date.now()
      setNow(timestamp)
      setSession((current) => finishExpiredPhase(current, settings, timestamp))
    }
    const timer = window.setInterval(updateClock, 1000)
    const updateOnReturn = updateClock
    document.addEventListener('visibilitychange', updateOnReturn)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', updateOnReturn)
    }
  }, [settings])

  useEffect(() => {
    if (session.status === 'running' && Number.isFinite(session.endsAt)) {
      schedulePomodoroAlarm(session.endsAt)
    } else {
      cancelScheduledPomodoroAlarm()
    }
  }, [session.status, session.endsAt])

  const remainingMs = session.status === 'running'
    ? Math.max(0, (session.endsAt ?? now) - now)
    : session.remainingMs
  const remainingSeconds = Math.ceil(remainingMs / 1000)
  const totalSeconds = Math.max(1, Math.ceil(session.durationMs / 1000))
  const progress = Math.max(0, Math.min(1, 1 - remainingSeconds / totalSeconds))

  function start() {
    enablePomodoroSound()
    const startedAt = Date.now()
    const durationMs = session.durationMs || getPhaseDuration(session.mode, settings)
    const remaining = session.remainingMs > 0 ? session.remainingMs : durationMs
    const endsAt = startedAt + remaining
    schedulePomodoroAlarm(endsAt)
    setNow(startedAt)
    setSession((current) => {
      if (current.status === 'running') return current
      return {
        ...current,
        status: 'running',
        remainingMs: remaining,
        durationMs,
        endsAt,
        notice: '',
      }
    })
  }

  function pause() {
    if (session.status !== 'running') return
    const remainingNow = Math.max(0, (session.endsAt ?? 0) - Date.now())
    if (remainingNow === 0) {
      setNow(Date.now())
      return
    }
    cancelScheduledPomodoroAlarm()
    setNow(Date.now())
    setSession((current) => {
      if (current.status !== 'running') return current
      const remaining = Math.max(0, (current.endsAt ?? 0) - Date.now())
      return { ...current, status: 'paused', remainingMs: remaining, endsAt: null }
    })
  }

  function reset() {
    cancelScheduledPomodoroAlarm()
    setSession((current) => {
      const durationMs = getPhaseDuration(current.mode, settings)
      return { ...current, status: 'idle', remainingMs: durationMs, durationMs, endsAt: null, notice: '' }
    })
  }

  function resetSequence() {
    cancelScheduledPomodoroAlarm()
    const durationMs = getPhaseDuration('focus', settings)
    setSession((current) => ({
      ...current,
      mode: 'focus',
      status: 'idle',
      remainingMs: durationMs,
      durationMs,
      endsAt: null,
      completedFocusSessions: 0,
      cycleFocusSessions: 0,
      notice: 'Sequência reiniciada.',
    }))
  }

  function saveSettings(input) {
    const result = validateSettings(input)
    if (!result.ok) return result
    setSettings(result.values)
    setSession((current) => {
      if (current.status !== 'idle') return current
      const durationMs = getPhaseDuration(current.mode, result.values)
      return { ...current, remainingMs: durationMs, durationMs, endsAt: null }
    })
    return result
  }

  const value = {
    settings,
    session,
    remainingSeconds,
    totalSeconds,
    progress,
    phaseLabel: PHASE_LABELS[session.mode],
    start,
    pause,
    reset,
    resetSequence,
    saveSettings,
  }

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>
}

function formatClock(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function TimerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 1.5M9 2h6M12 2v3" /></svg>
}

function StopIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
}

function PomodoroWidget() {
  const [expanded, setExpanded] = useState(false)
  const [alarmRinging, setAlarmRinging] = useState(false)
  const collapsedButtonRef = useRef(null)
  const closeButtonRef = useRef(null)
  const { settings, session, remainingSeconds, totalSeconds, progress, phaseLabel, start, pause, reset } = usePomodoro()
  const timerLabel = formatClock(remainingSeconds)
  const announcedCompletionRef = useRef(session.completedPhases)

  useEffect(() => {
    if (expanded) closeButtonRef.current?.focus()
  }, [expanded])

  useEffect(() => {
    if (session.completedPhases === announcedCompletionRef.current) return
    announcedCompletionRef.current = session.completedPhases
    startPomodoroAlarm()
    setAlarmRinging(true)
  }, [session.completedPhases])

  useEffect(() => () => clearPomodoroAlarms(), [])

  function stopAlarm() {
    stopAllRingingAlarms()
    setAlarmRinging(false)
  }

  function collapseWidget() {
    setExpanded(false)
    window.requestAnimationFrame(() => collapsedButtonRef.current?.focus())
  }

  return (
    <div className={`pomodoro-dock${expanded ? ' is-expanded' : ''}`}>
      <span className="pomodoro-sr-only" role="status" aria-live="polite" aria-atomic="true">{alarmRinging ? 'O tempo terminou. Alarme sonoro ativo.' : session.notice}</span>
      {expanded ? (
        <section className="pomodoro-panel" id="pomodoro-panel" aria-label="Relógio Pomodoro">
          <header className="pomodoro-panel-header">
            <div className="pomodoro-panel-title">
              <span className={`pomodoro-indicator${session.status === 'running' ? ' is-running' : ''}`} aria-hidden="true" />
              <div>
                <strong>Pomodoro</strong>
                <span>{alarmRinging ? 'Tempo encerrado · alarme ativo' : `${phaseLabel} · ${session.status === 'running' ? 'Em andamento' : session.status === 'paused' ? 'Pausado' : 'Pronto'}`}</span>
              </div>
            </div>
            <button className="pomodoro-close" ref={closeButtonRef} type="button" onClick={collapseWidget} aria-label="Recolher relógio Pomodoro">×</button>
          </header>

          <div className="pomodoro-clock" aria-label={`${phaseLabel}: ${timerLabel}`}>
            <TimerIcon />
            <span aria-live="off">{timerLabel}</span>
          </div>
          <div className="pomodoro-progress" role="progressbar" aria-label="Progresso da fase" aria-valuemin={0} aria-valuemax={totalSeconds} aria-valuenow={Math.max(0, totalSeconds - remainingSeconds)}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="pomodoro-cycle">Ciclo {Math.min(session.cycleFocusSessions, settings.longBreakEvery)} de {settings.longBreakEvery} · {session.completedFocusSessions} focos concluídos</p>

          <div className="pomodoro-controls">
            <button className="pomodoro-main-control" type="button" onClick={session.status === 'running' ? pause : start}>
              {session.status === 'running' ? 'Pausar' : session.status === 'paused' ? 'Continuar' : 'Iniciar'}
            </button>
            <button className="pomodoro-reset-control" type="button" onClick={reset} aria-label="Reiniciar fase atual" title="Reiniciar fase atual">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5v4h4M5.2 8A6 6 0 1 1 5 12" /></svg>
            </button>
          </div>

          {alarmRinging && (
            <button className="pomodoro-alarm-stop" type="button" onClick={stopAlarm}>
              <StopIcon />
              Parar alarme
            </button>
          )}

          <p className="pomodoro-announcement">
            {alarmRinging ? 'O tempo acabou. O alarme continuará até você pará-lo.' : session.notice || (session.status === 'running' ? 'Contagem em andamento.' : 'A próxima fase começa quando você iniciar.')}
          </p>
          <Link className="pomodoro-settings-link" to="/interno/pomodoro" onClick={() => setExpanded(false)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 3.5h4l.5 1.8 1.5.9 1.8-.5 2 3.5-1.3 1.4v1.8l1.3 1.4-2 3.5-1.8-.5-1.5.9-.5 1.8H8l-.5-1.8-1.5-.9-1.8.5-2-3.5 1.3-1.4v-1.8L2.2 8.7l2-3.5 1.8.5 1.5-.9L8 3.5Z" transform="translate(0 -1) scale(.9)" /><circle cx="10" cy="10" r="2.3" /></svg>
            Configurar Pomodoro
          </Link>
        </section>
      ) : (
        <div className="pomodoro-collapsed-group">
          <button
            className="pomodoro-collapsed"
            ref={collapsedButtonRef}
            type="button"
            aria-expanded={expanded}
            aria-label={`Abrir relógio Pomodoro. ${alarmRinging ? 'Alarme ativo. ' : ''}${phaseLabel}, ${timerLabel}${session.status === 'running' ? ', em andamento' : ''}`}
            onClick={() => {
              enablePomodoroSound()
              setExpanded(true)
            }}
          >
            <span className={`pomodoro-indicator${session.status === 'running' ? ' is-running' : ''}`} aria-hidden="true" />
            <span className="pomodoro-collapsed-phase">{alarmRinging ? 'Alarme' : phaseLabel}</span>
            <strong aria-hidden="true">{timerLabel}</strong>
            <TimerIcon />
          </button>
          {alarmRinging && (
            <button className="pomodoro-alarm-stop is-compact" type="button" onClick={stopAlarm} aria-label="Parar alarme do Pomodoro" title="Parar alarme">
              <StopIcon />
              <span>Parar alarme</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export { PomodoroProvider, PomodoroWidget }
