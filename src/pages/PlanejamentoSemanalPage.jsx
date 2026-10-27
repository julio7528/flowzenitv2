import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import PageHeading from '../components/PageHeading.jsx'
import { ErrorState, LoadingState } from '../components/FeedbackState.jsx'
import { isSameCalendarWeek } from '../lib/calendarWeek.js'

const TYPE_LABELS = {
  1: 'Demanda',
  2: 'Tarefa',
}

function startOfWeek(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysSinceMonday = (monday.getDay() + 6) % 7
  monday.setDate(monday.getDate() - daysSinceMonday)
  return monday
}

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + amount)
  return next
}

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shortMonth(date) {
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

function formatWeekRange(start, end) {
  return `${start.getDate()} ${shortMonth(start)} – ${end.getDate()} ${shortMonth(end)} ${end.getFullYear()}`
}

function formatDayChoice(date) {
  const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' })
  return `${weekday.replace('.', '')}, ${date.getDate()} ${shortMonth(date)}`
}

function PlanningCard({ item, demandName, days, saving, dragging, onMove, onDragStart, onDragEnd }) {
  const typeLabel = TYPE_LABELS[item.tipo]
  const originLabel = item.tipo === 2 ? `Demanda: ${demandName || 'origem não encontrada'}` : ''
  const itemLabel = item.tipo === 2
    ? `Tarefa ${item.demanda}, da demanda ${demandName || 'origem não encontrada'}`
    : `${typeLabel.toLowerCase()} ${item.demanda}`

  return (
    <article
      className={`planner-record${saving || dragging ? ' is-moving' : ''}`}
      draggable={!saving}
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
      aria-label={`${typeLabel}: ${item.demanda}${originLabel ? `. ${originLabel}` : ''}`}
    >
      <div className="planner-record-heading">
        <span className={`planner-type-label planner-type-${item.tipo === 1 ? 'demand' : 'task'}`}>
          {typeLabel}
        </span>
        <span className="planner-drag-mark" aria-hidden="true">⠿</span>
      </div>
      <h3>{item.demanda}</h3>
      {item.tipo === 2 && (
        <p className="planner-record-origin">
          <span>Demanda:</span> {demandName || 'origem não encontrada'}
        </p>
      )}
      <label className="planner-move-control">
        <span className="visually-hidden">Mover {itemLabel}</span>
        <select
          value={item.data_exec || 'backlog'}
          disabled={saving}
          onChange={(event) => onMove(item, event.target.value === 'backlog' ? null : event.target.value)}
          aria-label={`Mover ${itemLabel}`}
          title="Alterar alocação"
        >
          <option value="backlog">Backlog</option>
          {days.map((day) => (
            <option key={day.iso} value={day.iso}>{day.choiceLabel}</option>
          ))}
        </select>
      </label>
    </article>
  )
}

function PlanningArrow({ direction }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      {direction === 'previous'
        ? <path d="m12.5 4-6 6 6 6" />
        : <path d="m7.5 4 6 6-6 6" />}
    </svg>
  )
}

function PlanejamentoSemanalPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [today, setToday] = useState(() => new Date())
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [savingId, setSavingId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [notice, setNotice] = useState(null)
  const [pendingMove, setPendingMove] = useState(null)
  const [mobileDay, setMobileDay] = useState(null)
  const confirmReturnFocus = useRef(null)
  const todayKey = toDateKey(today)

  useEffect(() => {
    const nextMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const timer = setTimeout(() => setToday(new Date()), nextMidnight.getTime() - Date.now() + 50)
    return () => clearTimeout(timer)
  }, [today])

  useEffect(() => {
    let active = true

    async function loadRecords() {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('demandas')
        .select('id, demanda, tipo, raizid, data_exec')
        .in('tipo', [1, 2])
        .order('id', { ascending: true })

      if (!active) return

      if (error) {
        setLoadError(error.message || 'Não foi possível carregar o planejamento.')
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

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index)
    return {
      date,
      iso: toDateKey(date),
      weekday: date.toLocaleDateString('pt-BR', { weekday: 'long' }),
      dateLabel: date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
      choiceLabel: formatDayChoice(date),
    }
  }), [weekStart])

  const tasksByDemand = useMemo(() => new Set(
    records
      .filter((record) => record.tipo === 2)
      .map((task) => String(task.raizid)),
  ), [records])

  const demandNamesById = useMemo(() => new Map(
    records
      .filter((record) => record.tipo === 1)
      .map((demand) => [String(demand.id), demand.demanda]),
  ), [records])

  const planningItems = useMemo(() => records.filter((record) => (
    record.tipo === 2
    || (record.tipo === 1 && !tasksByDemand.has(String(record.id)))
  )), [records, tasksByDemand])

  const backlogItems = planningItems.filter((item) => !item.data_exec)
  const currentWeekEnd = days[6].date
  const currentWeekStartKey = toDateKey(weekStart)
  const currentWeek = toDateKey(startOfWeek(today)) === currentWeekStartKey
  const visibleMobileDay = days.some((day) => day.iso === mobileDay) ? mobileDay : (days.find((day) => day.iso === todayKey)?.iso ?? days[0].iso)

  async function requestMove(item, targetDate) {
    if (savingId || item.data_exec === targetDate) return
    const resetsSubtaskSchedules = !targetDate || !isSameCalendarWeek(item.data_exec, targetDate)
    if (item.tipo === 2 && item.data_exec && resetsSubtaskSchedules) {
      confirmReturnFocus.current = document.activeElement
      setSavingId(String(item.id))
      const { data, error } = await supabase.from('demandas').select('id').eq('tipo', 3).eq('raizid', item.id).not('data_exec', 'is', null).limit(1)
      setSavingId(null)
      if (error) {
        setNotice({ tone: 'error', text: 'Não foi possível verificar os horários das subtarefas. Tente novamente.' })
        return
      }
      if (data?.length) {
        setPendingMove({ item, targetDate })
        return
      }
    }
    await moveItem(item, targetDate)
  }

  async function moveItem(item, targetDate) {
    if (savingId || item.data_exec === targetDate) return

    setSavingId(String(item.id))
    setNotice(null)

    const { data, error } = await supabase
      .from('demandas')
      .update({ data_exec: targetDate })
      .eq('id', item.id)
      .eq('tipo', item.tipo)
      .select('id, data_exec')
      .single()

    setSavingId(null)

    if (error) {
      setNotice({
        tone: 'error',
        text: error.message || `Não foi possível alterar a alocação de ${item.demanda}.`,
      })
      return
    }

    setRecords((current) => current.map((record) => (
      String(record.id) === String(item.id) ? { ...record, data_exec: data.data_exec } : record
    )))

    const destination = data.data_exec
      ? days.find((day) => day.iso === data.data_exec)?.choiceLabel ?? data.data_exec
      : 'Backlog'
    setNotice({ tone: 'success', text: `${typeLabelFor(item)} alocada em ${destination}.` })
  }

  function handleDragStart(event, item) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(item.id))
    setDraggingId(String(item.id))
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDropTarget(null)
  }

  function handleDragOver(event, target) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  function handleDrop(event, target) {
    event.preventDefault()
    const itemId = event.dataTransfer?.getData('text/plain')
    const item = planningItems.find((record) => String(record.id) === itemId)
    setDropTarget(null)
    setDraggingId(null)
    if (item) void requestMove(item, target === 'backlog' ? null : target)
  }

  function leaveDropZone(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null)
  }

  function renderItems(items) {
    return items.map((item) => (
      <PlanningCard
        item={item}
        demandName={item.tipo === 2 ? demandNamesById.get(String(item.raizid)) : undefined}
        days={days}
        key={item.id}
        saving={savingId === String(item.id)}
        dragging={draggingId === String(item.id)}
        onMove={requestMove}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      />
    ))
  }

  return (
    <section className="weekly-planning-page" aria-labelledby="weekly-planning-title">
      <PageHeading className="planning-heading" section="PLANEJAMENTO" titleId="weekly-planning-title" title="Planejamento semanal" description="Alocação de demandas e tarefas por dia da semana.">

        <nav className="planning-week-controls" aria-label="Navegar entre semanas">
          <button
            className="planning-week-arrow"
            type="button"
            aria-label="Semana anterior"
            onClick={() => setWeekStart((current) => addDays(current, -7))}
          >
            <PlanningArrow direction="previous" />
          </button>
          <div className="planning-week-range" aria-live="polite">
            <span>{currentWeek ? 'SEMANA ATUAL' : 'SEMANA'}</span>
            <strong>{formatWeekRange(weekStart, currentWeekEnd)}</strong>
          </div>
          <button
            className="planning-week-arrow"
            type="button"
            aria-label="Próxima semana"
            onClick={() => setWeekStart((current) => addDays(current, 7))}
          >
            <PlanningArrow direction="next" />
          </button>
          {!currentWeek && (
            <button
              className="planning-current-week-button"
              type="button"
              onClick={() => setWeekStart(startOfWeek(today))}
            >
              Esta semana
            </button>
          )}
        </nav>
      </PageHeading>

      <div className="planning-board-caption">
        <p>Arraste os blocos para um dia. Use o menu do bloco para mover sem arrastar.</p>
        <span>{planningItems.length} {planningItems.length === 1 ? 'item planejável' : 'itens planejáveis'}</span>
      </div>

      {notice && (
        <p className={`planning-notice${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {loading ? (
        <LoadingState>Carregando planejamento…</LoadingState>
      ) : loadError ? (
        <ErrorState title="Não foi possível carregar o planejamento." detail={loadError} onRetry={() => setReload((value) => value + 1)} />
      ) : (
        <>
        <div className="planning-mobile-days" role="group" aria-label="Escolher dia da semana">
          {days.map((day) => (
            <button type="button" key={day.iso} className={visibleMobileDay === day.iso ? 'is-active' : ''} aria-pressed={visibleMobileDay === day.iso} onClick={() => setMobileDay(day.iso)}>
              {day.choiceLabel}
            </button>
          ))}
        </div>
        <div className="planning-board-viewport" role="region" aria-label="Quadro de planejamento semanal">
          <div className="planning-board">
            <section className="planner-lane planner-backlog-lane" aria-labelledby="planner-backlog-title">
              <header className="planner-lane-heading">
                <div>
                  <span className="planner-lane-overline">SEM DATA</span>
                  <h2 id="planner-backlog-title">Backlog</h2>
                </div>
                <span className="planner-lane-count">{backlogItems.length}</span>
              </header>
              <div
                className={`planner-lane-body${dropTarget === 'backlog' ? ' is-drop-target' : ''}`}
                onDragOver={(event) => handleDragOver(event, 'backlog')}
                onDrop={(event) => handleDrop(event, 'backlog')}
                onDragLeave={leaveDropZone}
              >
                {backlogItems.length > 0 ? renderItems(backlogItems) : (
                  <p className="planner-empty-lane">Sem itens no backlog.</p>
                )}
              </div>
            </section>

            <div className="planning-week-grid">
              {days.map((day) => {
                const dayItems = planningItems.filter((item) => item.data_exec === day.iso)
                const isToday = day.iso === todayKey

                return (
                  <section className={`planner-lane planner-day-lane${isToday ? ' is-today' : ''}${visibleMobileDay !== day.iso ? ' is-mobile-hidden' : ''}`} key={day.iso} aria-labelledby={`planner-day-${day.iso}`}>
                    <header className="planner-lane-heading">
                      <div>
                        <span className="planner-lane-overline">{day.dateLabel}</span>
                        <h2 id={`planner-day-${day.iso}`}>{day.weekday}</h2>
                      </div>
                      <span className="planner-lane-count">{dayItems.length}</span>
                    </header>
                    <div
                      className={`planner-lane-body${dropTarget === day.iso ? ' is-drop-target' : ''}`}
                      onDragOver={(event) => handleDragOver(event, day.iso)}
                      onDrop={(event) => handleDrop(event, day.iso)}
                      onDragLeave={leaveDropZone}
                    >
                      {dayItems.length > 0 ? renderItems(dayItems) : (
                        <p className="planner-empty-lane">Solte aqui</p>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        </div>
        </>
      )}
      <ConfirmDialog
        open={Boolean(pendingMove)}
        title="Reagendar tarefa?"
        confirmLabel="Reagendar tarefa"
        returnFocusRef={confirmReturnFocus}
        onCancel={() => setPendingMove(null)}
        onConfirm={() => { const move = pendingMove; setPendingMove(null); if (move) void moveItem(move.item, move.targetDate) }}
      >
        <p>A tarefa “{pendingMove?.item.demanda}” possui subtarefas alocadas. Ao movê-la para outra semana ou para o backlog, as datas e os horários dessas subtarefas serão removidos e precisarão ser definidos novamente.</p>
      </ConfirmDialog>
    </section>
  )
}

function typeLabelFor(item) {
  return TYPE_LABELS[item.tipo]
}

export default PlanejamentoSemanalPage
