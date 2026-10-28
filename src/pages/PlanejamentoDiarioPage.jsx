import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import DateNavigation from '../components/DateNavigation.jsx'
import { useDailyDate } from '../hooks/useDailyDate.js'
import PageHeading from '../components/PageHeading.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { useDialogFocus } from '../hooks/useDialogFocus.js'
import { getIntervalError, layoutScheduledItems, timeToMinutes } from '../lib/dailyTimeline.js'
import { isSameCalendarWeek } from '../lib/calendarWeek.js'
import { getRoutineEndTime } from '../lib/recurringTime.js'
import {
  cancelScheduledDailyTaskAlarm,
  clearDailyTaskAlarms,
  enableAlarmAudio,
  scheduleDailyTaskAlarm,
  startDailyTaskAlarm,
  stopAllRingingAlarms,
  stopDailyTaskAlarm,
} from '../lib/pomodoroSound.js'
import { ErrorState, LoadingState } from '../components/FeedbackState.jsx'
import './PlanejamentoDiarioPage.css'

const DEFAULT_DURATION_MINUTES = 60
const TASK_ALARM_GRACE_MS = 5 * 60 * 1000
const HOUR_HEIGHT = 64
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function minutesToTime(minutes) {
  const safeMinutes = Math.max(0, Math.min(23 * 60 + 59, minutes))
  const hours = String(Math.floor(safeMinutes / 60)).padStart(2, '0')
  const remainder = String(safeMinutes % 60).padStart(2, '0')
  return `${hours}:${remainder}`
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

function statusClass(status) {
  const classes = {
    Backlog: 'daily-status-backlog',
    Análise: 'daily-status-analysis',
    Analise: 'daily-status-analysis',
    Executando: 'daily-status-executing',
    Aguardando: 'daily-status-waiting',
    Done: 'daily-status-done',
  }
  return classes[status] || 'daily-status-backlog'
}

function defaultTimeRange() {
  return { start: '08:00', end: '09:00' }
}

function getIsoWeekday(date) {
  return ((date.getDay() + 6) % 7) + 1
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.5" />
    </svg>
  )
}

function BacklogCard({ item, saving, dragging, onOpenEditor, onDragStart, onDragEnd }) {
  return (
    <article
      className={`daily-subtask-card${dragging ? ' is-dragging' : ''}`}
      draggable={!saving}
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
      aria-label={`Subtarefa: ${item.demanda}`}
    >
      <div className="daily-subtask-card-heading">
        <span className="daily-subtask-type">SUBTAREFA</span>
        <StatusBadge status={item.status} />
      </div>
      <h3>{item.demanda}</h3>
      <button
        className="daily-schedule-button"
        type="button"
        disabled={saving}
        onClick={() => onOpenEditor(item)}
      >
        <ClockIcon />
        Definir horário
      </button>
    </article>
  )
}

