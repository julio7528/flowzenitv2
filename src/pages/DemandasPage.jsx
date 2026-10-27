import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useDialogFocus } from '../hooks/useDialogFocus.js'
import PageHeading from '../components/PageHeading.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { ErrorState, LoadingState } from '../components/FeedbackState.jsx'

const TYPE_LABELS = {
  1: 'Demanda',
  2: 'Tarefa',
  3: 'Subtarefa',
}

const SUBTASK_STATUSES = ['Backlog', 'Analise', 'Executando', 'Aguardando', 'Done']

const COUNT_TYPES = [
  { tipo: 1, label: 'Demandas' },
  { tipo: 2, label: 'Tarefa' },
  { tipo: 3, label: 'Subtarefas' },
]

function HierarchyIcon({ type }) {
  if (type === 2) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6.5h11M9 12h11M9 17.5h11" />
        <circle cx="4.5" cy="6.5" r=".8" />
        <circle cx="4.5" cy="12" r=".8" />
        <circle cx="4.5" cy="17.5" r=".8" />
      </svg>
    )
  }

  if (type === 3) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6h5v5H5zM14 6h5v5h-5zM14 15h5v5h-5z" />
        <path d="M10 8.5h4M12 8.5v9h2" />
      </svg>
    )
  }

  if (type === 1) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5.5" y="5.5" width="13" height="16" rx="2" />
        <path d="M9 5.5V4h6v1.5M9 11h6M9 15h6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </svg>
  )
}

function TreeToggle({ expanded, disabled, controls, label, onClick }) {
  return (
    <button
      className={`tree-toggle${expanded ? ' is-expanded' : ''}`}
      type="button"
      aria-label={label}
      aria-expanded={disabled ? undefined : expanded}
      aria-controls={disabled ? undefined : controls}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="m5.5 3.5 4.5 4.5-4.5 4.5" />
      </svg>
    </button>
  )
}

function DemandasPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [draft, setDraft] = useState({ demanda: '', tipo: 1, raizid: '', status: 'Backlog' })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [blockedDeleteId, setBlockedDeleteId] = useState(null)
  const [notice, setNotice] = useState(null)
  const [collapsedDemandIds, setCollapsedDemandIds] = useState(() => new Set())
  const [collapsedTaskIds, setCollapsedTaskIds] = useState(() => new Set())
  const { dialogRef, rememberFocus } = useDialogFocus(formOpen, () => { if (!saving) closeForm() })

  useEffect(() => {
    let active = true

    async function loadItems() {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('demandas')
        .select('id, demanda, tipo, raizid, status')
        .order('id', { ascending: true })

      if (!active) return

      if (error) {
        setLoadError(error.message || 'Não foi possível carregar as demandas.')
        setItems([])
      } else {
        setItems(data ?? [])
      }

      setLoading(false)
    }

    void loadItems()
    return () => {
      active = false
    }
  }, [reload])

  const counts = useMemo(() => ({
    1: items.filter((item) => item.tipo === 1).length,
    2: items.filter((item) => item.tipo === 2).length,
    3: items.filter((item) => item.tipo === 3).length,
  }), [items])

  const parentOptions = useMemo(() => {
    if (draft.tipo === 2) return items.filter((item) => item.tipo === 1)
    if (draft.tipo === 3) return items.filter((item) => item.tipo === 2)
    return []
  }, [draft.tipo, items])

  const displayNumbers = useMemo(() => {
    const numbers = new Map()
    const childrenByParent = new Map()

    items.forEach((item) => {
      if (item.tipo === 1) return
      const parentId = String(item.raizid)
      const siblings = childrenByParent.get(parentId) ?? []
      siblings.push(item)
      childrenByParent.set(parentId, siblings)
    })

    items.filter((item) => item.tipo === 1).forEach((demand, demandIndex) => {
      const demandNumber = String(demandIndex + 1)
      numbers.set(String(demand.id), demandNumber)

      ;(childrenByParent.get(String(demand.id)) ?? [])
        .filter((item) => item.tipo === 2)
        .forEach((task, taskIndex) => {
          const taskNumber = `${demandNumber}.${taskIndex + 1}`
          numbers.set(String(task.id), taskNumber)

          ;(childrenByParent.get(String(task.id)) ?? [])
            .filter((item) => item.tipo === 3)
            .forEach((subtask, subtaskIndex) => {
              numbers.set(String(subtask.id), `${taskNumber}.${subtaskIndex + 1}`)
            })
        })
    })

    return numbers
  }, [items])

  function openCreate(tipo = 1, raizid = '') {
    rememberFocus()
    if (tipo === 2) {
      setCollapsedDemandIds((current) => {
        const next = new Set(current)
        next.delete(String(raizid))
        return next
      })
    } else if (tipo === 3) {
      const parentTask = items.find((item) => item.tipo === 2 && String(item.id) === String(raizid))
      setCollapsedTaskIds((current) => {
        const next = new Set(current)
        next.delete(String(raizid))
        return next
      })
      if (parentTask) {
        setCollapsedDemandIds((current) => {
          const next = new Set(current)
          next.delete(String(parentTask.raizid))
          return next
        })
      }
    }
    setEditingItem(null)
    setDraft({ demanda: '', tipo, raizid: raizid ? String(raizid) : '', status: 'Backlog' })
    setFormError('')
    setNotice(null)
    setBlockedDeleteId(null)
    setFormOpen(true)
  }

  function openEdit(item) {
    rememberFocus()
    setEditingItem(item)
    setDraft({
      demanda: item.demanda,
      tipo: item.tipo,
      raizid: item.raizid ? String(item.raizid) : '',
      status: item.status ?? 'Backlog',
    })
    setFormError('')
    setNotice(null)
    setBlockedDeleteId(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setFormError('')
    setEditingItem(null)
  }

  async function handleSave(event) {
    event.preventDefault()
    setFormError('')

    const demanda = draft.demanda.trim()
    if (!demanda) {
      setFormError('Informe um nome para o cadastro.')
      return
    }
    if (!editingItem && draft.tipo !== 1 && !draft.raizid) {
      setFormError(`Selecione a ${draft.tipo === 2 ? 'demanda' : 'tarefa'} pai.`)
      return
    }

    setSaving(true)
    if (editingItem) {
      const changes = { demanda }
      if (editingItem.tipo === 3) changes.status = draft.status

      const { error } = await supabase
        .from('demandas')
        .update(changes)
        .eq('id', editingItem.id)

      setSaving(false)
      if (error) {
        setFormError(error.message || 'Não foi possível atualizar o cadastro.')
        return
      }

      setItems((current) => current.map((item) => (
        String(item.id) === String(editingItem.id)
          ? { ...item, ...changes }
          : item
      )))
      if (editingItem.tipo === 3 && editingItem.status !== draft.status) {
        setReload((value) => value + 1)
      }
      setNotice({ tone: 'success', text: `${TYPE_LABELS[editingItem.tipo]} atualizada.` })
      setFormOpen(false)
      setEditingItem(null)
      return
    }

    const newRecord = {
      demanda,
      tipo: draft.tipo,
      raizid: draft.raizid ? Number(draft.raizid) : null,
    }
    if (draft.tipo === 3) newRecord.status = draft.status

    const { data, error } = await supabase
      .from('demandas')
      .insert(newRecord)
      .select('id, demanda, tipo, raizid, status')
      .single()
    setSaving(false)

    if (error) {
      setFormError(error.message || 'Não foi possível salvar o cadastro.')
      return
    }

    setItems((current) => [...current, data].sort((a, b) => a.id - b.id))
    setReload((value) => value + 1)
    setNotice({ tone: 'success', text: `${TYPE_LABELS[draft.tipo]} cadastrada.` })
    setFormOpen(false)
    setEditingItem(null)
    setDraft({ demanda: '', tipo: 1, raizid: '', status: 'Backlog' })
  }

  function childrenOf(parentId, tipo) {
    return items.filter(
      (item) => item.tipo === tipo && String(item.raizid) === String(parentId),
    )
  }

  function directChildrenOf(parentId) {
    return items.filter((item) => String(item.raizid) === String(parentId))
  }

  async function handleDelete(item) {
    if (directChildrenOf(item.id).length > 0) {
      setBlockedDeleteId(String(item.id))
      setNotice(null)
      return
    }

    setBlockedDeleteId(null)
    const itemType = TYPE_LABELS[item.tipo].toLowerCase()
    const confirmed = window.confirm(`Excluir ${itemType} “${item.demanda}”?`)
    if (!confirmed) return

    setDeletingId(item.id)
    const { error } = await supabase.from('demandas').delete().eq('id', item.id)
    setDeletingId(null)

    if (error) {
      if (error.code === '23503') setBlockedDeleteId(String(item.id))
      setNotice({
        tone: 'error',
        text: error.code === '23503'
          ? 'Não pode excluir: há registros vinculados. Atualize a lista e tente novamente.'
          : error.message || 'Não foi possível excluir o cadastro.',
      })
      setReload((value) => value + 1)
      return
    }

    setItems((current) => current.filter((record) => String(record.id) !== String(item.id)))
    setCollapsedDemandIds((current) => {
      const next = new Set(current)
      next.delete(String(item.id))
      return next
    })
    setCollapsedTaskIds((current) => {
      const next = new Set(current)
      next.delete(String(item.id))
      return next
    })
    setBlockedDeleteId(null)
    setNotice({ tone: 'success', text: `${TYPE_LABELS[item.tipo]} excluída.` })
    setReload((value) => value + 1)
  }

  function renderRecordActions(item) {
    const childCount = directChildrenOf(item.id).length
    const hasChildren = childCount > 0
    const showWarning = hasChildren && blockedDeleteId === String(item.id)
    const childLabel = item.tipo === 1 ? 'tarefa' : 'subtarefa'
    const childWord = childCount === 1 ? `${childLabel} vinculada` : `${childLabel}s vinculadas`
    const warningId = `delete-warning-${item.id}`

    return (
      <div className={`record-actions${showWarning ? ' is-hierarchically-blocked' : ''}`}>
        <button
          className="icon-action-button edit-record-icon-button"
          type="button"
          onClick={() => openEdit(item)}
          aria-label={`Editar ${TYPE_LABELS[item.tipo].toLowerCase()}: ${item.demanda}`}
          title="Editar"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m13.8 3.7 2.5 2.5M4 16l3.5-.8L16 6.7a1.8 1.8 0 0 0-2.5-2.5L5 12.7 4 16Z" />
          </svg>
        </button>
        <button
          className={`icon-action-button delete-record-icon-button${showWarning ? ' is-blocked' : ''}`}
          type="button"
          onClick={() => handleDelete(item)}
          disabled={String(deletingId) === String(item.id)}
          aria-label={`Excluir ${TYPE_LABELS[item.tipo].toLowerCase()}: ${item.demanda}`}
          aria-describedby={showWarning ? warningId : undefined}
          title="Excluir"
        >
          {String(deletingId) === String(item.id) ? (
            <span className="delete-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4.5 6h11m-9.5 0 .6 10h7.8l.6-10M8 6V4.3h4V6m-3 3v4m2-4v4" />
            </svg>
          )}
        </button>
        {showWarning && (
          <span className="delete-warning" id={warningId} role="status">
            Não pode excluir: {childCount} {childWord}.
          </span>
        )}
      </div>
    )
  }

  const demands = items.filter((item) => item.tipo === 1)
  const nameLabel = draft.tipo === 1
    ? 'Nome da demanda'
    : draft.tipo === 2
      ? 'Nome da tarefa'
      : 'Nome da subtarefa'
  const formTypeLabel = TYPE_LABELS[draft.tipo].toLowerCase()

  return (
    <section className="demands-page" aria-labelledby="demands-title">
      <PageHeading className="demands-heading" section="CADASTROS" titleId="demands-title" title="Demandas" description="Organize demandas, tarefas e subtarefas em uma única hierarquia.">
        <button className="new-demand-button" type="button" onClick={() => openCreate(1)}>
          <span aria-hidden="true">+</span>
          Nova demanda
        </button>
      </PageHeading>

      <div className="demand-counts" aria-label="Totais por tipo">
        {COUNT_TYPES.map(({ tipo, label }) => (
          <div className={"demand-count demand-count-" + tipo} key={tipo}>
            <span className="demand-count-icon"><HierarchyIcon type={tipo} /></span>
            <span className="demand-count-copy">
              <span className="demand-count-label">{label}</span>
              <strong>{counts[tipo]}</strong>
            </span>
          </div>
        ))}
      </div>

      <section className="demand-structure" aria-labelledby="structure-title">
        <div className="structure-heading">
          <div className="structure-heading-copy">
            <span className="structure-icon"><HierarchyIcon type="layers" /></span>
            <div>
              <h2 id="structure-title">Estrutura hierárquica</h2>
              <p>Demandas contêm tarefas; tarefas contêm subtarefas.</p>
            </div>
          </div>
          <span className="structure-total">
            {items.length} {items.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {loading ? (
          <LoadingState className="demand-state">Carregando cadastros…</LoadingState>
        ) : loadError ? (
          <ErrorState className="demand-state" actionClassName="text-action" title="Não foi possível carregar os cadastros." detail={loadError} onRetry={() => setReload((value) => value + 1)} />
        ) : demands.length === 0 ? (
          <div className="demand-state empty-state">
            <span className="empty-mark" aria-hidden="true">＋</span>
            <h3>Nenhuma demanda cadastrada</h3>
            <p>Comece criando uma demanda principal. Depois, adicione tarefas e subtarefas.</p>
            <button type="button" className="text-action" onClick={() => openCreate(1)}>
              Cadastrar a primeira demanda
            </button>
          </div>
        ) : (
          <div className="demand-tree" aria-label="Hierarquia de demandas">
            {demands.map((demand) => {
              const tasks = childrenOf(demand.id, 2)
              const demandExpanded = !collapsedDemandIds.has(String(demand.id))
              const demandListId = 'demand-tasks-' + demand.id

              return (
                <article
                  className={"demand-node" + (tasks.length > 0 && blockedDeleteId === String(demand.id) ? ' has-blocking-children' : '')}
                  key={demand.id}
                >
                  <div className={"demand-row tree-row" + (tasks.length > 0 && demandExpanded ? ' has-tasks' : '')}>
                    <span className="hierarchy-number" aria-label={"Número " + displayNumbers.get(String(demand.id))}>
                      {displayNumbers.get(String(demand.id)) ?? '–'}
                    </span>
                    <TreeToggle
                      expanded={demandExpanded}
                      disabled={tasks.length === 0}
                      controls={demandListId}
                      label={tasks.length === 0
                        ? "Demanda sem tarefas: " + demand.demanda
                        : (demandExpanded ? "Recolher tarefas da demanda " : "Expandir tarefas da demanda ") + demand.demanda}
                      onClick={() => setCollapsedDemandIds((current) => {
                        const next = new Set(current)
                        if (demandExpanded) next.add(String(demand.id))
                        else next.delete(String(demand.id))
                        return next
                      })}
                    />
                    <div className="demand-row-main">
                      <span className="type-label type-demand">Demanda</span>
                      <h3>{demand.demanda}</h3>
                      <StatusBadge variant="record" status={demand.status} />
                    </div>
                    <div className="tree-row-tools">
                      <button
                        className="tree-add-action"
                        type="button"
                        onClick={() => openCreate(2, demand.id)}
                      >
                        <span aria-hidden="true">+</span> Tarefa
                      </button>
                      {renderRecordActions(demand)}
                    </div>
                  </div>

                  {tasks.length > 0 ? (
                    <ul className="task-list" id={demandListId} hidden={!demandExpanded}>
                      {tasks.map((task) => {
                        const subtasks = childrenOf(task.id, 3)
                        const taskExpanded = !collapsedTaskIds.has(String(task.id))
                        const taskListId = 'task-subtasks-' + task.id

                        return (
                          <li
                            className={"task-node" + (subtasks.length > 0 && blockedDeleteId === String(task.id) ? ' has-blocking-children' : '')}
                            key={task.id}
                          >
                            <div className={"task-row tree-row" + (subtasks.length > 0 && taskExpanded ? ' has-subtasks' : '')}>
                              <span className="hierarchy-number" aria-label={"Número " + displayNumbers.get(String(task.id))}>
                                {displayNumbers.get(String(task.id)) ?? '–'}
                              </span>
                              <TreeToggle
                                expanded={taskExpanded}
                                disabled={subtasks.length === 0}
                                controls={taskListId}
                                label={subtasks.length === 0
                                  ? "Tarefa sem subtarefas: " + task.demanda
                                  : (taskExpanded ? "Recolher subtarefas da tarefa " : "Expandir subtarefas da tarefa ") + task.demanda}
                                onClick={() => setCollapsedTaskIds((current) => {
                                  const next = new Set(current)
                                  if (taskExpanded) next.add(String(task.id))
                                  else next.delete(String(task.id))
                                  return next
                                })}
                              />
                              <div className="task-row-main">
                                <span className="type-label type-task">Tarefa</span>
                                <span className="tree-item-name">{task.demanda}</span>
                                <StatusBadge variant="record" status={task.status} />
                              </div>
                              <div className="tree-row-tools">
                                <button
                                  className="tree-add-action subtle"
                                  type="button"
                                  onClick={() => openCreate(3, task.id)}
                                >
                                  <span aria-hidden="true">+</span> Subtarefa
                                </button>
                                {renderRecordActions(task)}
                              </div>
                            </div>

                            {subtasks.length > 0 && (
                              <ul className="subtask-list" id={taskListId} hidden={!taskExpanded}>
                                {subtasks.map((subtask) => (
                                  <li className="subtask-node" key={subtask.id}>
                                    <div className="subtask-row tree-row">
                                      <span className="hierarchy-number" aria-label={"Número " + displayNumbers.get(String(subtask.id))}>
                                        {displayNumbers.get(String(subtask.id)) ?? '–'}
                                      </span>
                                      <span className="tree-toggle-spacer" aria-hidden="true" />
                                      <div className="subtask-row-main">
                                        <span className="type-label type-subtask">Subtarefa</span>
                                        <span className="tree-item-name">{subtask.demanda}</span>
                                        <StatusBadge variant="record" status={subtask.status} />
                                      </div>
                                      <div className="tree-row-tools">
                                        {renderRecordActions(subtask)}
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="no-child-records">Nenhuma tarefa nesta demanda ainda.</div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {notice && (
        <p className={`demand-notice${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      {formOpen && (
        <div className="demand-dialog-backdrop" onMouseDown={closeForm}>
          <section
            className="demand-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demand-form-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="demand-dialog-heading">
              <div>
                <p className="demands-eyebrow">{editingItem ? 'EDITAR CADASTRO' : 'NOVO CADASTRO'}</p>
                <h2 id="demand-form-title">
                  {editingItem ? `Editar ${formTypeLabel}` : `Adicionar ${formTypeLabel}`}
                </h2>
              </div>
              <button className="dialog-close" type="button" onClick={closeForm} aria-label="Fechar">
                ×
              </button>
            </div>

            <form className="demand-form" onSubmit={handleSave}>
              {editingItem ? (
                <div className="edit-record-context">
                  <span className={`type-label type-${editingItem.tipo === 1 ? 'demand' : editingItem.tipo === 2 ? 'task' : 'subtask'}`}>
                    {TYPE_LABELS[editingItem.tipo]}
                  </span>
                  <span>Número {displayNumbers.get(String(editingItem.id))}</span>
                </div>
              ) : (
                <>
                  <label htmlFor="demand-type">Tipo</label>
                  <select
                    id="demand-type"
                    value={draft.tipo}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      tipo: Number(event.target.value),
                      raizid: '',
                      status: 'Backlog',
                    }))}
                  >
                    <option value={1}>Demanda</option>
                    <option value={2}>Tarefa</option>
                    <option value={3}>Subtarefa</option>
                  </select>

                  {draft.tipo !== 1 && (
                    <>
                      <label htmlFor="demand-parent">
                        {draft.tipo === 2 ? 'Demanda pai' : 'Tarefa pai'}
                      </label>
                      <select
                        id="demand-parent"
                        value={draft.raizid}
                        onChange={(event) => setDraft((current) => ({ ...current, raizid: event.target.value }))}
                        required
                      >
                        <option value="">Selecione</option>
                        {parentOptions.map((parent) => (
                          <option value={parent.id} key={parent.id}>
                            {draft.tipo === 3
                              ? `${parent.demanda} · ${items.find((item) => item.tipo === 1 && String(item.id) === String(parent.raizid))?.demanda ?? 'Demanda'}`
                              : parent.demanda}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              )}

              {draft.tipo === 3 && (
                <>
                  <label htmlFor="demand-status">Status da subtarefa</label>
                  <select
                    id="demand-status"
                    value={draft.status}
                    onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                  >
                    {SUBTASK_STATUSES.map((status) => (
                      <option value={status} key={status}>{status === 'Analise' ? 'Análise' : status}</option>
                    ))}
                  </select>
                </>
              )}

              <label htmlFor="demand-name">{nameLabel}</label>
              <input
                autoFocus
                id="demand-name"
                name="demanda"
                value={draft.demanda}
                onChange={(event) => setDraft((current) => ({ ...current, demanda: event.target.value }))}
                maxLength={240}
                placeholder={`Digite o nome da ${draft.tipo === 1 ? 'demanda' : draft.tipo === 2 ? 'tarefa' : 'subtarefa'}`}
                required
              />

              {formError && <p className="demand-form-error" role="alert">{formError}</p>}

              <div className="demand-form-actions">
                <button className="cancel-button" type="button" onClick={closeForm} disabled={saving}>
                  Cancelar
                </button>
                <button className="save-demand-button" type="submit" disabled={saving}>
                  {saving ? 'Salvando…' : editingItem ? 'Salvar alterações' : 'Salvar cadastro'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default DemandasPage
