import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { supabase } from '../lib/supabase.js'
import StatusBadge from '../components/StatusBadge.jsx'
import { ErrorState, LoadingState } from '../components/FeedbackState.jsx'
import './InicioPage.css'

const STATUS_ORDER = ['Backlog', 'Analise', 'Executando', 'Aguardando', 'Done']
const STATUS_LABELS = { Analise: 'Análise' }

function getDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getIsoWeekday(date) {
  return ((date.getDay() + 6) % 7) + 1
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : 'Horário não definido'
}

function addOneHour(value) {
  const [hour, minute] = String(value ?? '00:00').slice(0, 5).split(':').map(Number)
  const total = Math.min(24 * 60, hour * 60 + minute + 60)
  if (total === 24 * 60) return '24:00'
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function getDateLabel(date) {
  const label = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1)
}

function Metric({ label, value, detail, accent }) {
  return (
    <div className={`home-metric ${accent ? 'is-accent' : ''}`}>
      <span className="home-metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="home-metric-detail">{detail}</span>
    </div>
  )
}

function ClockIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" /></svg>
}

function InicioPage() {
  const [records, setRecords] = useState([])
  const [routines, setRoutines] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [today, setToday] = useState(() => new Date())
  const todayKey = getDateKey(today)

  useEffect(() => {
    const nextMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    const timer = setTimeout(() => setToday(new Date()), nextMidnight.getTime() - Date.now() + 50)
    return () => clearTimeout(timer)
  }, [today])

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setLoadError('')

      const [demandResult, routineResult] = await Promise.all([
        supabase
          .from('demandas')
          .select('id, demanda, tipo, raizid, status, data_exec, hora_inicio, hora_fim')
          .order('id', { ascending: true }),
        supabase
          .from('recorrente')
          .select('id, demanda, hora, dias_semana, data_inicial, data_final')
          .order('hora', { ascending: true }),
      ])

      if (!active) return

      if (demandResult.error || routineResult.error) {
        setLoadError(demandResult.error?.message || routineResult.error?.message || 'Não foi possível carregar o painel.')
        setRecords([])
        setRoutines([])
      } else {
        setRecords(demandResult.data ?? [])
        setRoutines(routineResult.data ?? [])
      }

      setLoading(false)
    }

    void loadDashboard()
    return () => { active = false }
  }, [reload])

  const counts = useMemo(() => ({
    demands: records.filter((item) => item.tipo === 1).length,
    tasks: records.filter((item) => item.tipo === 2).length,
    subtasks: records.filter((item) => item.tipo === 3).length,
  }), [records])

  const statusCounts = useMemo(() => Object.fromEntries(
    STATUS_ORDER.map((status) => [status, records.filter((item) => item.tipo === 3 && item.status === status).length]),
  ), [records])

  const todayPlan = useMemo(() => {
    const tasksById = new Map(records.filter((item) => item.tipo === 2).map((task) => [String(task.id), task]))
    const eligibleSubtasks = records.filter((item) => (
      item.tipo === 3 && tasksById.get(String(item.raizid))?.data_exec === todayKey
    ))
    const scheduledSubtasks = eligibleSubtasks
      .filter((item) => item.data_exec === todayKey)
      .map((item) => ({
        id: `subtask-${item.id}`,
        name: item.demanda,
        start: item.hora_inicio,
        end: item.hora_fim,
        status: item.status,
        type: 'Subtarefa',
      }))
    const weekday = getIsoWeekday(today)
    const activeRoutines = routines
      .filter((item) => (
        (item.dias_semana ?? []).map(Number).includes(weekday)
        && item.data_inicial <= todayKey
        && item.data_final >= todayKey
      ))
      .map((item) => ({
        id: `routine-${item.id}`,
        name: item.demanda,
        start: item.hora,
        end: addOneHour(item.hora),
        type: 'Rotina',
      }))

    return {
      backlogCount: eligibleSubtasks.filter((item) => !item.data_exec && item.status !== 'Done').length,
      scheduledSubtaskCount: scheduledSubtasks.length,
      routines: activeRoutines,
      agenda: [...scheduledSubtasks, ...activeRoutines]
        .sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? ''))),
    }
  }, [records, routines, today, todayKey])

  const dailyPath = `/interno/planejamento-diario?data=${todayKey}`

  return (
    <section className="flow-dashboard" aria-labelledby="home-title">
      <header className="home-heading">
        <div>
          <p className="home-eyebrow">FLOWZENIT <span>/</span> PAINEL</p>
          <h1 id="home-title">Visão geral</h1>
          <p className="home-date">{getDateLabel(today)}</p>
        </div>
        <Link className="home-primary-action" to={dailyPath}>
          Abrir planejamento de hoje
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
        </Link>
      </header>

      {loading ? (
        <LoadingState className="home-state">Carregando o resumo de hoje…</LoadingState>
      ) : loadError ? (
        <ErrorState
          className="home-state"
          title="O painel não pôde ser carregado."
          detail={loadError}
          onRetry={() => setReload((value) => value + 1)}
          actionClassName="home-retry"
        />
      ) : (
        <>
          <section className="home-metrics" aria-label="Resumo do cadastro">
            <Metric label="Demandas" value={counts.demands} detail="nível principal" />
            <Metric label="Tarefas" value={counts.tasks} detail="ligadas às demandas" />
            <Metric label="Subtarefas" value={counts.subtasks} detail="unidades de execução" />
            <Metric label="No plano de hoje" value={todayPlan.scheduledSubtaskCount} detail="subtarefas com horário" accent />
          </section>

          <div className="home-dashboard-grid">
            <section className="home-agenda" aria-labelledby="home-agenda-title">
              <div className="home-section-heading">
                <div>
                  <p className="home-section-kicker">HOJE</p>
                  <h2 id="home-agenda-title">Programação diária</h2>
                </div>
                <Link to={dailyPath} className="home-text-link">Ver planejamento <span aria-hidden="true">→</span></Link>
              </div>
              {todayPlan.agenda.length ? (
                <ol className="home-agenda-list">
                  {todayPlan.agenda.slice(0, 7).map((item) => (
                    <li className="home-agenda-item" key={item.id}>
                      <span className="home-agenda-time"><ClockIcon />{formatTime(item.start)}</span>
                      <div className="home-agenda-copy">
                        <strong>{item.name}</strong>
                        <span>{item.type === 'Rotina' ? `Rotina recorrente · ${formatTime(item.start)}–${formatTime(item.end)}` : `Subtarefa · ${formatTime(item.start)}–${formatTime(item.end)}`}</span>
                      </div>
                      {item.type === 'Rotina' ? <span className="home-routine-label">ROTINA</span> : <StatusBadge status={item.status} />}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="home-agenda-empty">
                  <p>Nenhuma atividade com horário para hoje.</p>
                  <span>{todayPlan.backlogCount ? `${todayPlan.backlogCount} subtarefa(s) aguardam horário no backlog diário.` : 'Subtarefas com status Done não aparecem no backlog diário.'}</span>
                </div>
              )}
              {todayPlan.agenda.length > 7 && <p className="home-agenda-more">+ {todayPlan.agenda.length - 7} itens no restante do dia</p>}
              <div className="home-agenda-footnote">
                <span>{todayPlan.backlogCount} subtarefa(s) no backlog diário</span>
                <span>{todayPlan.routines.length} rotina(s) hoje</span>
              </div>
            </section>

            <aside className="home-aside" aria-label="Atalhos e status">
              <section className="home-status-summary" aria-labelledby="home-status-title">
                <p className="home-section-kicker">ACOMPANHAMENTO</p>
                <h2 id="home-status-title">Status das subtarefas</h2>
                <ul>
                  {STATUS_ORDER.map((status) => (
                    <li key={status} className={`home-status-row home-status-${status === 'Analise' ? 'analysis' : status.toLowerCase()}`}>
                      <span className="home-status-dot" aria-hidden="true" />
                      <span>{STATUS_LABELS[status] ?? status}</span>
                      <strong>{statusCounts[status]}</strong>
                    </li>
                  ))}
                </ul>
              </section>

              <nav className="home-shortcuts" aria-labelledby="home-shortcuts-title">
                <p className="home-section-kicker">ACESSO RÁPIDO</p>
                <h2 id="home-shortcuts-title">Ir para</h2>
                <Link to="/interno/demandas">Cadastro de demandas <span aria-hidden="true">↗</span></Link>
                <Link to="/interno/recorrentes">Demandas recorrentes <span aria-hidden="true">↗</span></Link>
                <Link to="/interno/planejamento-semanal">Planejamento semanal <span aria-hidden="true">↗</span></Link>
                <Link to="/interno/kanban">Kanban do dia <span aria-hidden="true">↗</span></Link>
                <Link to="/interno/pomodoro">Configurações do Pomodoro <span aria-hidden="true">↗</span></Link>
              </nav>
            </aside>
          </div>

          <section className="home-rules" aria-labelledby="home-rules-title">
            <div className="home-section-heading">
              <div>
                <p className="home-section-kicker">COMO O FLUXO FUNCIONA</p>
                <h2 id="home-rules-title">Regras operacionais</h2>
              </div>
              <span className="home-rules-caption">Referência rápida</span>
            </div>
            <ol className="home-rules-list">
              <li>
                <span className="home-rule-number">01</span>
                <p><strong>Hierarquia.</strong> Uma demanda pode conter tarefas; cada tarefa pode conter subtarefas. Um item com filhos vinculados não pode ser excluído.</p>
              </li>
              <li>
                <span className="home-rule-number">02</span>
                <p><strong>Status.</strong> O status da subtarefa pode ser Backlog, Análise, Executando, Aguardando ou Done. Tarefa e demanda são calculadas: todos os filhos em Backlog mantêm Backlog; todos em Done resultam em Done; nos demais casos, ficam Em andamento.</p>
              </li>
              <li>
                <span className="home-rule-number">03</span>
                <p><strong>Planejamento semanal.</strong> Aloca tarefas por data. A demanda só é alocada quando não possui tarefas; subtarefas não são escolhidas nessa etapa.</p>
              </li>
              <li>
                <span className="home-rule-number">04</span>
                <p><strong>Planejamento diário.</strong> Só subtarefas de tarefas alocadas para o dia entram na execução; demandas e tarefas não aparecem como atividades. O backlog omite subtarefas Done; as demais recebem intervalo de horário.</p>
              </li>
              <li>
                <span className="home-rule-number">05</span>
                <p><strong>Recorrências.</strong> Rotinas aparecem nos dias da semana e no período configurados. No planejamento diário são apenas informativas e não podem ser editadas.</p>
              </li>
              <li>
                <span className="home-rule-number">06</span>
                <p><strong>Mover tarefa de dia.</strong> Se houver subtarefas com horário, o sistema avisa antes de mover. A confirmação limpa os horários diários dessas subtarefas.</p>
              </li>
              <li>
                <span className="home-rule-number">07</span>
                <p><strong>Horários simultâneos.</strong> Subtarefas em intervalos coincidentes são exibidas lado a lado na linha do tempo para manter os títulos visíveis.</p>
              </li>
            </ol>
          </section>
        </>
      )}
    </section>
  )
}

export default InicioPage