function ScheduledCard({
  item,
  index,
  saving,
  dragging,
  onOpenEditor,
  onMoveToBacklog,
  onDragStart,
  onDragEnd,
}) {
  const isRoutine = Boolean(item.isRoutine)
  const isDone = !isRoutine && item.status === 'Done'
  const hierarchyLabel = isRoutine
    ? `Rotina ${item.demanda}`
    : `ID hierárquico ${item.hierarchyNumber ?? 'indisponível'}; subtarefa ${item.demanda}; tarefa ${item.taskName ?? 'não encontrada'}; demanda ${item.demandName ?? 'não encontrada'}`
  const actionContext = isRoutine
    ? item.demanda
    : `subtarefa ${item.demanda}, ID ${item.hierarchyNumber ?? 'indisponível'}, tarefa ${item.taskName ?? 'não encontrada'}, demanda ${item.demandName ?? 'não encontrada'}`

  return (
    <article
      className={`daily-agenda-card${isRoutine ? ' is-routine' : ''}${isDone ? ' is-done' : ''}${dragging ? ' is-dragging' : ''}`}
      draggable={!isRoutine && !saving && !isDone}
      onDragStart={isRoutine ? undefined : (event) => onDragStart(event, item)}
      onDragEnd={isRoutine ? undefined : onDragEnd}
      aria-label={`${hierarchyLabel}, ${formatTime(item.hora_inicio)} às ${formatTime(item.hora_fim)}`}
    >
      <div className="daily-agenda-card-top">
        <span className="daily-agenda-time"><span className="daily-agenda-index" aria-label={isRoutine ? `Atividade ${index}` : `ID ${item.hierarchyNumber ?? 'indisponível'}`}>{isRoutine ? index : item.hierarchyNumber ?? index}</span><ClockIcon />{formatTime(item.hora_inicio)}–{formatTime(item.hora_fim)}</span>
        {isRoutine ? (
          <span className="daily-routine-tag">Rotina</span>
        ) : (
          <StatusBadge status={item.status} />
        )}
      </div>
      {!isRoutine && (
        <div className="daily-agenda-hierarchy">
          <p><span>Demanda</span><strong>{item.demandName ?? 'Demanda não encontrada'}</strong></p>
          <p><span>Tarefa</span><strong>{item.taskName ?? 'Tarefa não encontrada'}</strong></p>
        </div>
      )}
      {!isRoutine && <span className="daily-agenda-subtask-label">SUBTAREFA</span>}
      <h3>{item.demanda}</h3>
      {!isRoutine && !isDone && (
        <div className="daily-agenda-actions">
          <button
            className="daily-block-action"
            type="button"
            disabled={saving}
            onClick={() => onOpenEditor(item)}
            aria-label={`Editar horário de ${actionContext}`}
            title="Editar horário"
          >
            <ClockIcon />
            <span>Editar horário</span>
          </button>
          <button
            className="daily-block-action is-remove"
            type="button"
            disabled={saving}
            onClick={() => onMoveToBacklog(item)}
            aria-label={`Mover ${actionContext} para o backlog`}
            title="Mover para o backlog"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 10h12M9 5l-5 5 5 5" />
            </svg>
            <span>Para backlog</span>
          </button>
        </div>
      )}
    </article>
  )
}

function TimelineCard({ item, index, style, compact, saving, dragging, onDragStart, onDragEnd }) {
  const isRoutine = Boolean(item.isRoutine)
  const isDone = !isRoutine && item.status === 'Done'
  return (
    <article
      className={`daily-timeline-event ${isRoutine ? 'is-routine' : statusClass(item.status)}${compact ? ' is-compact' : ''}${dragging ? ' is-dragging' : ''}`}
      style={style}
      draggable={!isRoutine && !saving && !isDone}
      onDragStart={isRoutine ? undefined : (event) => onDragStart(event, item)}
      onDragEnd={isRoutine ? undefined : onDragEnd}
      aria-label={`${isRoutine ? 'Rotina' : 'Subtarefa'} ${item.demanda}, ${formatTime(item.hora_inicio)} às ${formatTime(item.hora_fim)}`}
      title={`${item.demanda} · ${formatTime(item.hora_inicio)}–${formatTime(item.hora_fim)}`}
    >
      <span className="daily-timeline-event-name" aria-hidden="true">{item.demanda}</span>
      <span className="daily-timeline-event-number" aria-hidden="true">{index}</span>
    </article>
  )
}

