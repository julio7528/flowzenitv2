import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import DateNavigation from '../components/DateNavigation.jsx'
import { useDailyDate } from '../hooks/useDailyDate.js'
import PageHeading from '../components/PageHeading.jsx'
import { ErrorState, LoadingState } from '../components/FeedbackState.jsx'
import { isSameCalendarWeek } from '../lib/calendarWeek.js'
import { getRoutineEndTime } from '../lib/recurringTime.js'

const STATUS_COLUMNS = [
  { value: 'Backlog', label: 'Backlog', className: 'kanban-column-backlog' },
  { value: 'Analise', label: 'Análise', className: 'kanban-column-analysis' },
  { value: 'Executando', label: 'Executando', className: 'kanban-column-executing' },
  { value: 'Aguardando', label: 'Aguardando', className: 'kanban-column-waiting' },
  { value: 'Done', label: 'Done', className: 'kanban-column-done' },
]
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

function formatTime(value) {
  return value ? String(value).slice(0, 5) : ''
}

function timeToMinutes(value) {
  if (!value) return null
  const [hours, minutes] = String(value).slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

function getIsoWeekday(date) {
  return ((date.getDay() + 6) % 7) + 1
}

function buildGanttRows(dayItems, routines) {
  const subtasks = dayItems
    .filter((item) => item.hora_inicio && item.hora_fim)
    .map((item) => ({
      ...item,
      isRoutine: false,
      start: timeToMinutes(item.hora_inicio),
      end: timeToMinutes(item.hora_fim),
    }))

  const routineRows = routines.map((routine) => {
    const start = timeToMinutes(routine.hora)
    const endTime = getRoutineEndTime(routine)
    return {
      ...routine,
      isRoutine: true,
      hora_inicio: routine.hora,
      hora_fim: endTime,
      start,
      end: timeToMinutes(endTime),
    }
  })

  return [...subtasks, ...routineRows]
    .filter((item) => item.start !== null && item.end !== null && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

function KanbanSubtaskCard({
  item,
  saving,
  dragging,
  draggable = true,
  onStatusChange,
  onDragStart,
  onDragEnd,
}) {
  const status = STATUS_COLUMNS.find((column) => column.value === (item.status || 'Backlog'))

  return (
    <article
      className={`daily-kanban-card${dragging ? ' is-dragging' : ''}`}
      draggable={draggable && !saving}
      onDragStart={draggable ? (event) => onDragStart(event, item) : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      aria-label={`Subtarefa ${item.demanda}, status ${status?.label ?? item.status}`}
    >
      <div className="daily-kanban-card-labels">
        <span className="daily-subtask-type">SUBTAREFA</span>
        {item.hora_inicio ? (
          <span className="daily-kanban-card-time">
            {formatTime(item.hora_inicio)}–{formatTime(item.hora_fim)}
          </span>
        ) : (
          <span className="daily-kanban-card-time is-unscheduled">Sem horário</span>
        )}
      </div>
      <h3>{item.demanda}</h3>
      {item.parentTask && <p className="daily-kanban-parent">{item.parentTask.demanda}</p>}
      <label className="daily-kanban-status-control">
        <select
          value={item.status || 'Backlog'}
          disabled={saving}
          onChange={(event) => { void onStatusChange(item, event.target.value) }}
          aria-label={`Alterar status de ${item.demanda}`}
        >
          {STATUS_COLUMNS.map((column) => (
            <option key={column.value} value={column.value}>{column.label}</option>
          ))}
        </select>
      </label>
    </article>
  )
}

function GanttChart({ dayItems, routines, savingId, onStatusChange, selectedDateKey }) {
  const rows = useMemo(() => buildGanttRows(dayItems, routines), [dayItems, routines])
  const unscheduled = dayItems.filter((item) => !item.hora_inicio || !item.hora_fim)
  const viewportRef = useRef(null)
  const firstStart = rows[0]?.start

  useEffect(() => {
    if (viewportRef.current && firstStart !== undefined) viewportRef.current.scrollLeft = Math.max(0, (Math.floor(firstStart / 60) - 1) * 60)
  }, [selectedDateKey, firstStart])

  return (
    <div className="daily-gantt-view">
      <p className="daily-gantt-scroll-hint">Deslize a linha do tempo para ver todos os horários.</p>
      <div className="daily-gantt-viewport" role="region" tabIndex={0} ref={viewportRef} aria-label="Gráfico de Gantt por horário; role horizontalmente para ver todas as horas">
        <div className="daily-gantt-chart">
          <div className="daily-gantt-axis-label">ATIVIDADE</div>
          <div className="daily-gantt-axis" role="group" aria-label="Horários do dia">
            {HOURS.map((hour) => (
              <span key={hour}>{String(hour).padStart(2, '0')}</span>
            ))}
          </div>

          {rows.length > 0 ? rows.map((item) => {
            const duration = item.end - item.start
            const startLabel = formatTime(item.hora_inicio)
            const endLabel = formatTime(item.hora_fim)
            const barLabel = duration >= 90 ? `${startLabel}–${endLabel}` : ''
            const title = item.isRoutine ? item.demanda : item.parentTask?.demanda

            return (
              <Fragment key={`${item.isRoutine ? 'routine' : 'subtask'}-${item.id}`}>
                <div className={`daily-gantt-task-label${item.isRoutine ? ' is-routine' : ''}`}>
                  <span>{item.isRoutine ? 'ROTINA' : 'SUBTAREFA'}</span>
                  <strong>{item.demanda}</strong>
                  <small>{item.isRoutine ? 'Recorrente' : `${title || 'Tarefa'} · ${STATUS_COLUMNS.find((status) => status.value === (item.status || 'Backlog'))?.label ?? item.status}`}</small>
                  <span className="daily-gantt-label-time">{startLabel}–{endLabel}</span>
                </div>
                <div className="daily-gantt-track">
                  <div
                    className={`daily-gantt-bar${item.isRoutine ? ' is-routine' : ` ${STATUS_COLUMNS.find((status) => status.value === (item.status || 'Backlog'))?.className ?? 'kanban-column-backlog'}`}`}
                    style={{
                      left: `${(item.start / (24 * 60)) * 100}%`,
                      width: `${(duration / (24 * 60)) * 100}%`,
                    }}
                    role="img"
                    title={`${item.demanda} · ${startLabel}–${endLabel}`}
                    aria-label={`${item.isRoutine ? 'Rotina' : 'Subtarefa'} ${item.demanda}, ${startLabel}–${endLabel}`}
                  >
                    {barLabel && <span aria-hidden="true">{barLabel}</span>}
                  </div>
                </div>
              </Fragment>
            )
          }) : (
            <p className="daily-gantt-empty">Nenhum item com horário neste dia.</p>
          )}
        </div>
      </div>

      <ul className="daily-gantt-legend" aria-label="Legenda do gráfico">
        {STATUS_COLUMNS.map((column) => (
          <li key={column.value}>
            <span className={`daily-gantt-legend-dot ${column.className}`} aria-hidden="true" />
            {column.label}
          </li>
        ))}
        <li><span className="daily-gantt-legend-dot is-routine" aria-hidden="true" />Rotina</li>
      </ul>

      {unscheduled.length > 0 && (
        <section className="daily-gantt-backlog" aria-labelledby="daily-gantt-backlog-title">
          <header>
            <div>
              <span>ATIVIDADES DO DIA</span>
              <h2 id="daily-gantt-backlog-title">Sem horário</h2>
            </div>
            <span className="daily-kanban-count">{unscheduled.length}</span>
          </header>
          <div className="daily-gantt-backlog-list">
            {unscheduled.map((item) => (
              <KanbanSubtaskCard
                key={item.id}
                item={item}
                saving={Boolean(savingId)}
                draggable={false}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function KanbanPage() {
  const [records, setRecords] = useState([])
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [routineLoading, setRoutineLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [routineLoadError, setRoutineLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [savingId, setSavingId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTarget, setDropTarget] = useState('')
  const [notice, setNotice] = useState(null)
  const [view, setView] = useState('kanban')
  const [mobileStatus, setMobileStatus] = useState(null)

  const { selectedDate, selectedDateKey, isToday, changeDate, goToday } = useDailyDate()

  useEffect(() => {
    let active = true

    async function loadItems() {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('demandas')
        .select('id, demanda, tipo, raizid, status, data_exec, hora_inicio, hora_fim')
        .in('tipo', [2, 3])
        .order('id', { ascending: true })

      if (!active) return

      if (error) {
        setLoadError(error.message || 'Não foi possível carregar os itens do Kanban.')
        setRecords([])
      } else {
        setRecords(data ?? [])
      }

      setLoading(false)
    }

    void loadItems()
    return () => { active = false }
  }, [reload])

  useEffect(() => {
    let active = true

    async function loadDayRoutines() {
      setRoutineLoading(true)
      setRoutineLoadError('')
      setRoutines([])

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
        setRoutineLoadError(error.message || 'Não foi possível carregar as rotinas do dia.')
        setRoutines([])
      } else {
        setRoutines(data ?? [])
      }

      setRoutineLoading(false)
    }

    void loadDayRoutines()
    return () => { active = false }
  }, [reload, selectedDate, selectedDateKey])

  const tasksById = useMemo(() => new Map(
    records.filter((record) => record.tipo === 2).map((task) => [String(task.id), task]),
  ), [records])

  const dayItems = useMemo(() => records
    .filter((record) => {
      if (record.tipo !== 3) return false
      const parentTask = tasksById.get(String(record.raizid))
      return isSameCalendarWeek(parentTask?.data_exec, selectedDateKey)
        && (!record.data_exec || record.data_exec === selectedDateKey)
    })
    .map((item) => ({
      ...item,
      parentTask: tasksById.get(String(item.raizid)),
    }))
    .sort((a, b) => {
      const aTime = a.hora_inicio ? String(a.hora_inicio) : '99:99'
      const bTime = b.hora_inicio ? String(b.hora_inicio) : '99:99'
      return aTime.localeCompare(bTime) || String(a.demanda).localeCompare(String(b.demanda), 'pt-BR')
    }), [records, selectedDateKey, tasksById])

  const dateLabel = selectedDate.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
  const visibleStatus = mobileStatus ?? STATUS_COLUMNS.find((column) => dayItems.some((item) => (item.status || 'Backlog') === column.value))?.value ?? 'Backlog'

  async function updateStatus(item, nextStatus) {
    if (savingId || item.status === nextStatus) return

    setSavingId(String(item.id))
    setNotice(null)

    const { data, error } = await supabase
      .from('demandas')
      .update({ status: nextStatus })
      .eq('id', item.id)
      .eq('tipo', 3)
      .select('id, status')
      .single()

    setSavingId(null)

    if (error) {
      setNotice({ tone: 'error', text: error.message || `Não foi possível alterar o status de “${item.demanda}”.` })
      return
    }

    setRecords((current) => current.map((record) => (
      String(record.id) === String(data.id) ? { ...record, status: data.status } : record
    )))
    setNotice({ tone: 'success', text: `“${item.demanda}” movida para ${STATUS_COLUMNS.find((status) => status.value === data.status)?.label ?? data.status}.` })
  }

  function handleDragStart(event, item) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(item.id))
    setDraggingId(String(item.id))
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTarget('')
  }

  function handleDragOver(event, status) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setDropTarget(status)
  }

  function handleDrop(event, status) {
    event.preventDefault()
    const id = event.dataTransfer?.getData('text/plain')
    const item = dayItems.find((record) => String(record.id) === id)
    setDraggingId(null)
    setDropTarget('')
    if (item) void updateStatus(item, status)
  }

  return (
    <section className="daily-kanban-page" aria-labelledby="daily-kanban-title">
      <PageHeading className="daily-kanban-heading" section="ACOMPANHAMENTO" titleId="daily-kanban-title" title="Kanban diário" description="Acompanhe o status das subtarefas planejadas para cada dia.">

        <DateNavigation dateLabel={dateLabel} isToday={isToday} onPrevious={() => changeDate(-1)} onNext={() => changeDate(1)} onToday={goToday} />
      </PageHeading>

      <div className="daily-kanban-caption">
        <p>{view === 'kanban'
          ? 'Os status atualizados também refletem na hierarquia de demandas.'
          : 'As barras mostram os horários e as durações planejadas para o dia.'}</p>
        <span>{dayItems.length} {dayItems.length === 1 ? 'subtarefa do dia' : 'subtarefas do dia'}</span>
      </div>

      <div className="daily-kanban-view-switch" role="group" aria-label="Visualização do planejamento">
        <button
          type="button"
          className={view === 'kanban' ? 'is-active' : ''}
          aria-pressed={view === 'kanban'}
          onClick={() => setView('kanban')}
        >
          Kanban
        </button>
        <button
          type="button"
          className={view === 'gantt' ? 'is-active' : ''}
          aria-pressed={view === 'gantt'}
          onClick={() => setView('gantt')}
        >
          Gantt
        </button>
      </div>

      {notice && (
        <p className={`planning-notice${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {loading ? (
        <LoadingState>Carregando Kanban…</LoadingState>
      ) : loadError ? (
        <ErrorState title="Não foi possível carregar os itens do Kanban." detail={loadError} onRetry={() => setReload((value) => value + 1)} />
      ) : (
        view === 'kanban' ? (
          <>
          <div className="daily-kanban-mobile-status" role="group" aria-label="Escolher coluna de status">
            {STATUS_COLUMNS.map((column) => (
              <button type="button" key={column.value} className={visibleStatus === column.value ? 'is-active' : ''} aria-pressed={visibleStatus === column.value} onClick={() => setMobileStatus(column.value)}>
                {column.label} <span>{dayItems.filter((item) => (item.status || 'Backlog') === column.value).length}</span>
              </button>
            ))}
          </div>
          <div className="daily-kanban-viewport" role="region" aria-label={`Kanban do dia ${dateLabel}`}>
            <div className="daily-kanban-board">
              {STATUS_COLUMNS.map((column) => {
                const columnItems = dayItems.filter((item) => (item.status || 'Backlog') === column.value)

                return (
                  <section
                    className={`daily-kanban-column ${column.className}${dropTarget === column.value ? ' is-drop-target' : ''}${visibleStatus !== column.value ? ' is-mobile-hidden' : ''}`}
                    key={column.value}
                    aria-labelledby={`kanban-column-${column.value}`}
                    onDragOver={(event) => handleDragOver(event, column.value)}
                    onDrop={(event) => handleDrop(event, column.value)}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget('')
                    }}
                  >
                    <header className="daily-kanban-column-heading">
                      <div>
                        <span className="daily-kanban-status-dot" aria-hidden="true" />
                        <h2 id={`kanban-column-${column.value}`}>{column.label}</h2>
                      </div>
                      <span className="daily-kanban-count">{columnItems.length}</span>
                    </header>
                    <div className="daily-kanban-column-body">
                      {columnItems.length > 0 ? columnItems.map((item) => (
                        <KanbanSubtaskCard
                          key={item.id}
                          item={item}
                          saving={Boolean(savingId)}
                          dragging={draggingId === String(item.id)}
                          onStatusChange={updateStatus}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      )) : (
                        <p className="daily-kanban-empty">Sem subtarefas neste status.</p>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
          </>
        ) : (
          <>
            {routineLoadError && !routineLoading && (
              <p className="planning-notice is-error" role="alert">
                Não foi possível carregar as rotinas para o Gantt.{' '}
                <button type="button" className="daily-routines-retry" onClick={() => setReload((value) => value + 1)}>
                  Tentar novamente
                </button>
              </p>
            )}
            {routineLoading ? (
              <LoadingState>Carregando horários e rotinas…</LoadingState>
            ) : (
              <GanttChart
                dayItems={dayItems}
                routines={routines}
                savingId={savingId}
                selectedDateKey={selectedDateKey}
                onStatusChange={updateStatus}
              />
            )}
          </>
        )
      )}
    </section>
  )
}

export default KanbanPage