function PlanejamentoDiarioPage() {
  const [records, setRecords] = useState([])
  const [routines, setRoutines] = useState([])
  const [routineLoading, setRoutineLoading] = useState(true)
  const [routineLoadError, setRoutineLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [savingId, setSavingId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [notice, setNotice] = useState(null)
  const [editor, setEditor] = useState(null)
  const [editorError, setEditorError] = useState('')
  const [savingEditor, setSavingEditor] = useState(false)
  const [clockNow, setClockNow] = useState(() => new Date())
  const [taskAlerts, setTaskAlerts] = useState([])
  const timelineViewportRef = useRef(null)
  const positionedDateRef = useRef('')
  const routineLoadedDateRef = useRef('')
  const taskAlarmEntriesRef = useRef(new Map())
  const alertedTaskAlarmsRef = useRef(new Set())
  const taskAlertReturnFocusRef = useRef(null)
  const { dialogRef: editorDialogRef, rememberFocus: rememberEditorFocus } = useDialogFocus(Boolean(editor), () => {
    if (!savingEditor) { setEditor(null); setEditorError('') }
  })
  const { dialogRef: taskAlertDialogRef } = useDialogFocus(Boolean(taskAlerts.length), stopTaskAlerts, taskAlertReturnFocusRef)

  const { selectedDate, selectedDateKey, isToday, changeDate, goToday } = useDailyDate()

  useEffect(() => {
    const updateClock = () => setClockNow(new Date())
    const interval = window.setInterval(updateClock, 10000)
    document.addEventListener('visibilitychange', updateClock)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', updateClock)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadRecords() {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('demandas')
        .select('id, demanda, tipo, raizid, status, data_exec, hora_inicio, hora_fim')
        .in('tipo', [1, 2, 3])
        .order('id', { ascending: true })

      if (!active) return

      if (error) {
        setLoadError(error.message || 'Não foi possível carregar o planejamento diário.')
        setRecords([])
      } else {
        setRecords(data ?? [])
      }

      setLoading(false)
    }

    void loadRecords()
    return () => {
      active = false
    }
  }, [reload])

  useEffect(() => {
    let active = true

    async function loadDayRoutines() {
      setRoutineLoading(true)
      setRoutineLoadError('')
      routineLoadedDateRef.current = ''

      const { data, error } = await supabase
        .from('recorrente')
        .select('id, demanda, hora, hora_fim, dias_semana, data_inicial, data_final')
        .contains('dias_semana', [getIsoWeekday(selectedDate)])
        .lte('data_inicial', selectedDateKey)
        .gte('data_final', selectedDateKey)
        .order('hora', { ascending: true })
        .order('id', { ascending: true })

      if (!active) return

      if (error) {
        setRoutineLoadError(error.message || 'Não foi possível carregar as rotinas recorrentes.')
        setRoutines([])
      } else {
        setRoutines(data ?? [])
      }

      routineLoadedDateRef.current = selectedDateKey
      setRoutineLoading(false)
    }

    void loadDayRoutines()
    return () => { active = false }
  }, [reload, selectedDate, selectedDateKey])

  const tasksById = useMemo(() => new Map(
    records.filter((record) => record.tipo === 2).map((task) => [String(task.id), task]),
  ), [records])

  const hierarchyBySubtaskId = useMemo(() => {
    const childrenByParent = new Map()
    records.forEach((record) => {
      if (record.tipo === 1) return
      const parentId = String(record.raizid)
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(record)
      childrenByParent.set(parentId, siblings)
    })

    const hierarchy = new Map()
    records.filter((record) => record.tipo === 1).forEach((demand, demandIndex) => {
      const demandNumber = String(demandIndex + 1)
      const tasks = (childrenByParent.get(String(demand.id)) ?? []).filter((record) => record.tipo === 2)
      tasks.forEach((task, taskIndex) => {
        const taskNumber = `${demandNumber}.${taskIndex + 1}`
        const subtasks = (childrenByParent.get(String(task.id)) ?? []).filter((record) => record.tipo === 3)
        subtasks.forEach((subtask, subtaskIndex) => {
          hierarchy.set(String(subtask.id), {
            hierarchyNumber: `${taskNumber}.${subtaskIndex + 1}`,
            demandName: demand.demanda,
            taskName: task.demanda,
          })
        })
      })
    })

    return hierarchy
  }, [records])

  const eligibleSubtasks = useMemo(() => records.filter((record) => {
    if (record.tipo !== 3) return false
    const parentTask = tasksById.get(String(record.raizid))
    return isSameCalendarWeek(parentTask?.data_exec, selectedDateKey)
      && (!record.data_exec || record.data_exec === selectedDateKey)
  }), [records, selectedDateKey, tasksById])

  const backlogItems = useMemo(() => eligibleSubtasks
    .filter((item) => !item.data_exec && item.status !== 'Done')
    .sort((a, b) => String(a.demanda).localeCompare(String(b.demanda), 'pt-BR')),
  [eligibleSubtasks])

  const scheduledItems = useMemo(() => eligibleSubtasks
    .filter((item) => item.data_exec === selectedDateKey)
    .sort((a, b) => (timeToMinutes(a.hora_inicio) ?? 0) - (timeToMinutes(b.hora_inicio) ?? 0)),
  [eligibleSubtasks, selectedDateKey])

  const dayRoutines = useMemo(() => {
    if (routineLoading) return []
    return routines
      .filter((routine) => (
        (routine.dias_semana ?? []).map(Number).includes(getIsoWeekday(selectedDate))
        && routine.data_inicial <= selectedDateKey
        && routine.data_final >= selectedDateKey
      ))
      .sort((a, b) => String(a.hora).localeCompare(String(b.hora)))
  }, [routineLoading, routines, selectedDate, selectedDateKey])

  const routineTimelineItems = useMemo(() => dayRoutines.map((routine) => {
    return {
      ...routine,
      isRoutine: true,
      hora_inicio: routine.hora,
      hora_fim: getRoutineEndTime(routine),
    }
  }), [dayRoutines])

  const timelineLayout = useMemo(
    () => layoutScheduledItems([...scheduledItems, ...routineTimelineItems]),
    [scheduledItems, routineTimelineItems],
  )
  const timelineMinWidth = Math.max(0, ...timelineLayout.map((entry) => entry.laneCount)) * 96 + 58
  const currentTimeMinutes = clockNow.getHours() * 60 + clockNow.getMinutes() + clockNow.getSeconds() / 60
  const currentTimeLabel = clockNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const announceTaskAlerts = useCallback((entries) => {
    const newAlerts = entries.filter((entry) => !alertedTaskAlarmsRef.current.has(entry.alarmId))
    if (newAlerts.length === 0) return

    if (taskAlertReturnFocusRef.current === null) taskAlertReturnFocusRef.current = document.activeElement
    newAlerts.forEach((entry) => {
      alertedTaskAlarmsRef.current.add(entry.alarmId)
      startDailyTaskAlarm(entry.alarmId)
    })
    setTaskAlerts((current) => {
      const merged = new Map(current.map((entry) => [entry.alarmId, entry]))
      newAlerts.forEach((entry) => merged.set(entry.alarmId, entry))
      return [...merged.values()].sort((first, second) => first.deadlineAt - second.deadlineAt)
    })
  }, [])

  useEffect(() => {
    const currentEntries = new Map()
    if (!loading && !loadError && isToday) {
      scheduledItems.forEach((item) => {
        if (item.status === 'Done' || !item.hora_inicio) return
        const startTime = String(item.hora_inicio).slice(0, 5)
        const deadlineAt = new Date(`${selectedDateKey}T${startTime}:00`).getTime()
        if (!Number.isFinite(deadlineAt)) return
        const alarmId = `${selectedDateKey}:${item.id}:${startTime}`
        const hierarchy = hierarchyBySubtaskId.get(String(item.id))
        currentEntries.set(alarmId, {
          alarmId,
          deadlineAt,
          item,
          hierarchyNumber: hierarchy?.hierarchyNumber ?? '—',
          demandName: hierarchy?.demandName ?? 'Demanda não encontrada',
          taskName: hierarchy?.taskName ?? 'Tarefa não encontrada',
        })
      })
    }

    for (const previous of taskAlarmEntriesRef.current.values()) {
      if (currentEntries.has(previous.alarmId)) continue
      cancelScheduledDailyTaskAlarm(previous.alarmId)
      stopDailyTaskAlarm(previous.alarmId)
      alertedTaskAlarmsRef.current.delete(previous.alarmId)
    }
    taskAlarmEntriesRef.current = currentEntries

    const now = Date.now()
    const missedRecently = []
    for (const entry of currentEntries.values()) {
      if (alertedTaskAlarmsRef.current.has(entry.alarmId)) continue
      if (entry.deadlineAt > now) {
        scheduleDailyTaskAlarm(entry.alarmId, entry.deadlineAt)
      } else if (now - entry.deadlineAt <= TASK_ALARM_GRACE_MS) {
        missedRecently.push(entry)
      } else {
        alertedTaskAlarmsRef.current.add(entry.alarmId)
      }
    }
    announceTaskAlerts(missedRecently)

    const checkDueAlerts = () => {
      const timestamp = Date.now()
      const due = [...taskAlarmEntriesRef.current.values()].filter((entry) => (
        entry.deadlineAt <= timestamp
        && !alertedTaskAlarmsRef.current.has(entry.alarmId)
      ))
      announceTaskAlerts(due)
    }
    const interval = window.setInterval(checkDueAlerts, 1000)
    document.addEventListener('visibilitychange', checkDueAlerts)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', checkDueAlerts)
    }
  }, [announceTaskAlerts, hierarchyBySubtaskId, isToday, loadError, loading, scheduledItems, selectedDateKey])

  useEffect(() => () => clearDailyTaskAlarms(), [])

  useEffect(() => {
    if (loading || routineLoading || routineLoadedDateRef.current !== selectedDateKey || !timelineViewportRef.current || positionedDateRef.current === selectedDateKey) return
    const firstStart = timelineLayout[0]?.start ?? (isToday ? currentTimeMinutes : 8 * 60)
    const visibleStart = isToday ? Math.min(firstStart, currentTimeMinutes) : firstStart
    timelineViewportRef.current.scrollTop = Math.max(0, ((visibleStart / 60) - 1) * HOUR_HEIGHT)
    positionedDateRef.current = selectedDateKey
  }, [clockNow, currentTimeMinutes, isToday, loading, routineLoading, selectedDateKey, timelineLayout])

  function scrollTimelineTo(minutes) {
    timelineViewportRef.current?.scrollTo({ top: Math.max(0, (minutes / 60) * HOUR_HEIGHT - HOUR_HEIGHT), behavior: 'auto' })
  }

  function openEditor(item, start, end) {
    const suggested = start && end ? { start, end } : defaultTimeRange()
    rememberEditorFocus()
    setEditor({ item, start: suggested.start, end: suggested.end })
    setEditorError('')
    setNotice(null)
  }

  async function saveTimeRange(event) {
    event.preventDefault()
    if (!editor || savingEditor) return

    const intervalError = getIntervalError(editor.start, editor.end)
    if (intervalError) {
      setEditorError(intervalError)
      return
    }

    enableAlarmAudio()
    setSavingEditor(true)
    setSavingId(String(editor.item.id))
    setEditorError('')
    setNotice(null)

    const { data, error } = await supabase
      .from('demandas')
      .update({
        data_exec: selectedDateKey,
        hora_inicio: editor.start,
        hora_fim: editor.end,
      })
      .eq('id', editor.item.id)
      .eq('tipo', 3)
      .select('id, data_exec, hora_inicio, hora_fim')
      .single()

    setSavingEditor(false)
    setSavingId(null)

    if (error) {
      setEditorError(error.message || 'Não foi possível salvar o horário.')
      return
    }

    setRecords((current) => current.map((record) => (
      String(record.id) === String(data.id)
        ? { ...record, data_exec: data.data_exec, hora_inicio: data.hora_inicio, hora_fim: data.hora_fim }
        : record
    )))
    setEditor(null)
    setNotice({ tone: 'success', text: `Horário de “${editor.item.demanda}” salvo.` })
  }

  async function moveToBacklog(item) {
    if (savingId || item.status === 'Done') return

    setSavingId(String(item.id))
    setNotice(null)

    const { data, error } = await supabase
      .from('demandas')
      .update({ data_exec: null, hora_inicio: null, hora_fim: null })
      .eq('id', item.id)
      .eq('tipo', 3)
      .select('id, data_exec, hora_inicio, hora_fim')
      .single()

    setSavingId(null)

    if (error) {
      setNotice({ tone: 'error', text: error.message || `Não foi possível mover “${item.demanda}” para o backlog.` })
      return
    }

    setRecords((current) => current.map((record) => (
      String(record.id) === String(data.id)
        ? { ...record, data_exec: null, hora_inicio: null, hora_fim: null }
        : record
    )))
    setNotice({ tone: 'success', text: `“${item.demanda}” voltou para o backlog.` })
  }

  async function moveToTime(item, startMinutes) {
    if (savingId || item.status === 'Done') return

    const oldStart = timeToMinutes(item.hora_inicio)
    const oldEnd = timeToMinutes(item.hora_fim)
    const duration = oldStart !== null && oldEnd !== null
      ? oldEnd - oldStart
      : DEFAULT_DURATION_MINUTES
    let endMinutes = startMinutes + duration

    if (endMinutes > 23 * 60 + 59) {
      if (startMinutes === 23 * 60 && duration <= DEFAULT_DURATION_MINUTES) {
        endMinutes = 23 * 60 + 59
      } else {
        setDropTarget(null)
        setDraggingId(null)
        setNotice({ tone: 'error', text: 'Esse bloco termina depois das 23:59. Escolha outro início ou ajuste a duração.' })
        return
      }
    }

    const start = minutesToTime(startMinutes)
    const end = minutesToTime(endMinutes)
    const intervalError = getIntervalError(start, end)

    setDropTarget(null)
    setDraggingId(null)
    if (intervalError) {
      setNotice({ tone: 'error', text: intervalError })
      return
    }

    enableAlarmAudio()
    setSavingId(String(item.id))
    setNotice(null)

    const { data, error } = await supabase
      .from('demandas')
      .update({ data_exec: selectedDateKey, hora_inicio: start, hora_fim: end })
      .eq('id', item.id)
      .eq('tipo', 3)
      .select('id, data_exec, hora_inicio, hora_fim')
      .single()

    setSavingId(null)

    if (error) {
      setNotice({
        tone: 'error',
        text: error.message || `Não foi possível agendar “${item.demanda}”.`,
      })
      return
    }

    setRecords((current) => current.map((record) => (
      String(record.id) === String(data.id)
        ? { ...record, data_exec: data.data_exec, hora_inicio: data.hora_inicio, hora_fim: data.hora_fim }
        : record
    )))
    setNotice({ tone: 'success', text: `“${item.demanda}” agendada das ${formatTime(data.hora_inicio)} às ${formatTime(data.hora_fim)}.` })
  }

  function handleDragStart(event, item) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(item.id))
    setDraggingId(String(item.id))
  }

  function stopTaskAlerts() {
    stopAllRingingAlarms()
    taskAlerts.forEach((entry) => stopDailyTaskAlarm(entry.alarmId))
    setTaskAlerts([])
    taskAlertReturnFocusRef.current = null
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTarget(null)
  }

  function getDraggedItem(event) {
    const itemId = event.dataTransfer?.getData('text/plain')
    return eligibleSubtasks.find((record) => String(record.id) === itemId)
  }

  function getDropStartMinutes(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const position = Math.max(0, Math.min(rect.height, event.clientY - rect.top))
    const minutesFromTop = (position / HOUR_HEIGHT) * 60
    return Math.max(0, Math.min(23 * 60 + 45, Math.round(minutesFromTop / 15) * 15))
  }

  function handleTimelineDragOver(event) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const nextTarget = Math.floor(getDropStartMinutes(event) / 60)
    setDropTarget((current) => current === nextTarget ? current : nextTarget)
  }

  function handleDropOnTimeline(event) {
    event.preventDefault()
    const item = getDraggedItem(event)
    const startMinutes = getDropStartMinutes(event)
    if (item) void moveToTime(item, startMinutes)
    else {
      setDropTarget(null)
      setDraggingId(null)
    }
  }

  function handleDropToBacklog(event) {
    event.preventDefault()
    const item = getDraggedItem(event)
    setDropTarget(null)
    setDraggingId(null)
    if (item?.data_exec) void moveToBacklog(item)
  }

  function handleDragOver(event, target) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  function leaveDropZone(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null)
  }

  const dateLabel = selectedDate.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <section className="daily-planning-page" aria-labelledby="daily-planning-title" onClick={enableAlarmAudio}>
      <PageHeading className="daily-planning-heading" section="PLANEJAMENTO" titleId="daily-planning-title" title="Planejamento diário" description="Subtarefas de uma tarefa alocada ficam disponíveis em qualquer dia da mesma semana.">

        <DateNavigation dateLabel={dateLabel} isToday={isToday} onPrevious={() => changeDate(-1)} onNext={() => changeDate(1)} onToday={goToday} />
      </PageHeading>

      <div className="daily-planning-caption">
        <p>Organize o dia arrastando os blocos ou definindo um horário.</p>
        <span>{scheduledItems.length} {scheduledItems.length === 1 ? 'subtarefa agendada' : 'subtarefas agendadas'}</span>
      </div>

      {notice && (
        <p className={`planning-notice${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {routineLoadError && !routineLoading && (
        <p className="planning-notice is-error" role="alert">
          Não foi possível carregar as rotinas.{' '}
          <button type="button" className="daily-routines-retry" onClick={() => setReload((value) => value + 1)}>
            Tentar novamente
          </button>
        </p>
      )}

      {loading ? (
        <LoadingState>Carregando planejamento diário…</LoadingState>
      ) : loadError ? (
        <ErrorState title="Não foi possível carregar o planejamento diário." detail={loadError} onRetry={() => setReload((value) => value + 1)} />
      ) : (
        <div className="daily-planning-board-viewport">
          <div className="daily-planning-board">
            <div className="daily-planning-sidebar">
            <section className="daily-planning-lane daily-backlog-lane" aria-labelledby="daily-backlog-title">
              <header className="daily-lane-heading">
                <div>
                  <span className="daily-lane-overline">SEM HORÁRIO</span>
                  <h2 id="daily-backlog-title">Backlog</h2>
                </div>
                <span className="daily-lane-count">{backlogItems.length}</span>
              </header>
              <div
                className={`daily-lane-body${backlogItems.length === 0 ? ' is-empty' : ''}${dropTarget === 'backlog' ? ' is-drop-target' : ''}`}
                tabIndex={backlogItems.length > 2 ? 0 : undefined}
                aria-label={backlogItems.length > 2 ? 'Subtarefas sem horário' : undefined}
                onDragOver={(event) => handleDragOver(event, 'backlog')}
                onDrop={handleDropToBacklog}
                onDragLeave={leaveDropZone}
              >
                {backlogItems.length > 0 ? backlogItems.map((item) => (
                  <BacklogCard
                    key={item.id}
                    item={item}
                    saving={savingId === String(item.id)}
                    dragging={draggingId === String(item.id)}
                    onOpenEditor={(record) => openEditor(record)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                )) : (
                  <p className="daily-empty-lane">{eligibleSubtasks.some((item) => item.status !== 'Done') ? 'Todas as subtarefas estão agendadas.' : 'Sem subtarefas pendentes para este dia.'}</p>
                )}
              </div>
            </section>

            <section className="daily-agenda-list" aria-labelledby="daily-agenda-list-title">
              <header className="daily-agenda-list-heading">
                <div>
                  <span className="daily-lane-overline">ATIVIDADES DO DIA</span>
                  <h2 id="daily-agenda-list-title">Agenda</h2>
                </div>
                <span className="daily-lane-count">{timelineLayout.length}</span>
              </header>
              {timelineLayout.length > 0 ? (
                <ul className="daily-agenda-items" tabIndex={timelineLayout.length > 3 ? 0 : undefined} aria-label="Atividades agendadas">
                  {timelineLayout.map(({ item }, index) => (
                    <li key={`${item.isRoutine ? 'routine' : 'subtask'}-${item.id}`}>
                      <ScheduledCard
                        item={item.isRoutine ? item : { ...item, ...hierarchyBySubtaskId.get(String(item.id)) }}
                        index={index + 1}
                        saving={savingId === String(item.id)}
                        dragging={!item.isRoutine && draggingId === String(item.id)}
                        onOpenEditor={(record) => openEditor(record, formatTime(record.hora_inicio), formatTime(record.hora_fim))}
                        onMoveToBacklog={moveToBacklog}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="daily-agenda-empty">{routineLoading ? 'Carregando rotinas…' : 'Nenhuma atividade com horário neste dia.'}</p>
              )}
            </section>
            </div>

            <section className={`daily-planning-lane daily-execution-lane${isToday ? ' is-today' : ''}`} aria-labelledby="daily-execution-title">
              <header className="daily-lane-heading">
                <div>
                  <span className="daily-lane-overline">{isToday ? 'EXECUÇÃO DE HOJE' : 'EXECUÇÃO DO DIA'}</span>
                  <h2 id="daily-execution-title">{dateLabel}</h2>
                </div>
                <span className="daily-execution-summary">{scheduledItems.length} {scheduledItems.length === 1 ? 'subtarefa' : 'subtarefas'} · {dayRoutines.length} {dayRoutines.length === 1 ? 'rotina' : 'rotinas'}</span>
              </header>
              <div className="daily-timeline-toolbar">
                <div>
                  <strong>Linha do tempo</strong>
                  <span id="daily-timeline-help">Todos os horários · números da agenda</span>
                </div>
                <div className="daily-timeline-controls">
                  {isToday && <button type="button" onClick={() => { const now = new Date(); scrollTimelineTo(now.getHours() * 60 + now.getMinutes()) }}>Agora</button>}
                  {timelineLayout.length > 0 && <button type="button" onClick={() => scrollTimelineTo(timelineLayout[0].start)}>Primeira atividade</button>}
                  <label>
                    <select aria-label="Ir para horário" value="" onChange={(event) => { if (event.target.value !== '') scrollTimelineTo(Number(event.target.value) * 60) }}>
                      <option value="">Ir para horário</option>
                      {HOURS.map((hour) => <option value={hour} key={hour}>{String(hour).padStart(2, '0')}:00</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="daily-time-grid-viewport" ref={timelineViewportRef} role="region" tabIndex={0} aria-label={`Linha do tempo de ${dateLabel}`} aria-describedby="daily-timeline-help">
                <div className="daily-time-grid" style={{ minWidth: `${timelineMinWidth}px` }}>
                  <div className="daily-time-labels" aria-hidden="true">
                    {HOURS.map((hour) => (
                      <span className="daily-hour-label" key={hour}>{String(hour).padStart(2, '0')}:00</span>
                    ))}
                  </div>
                  <div
                    className="daily-time-column"
                    onDragOver={handleTimelineDragOver}
                    onDrop={handleDropOnTimeline}
                    onDragLeave={leaveDropZone}
                  >
                    {HOURS.map((hour) => (
                      <div
                        className={`daily-hour-line${dropTarget === hour ? ' is-drop-target' : ''}`}
                        key={hour}
                        style={{ top: `${hour * HOUR_HEIGHT}px` }}
                        aria-hidden="true"
                      />
                    ))}
                    {isToday && (
                      <div
                        className="daily-current-time-indicator"
                        style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px` }}
                        title={`Agora: ${currentTimeLabel}`}
                        aria-hidden="true"
                      >
                        <span>{currentTimeLabel}</span>
                      </div>
                    )}
                    {timelineLayout.map(({ item, start, duration, lane, laneCount }, index) => {
                      const style = {
                        top: `${(start / 60) * HOUR_HEIGHT}px`,
                        height: `${(duration / 60) * HOUR_HEIGHT}px`,
                        left: `calc(${(lane * 100) / laneCount}% + 3px)`,
                        width: `calc(${100 / laneCount}% - 6px)`,
                      }

                      return (
                        <TimelineCard
                          key={`${item.isRoutine ? 'routine' : 'subtask'}-${item.id}`}
                          item={item}
                          index={index + 1}
                          compact={duration < 30}
                          style={style}
                          saving={savingId === String(item.id)}
                          dragging={!item.isRoutine && draggingId === String(item.id)}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {editor && (
        <div className="daily-time-editor-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingEditor) {
            setEditor(null)
            setEditorError('')
          }
        }}>
          <form
            className="daily-time-editor"
            ref={editorDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-time-editor-title"
            onSubmit={saveTimeRange}
          >
            <div className="daily-time-editor-heading">
              <span className="daily-time-editor-icon"><ClockIcon /></span>
              <div>
                <p>PLANEJAMENTO DO DIA</p>
                <h2 id="daily-time-editor-title">Definir horário</h2>
              </div>
              <button
                className="daily-time-editor-close"
                type="button"
                aria-label="Fechar edição de horário"
                disabled={savingEditor}
                onClick={() => { setEditor(null); setEditorError('') }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
              </button>
            </div>
            <p className="daily-time-editor-record">{editor.item.demanda}</p>
            <p className="daily-time-editor-date">{dateLabel}</p>

            <div className="daily-time-fields">
              <label>
                <span>Início</span>
                <input
                  type="time"
                  required
                  autoFocus
                  value={editor.start}
                  onChange={(event) => { setEditor((current) => ({ ...current, start: event.target.value })); setEditorError('') }}
                />
              </label>
              <span className="daily-time-separator" aria-hidden="true">até</span>
              <label>
                <span>Término</span>
                <input
                  type="time"
                  required
                  value={editor.end}
                  onChange={(event) => { setEditor((current) => ({ ...current, end: event.target.value })); setEditorError('') }}
                />
              </label>
            </div>

            {editorError && <p className="daily-time-editor-error" role="alert">{editorError}</p>}

            <div className="daily-time-editor-actions">
              <button
                className="daily-time-cancel"
                type="button"
                disabled={savingEditor}
                onClick={() => { setEditor(null); setEditorError('') }}
              >
                Cancelar
              </button>
              <button className="daily-time-save" type="submit" disabled={savingEditor}>
                {savingEditor ? 'Salvando…' : 'Salvar horário'}
              </button>
            </div>
          </form>
        </div>
      )}

      {taskAlerts.length > 0 && (
        <div className="daily-activity-alert-backdrop">
          <section
            className="daily-activity-alert"
            ref={taskAlertDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="daily-activity-alert-title"
            aria-describedby="daily-activity-alert-description"
          >
            <div className="daily-activity-alert-heading">
              <span className="daily-activity-alert-icon"><ClockIcon /></span>
              <div>
                <p>ALERTA DO PLANEJAMENTO</p>
                <h2 id="daily-activity-alert-title">Hora da atividade</h2>
              </div>
            </div>
            <p id="daily-activity-alert-description">O horário agendado chegou. O alarme continuará tocando até você pará-lo.</p>
            <ul className="daily-activity-alert-list">
              {taskAlerts.map((entry) => (
                <li key={entry.alarmId}>
                  <span>{formatTime(entry.item.hora_inicio)} · ID {entry.hierarchyNumber}</span>
                  <strong>{entry.item.demanda}</strong>
                  <small>{entry.demandName} / {entry.taskName}</small>
                </li>
              ))}
            </ul>
            <button className="daily-activity-alert-stop" type="button" autoFocus onClick={stopTaskAlerts}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
              Parar alarme
            </button>
          </section>
        </div>
      )}
    </section>
  )
}

export default PlanejamentoDiarioPage
