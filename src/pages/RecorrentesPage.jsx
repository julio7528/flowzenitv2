import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import PageHeading from '../components/PageHeading.jsx'
import { useDialogFocus } from '../hooks/useDialogFocus.js'
import { ErrorState, LoadingState } from '../components/FeedbackState.jsx'

const WEEKDAYS = [
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 7, label: 'Domingo', short: 'Dom' },
]

const FIELDS = 'id, demanda, hora, dias_semana, data_inicial, data_final'

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getIsoWeekday(date) {
  return ((date.getDay() + 6) % 7) + 1
}

function formatDate(value) {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).replace('.', '')
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—'
}

function sortRecords(records) {
  return [...records].sort((a, b) => (
    Math.min(...a.dias_semana) - Math.min(...b.dias_semana)
    || String(a.hora).localeCompare(String(b.hora))
    || a.id - b.id
  ))
}

function weekdaySummary(values) {
  const selectedDays = new Set((values ?? []).map(Number))
  if (selectedDays.size === WEEKDAYS.length) return 'Todos os dias'
  return WEEKDAYS.filter((day) => selectedDays.has(day.value)).map((day) => day.label).join(', ')
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4l2.5 1.5" />
    </svg>
  )
}

function RecorrentesPage() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [draft, setDraft] = useState({
    demanda: '',
    hora: '09:00',
    dias_semana: [],
    data_inicial: '',
    data_final: '',
  })
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [notice, setNotice] = useState(null)
  const savingRef = useRef(false)
  const { dialogRef, rememberFocus } = useDialogFocus(formOpen, () => {
    if (!savingRef.current) { setFormOpen(false); setFormError(''); setEditingItem(null) }
  })

  useEffect(() => {
    let active = true

    async function loadRecords() {
      setLoading(true)
      setLoadError('')

      const { data, error } = await supabase
        .from('recorrente')
        .select(FIELDS)
        .order('hora', { ascending: true })
        .order('id', { ascending: true })

      if (!active) return

      if (error) {
        setLoadError(error.message || 'Não foi possível carregar as demandas recorrentes.')
        setRecords([])
      } else {
        setRecords(sortRecords(data ?? []))
      }

      setLoading(false)
    }

    void loadRecords()
    return () => { active = false }
  }, [reload])

  function openCreate() {
    rememberFocus()
    setEditingItem(null)
    setDraft({
      demanda: '',
      hora: '09:00',
      dias_semana: [getIsoWeekday(new Date())],
      data_inicial: toDateKey(new Date()),
      data_final: '',
    })
    setFormError('')
    setNotice(null)
    setFormOpen(true)
  }

  function openEdit(item) {
    rememberFocus()
    setEditingItem(item)
    setDraft({
      demanda: item.demanda,
      hora: formatTime(item.hora),
      dias_semana: (item.dias_semana ?? []).map(Number).sort((a, b) => a - b),
      data_inicial: item.data_inicial,
      data_final: item.data_final,
    })
    setFormError('')
    setNotice(null)
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setFormError('')
    setEditingItem(null)
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  function toggleWeekday(day, checked) {
    setDraft((current) => {
      const selected = new Set(current.dias_semana)
      if (checked) selected.add(day)
      else selected.delete(day)
      return { ...current, dias_semana: [...selected].sort((a, b) => a - b) }
    })
    setFormError('')
  }

  async function saveRecord(event) {
    event.preventDefault()
    setFormError('')

    const demanda = draft.demanda.trim()
    if (!demanda) {
      setFormError('Informe o nome da demanda recorrente.')
      return
    }
    if (!draft.hora || !draft.data_inicial || !draft.data_final) {
      setFormError('Preencha horário e período de recorrência.')
      return
    }
    if (draft.dias_semana.length === 0) {
      setFormError('Selecione pelo menos um dia da semana.')
      return
    }
    if (draft.data_final < draft.data_inicial) {
      setFormError('A data final precisa ser igual ou posterior à data inicial.')
      return
    }

    const changes = {
      demanda,
      hora: draft.hora,
      dias_semana: [...draft.dias_semana].sort((a, b) => a - b),
      data_inicial: draft.data_inicial,
      data_final: draft.data_final,
    }

    setSaving(true)
    savingRef.current = true
    setNotice(null)

    const result = editingItem
      ? await supabase
        .from('recorrente')
        .update(changes)
        .eq('id', editingItem.id)
        .select(FIELDS)
        .single()
      : await supabase
        .from('recorrente')
        .insert(changes)
        .select(FIELDS)
        .single()

    setSaving(false)
    savingRef.current = false

    if (result.error) {
      setFormError(result.error.message || 'Não foi possível salvar a recorrência.')
      return
    }

    setRecords((current) => {
      const next = editingItem
        ? current.map((record) => String(record.id) === String(result.data.id) ? result.data : record)
        : [...current, result.data]
      return sortRecords(next)
    })
    setFormOpen(false)
    setEditingItem(null)
    setNotice({
      tone: 'success',
      text: editingItem ? 'Recorrência atualizada.' : 'Demanda recorrente cadastrada.',
    })
  }

  async function deleteRecord(item) {
    if (!window.confirm(`Excluir a rotina “${item.demanda}”?`)) return

    setDeletingId(String(item.id))
    setNotice(null)
    const { error } = await supabase.from('recorrente').delete().eq('id', item.id)
    setDeletingId(null)

    if (error) {
      setNotice({ tone: 'error', text: error.message || 'Não foi possível excluir a recorrência.' })
      return
    }

    setRecords((current) => current.filter((record) => String(record.id) !== String(item.id)))
    setNotice({ tone: 'success', text: 'Recorrência excluída.' })
  }

  const dateRange = (item) => `${formatDate(item.data_inicial)} – ${formatDate(item.data_final)}`

  return (
    <section className="demands-page recurring-page" aria-labelledby="recurring-title">
      <PageHeading className="demands-heading" section="CADASTROS" titleId="recurring-title" title="Demandas recorrentes" description="Cadastre rotinas semanais para consulta no planejamento diário.">
        <button className="new-demand-button" type="button" onClick={openCreate}>
          <span aria-hidden="true">+</span>
          Nova recorrência
        </button>
      </PageHeading>

      {notice && (
        <p className={`planning-notice${notice.tone === 'error' ? ' is-error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      <section className="demand-structure recurring-structure" aria-labelledby="recurring-list-title">
        <div className="structure-heading">
          <div className="structure-heading-copy">
            <span className="structure-icon recurring-structure-icon"><ClockIcon /></span>
            <div>
              <h2 id="recurring-list-title">Rotinas cadastradas</h2>
              <p>As rotinas aparecem no planejamento diário sem controles de edição.</p>
            </div>
          </div>
          <span className="structure-total">
            {records.length} {records.length === 1 ? 'rotina' : 'rotinas'}
          </span>
        </div>

        {loading ? (
          <LoadingState className="demand-state">Carregando rotinas…</LoadingState>
        ) : loadError ? (
          <ErrorState className="demand-state" actionClassName="text-action" title="Não foi possível carregar as rotinas." detail={loadError} onRetry={() => setReload((value) => value + 1)} />
        ) : records.length === 0 ? (
          <div className="demand-state empty-state">
            <span className="empty-mark" aria-hidden="true">+</span>
            <h3>Nenhuma rotina cadastrada</h3>
            <p>Cadastre uma demanda recorrente para vê-la no planejamento diário.</p>
            <button type="button" className="text-action" onClick={openCreate}>
              Cadastrar a primeira rotina
            </button>
          </div>
        ) : (
          <div className="recurring-list">
            {records.map((item) => (
              <article className="recurring-card" key={item.id}>
                <div className="recurring-card-main">
                  <span className="recurring-card-overline">{weekdaySummary(item.dias_semana)}</span>
                  <h3>{item.demanda}</h3>
                  <p>Ativa de {dateRange(item)}</p>
                </div>
                <div className="recurring-card-time">
                  <ClockIcon />
                  <span>{formatTime(item.hora)}</span>
                </div>
                <div className="record-actions">
                  <button
                    className="icon-action-button edit-record-icon-button"
                    type="button"
                    onClick={() => openEdit(item)}
                    aria-label={`Editar rotina: ${item.demanda}`}
                    title="Editar"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m13.8 3.7 2.5 2.5M4 16l3.5-.8L16 6.7a1.8 1.8 0 0 0-2.5-2.5L5 12.7 4 16Z" />
                    </svg>
                  </button>
                  <button
                    className="icon-action-button delete-record-icon-button"
                    type="button"
                    disabled={deletingId === String(item.id)}
                    onClick={() => { void deleteRecord(item) }}
                    aria-label={`Excluir rotina: ${item.demanda}`}
                    title="Excluir"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4.5 6h11m-9.5 0 .6 10h7.8l.6-10M8 6V4.3h4V6m-3 3v4m2-4v4" />
                    </svg>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {formOpen && (
        <div className="demand-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) closeForm()
        }}>
          <form
            className="demand-dialog recurring-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="recurring-form-title"
            onSubmit={saveRecord}
          >
            <div className="demand-dialog-heading">
              <div>
                <p className="demands-eyebrow">CADASTRO <span>/</span> RECORRÊNCIA</p>
                <h2 id="recurring-form-title">{editingItem ? 'Editar rotina' : 'Nova rotina'}</h2>
              </div>
              <button
                className="dialog-close"
                type="button"
                aria-label="Fechar formulário"
                disabled={saving}
                onClick={closeForm}
              >
                ×
              </button>
            </div>

            <div className="demand-form">
              <label htmlFor="recurring-demand">Demanda</label>
              <input
                id="recurring-demand"
                autoFocus
                maxLength={180}
                value={draft.demanda}
                onChange={(event) => updateDraft('demanda', event.target.value)}
                placeholder="Ex.: Revisar indicadores semanais"
                required
              />

              <div className="recurring-form-row recurring-form-time-row">
                <div>
                  <label htmlFor="recurring-time">Horário</label>
                  <input
                    id="recurring-time"
                    type="time"
                    value={draft.hora}
                    onChange={(event) => updateDraft('hora', event.target.value)}
                    required
                  />
                </div>
              </div>

              <fieldset className="recurring-weekday-fieldset">
                <legend>Repetir toda semana em</legend>
                <div className="recurring-weekday-options">
                  {WEEKDAYS.map((day) => (
                    <label
                      className={`recurring-weekday-option${draft.dias_semana.includes(day.value) ? ' is-selected' : ''}`}
                      key={day.value}
                    >
                      <input
                        type="checkbox"
                        checked={draft.dias_semana.includes(day.value)}
                        aria-label={day.label}
                        onChange={(event) => toggleWeekday(day.value, event.target.checked)}
                      />
                      <span>{day.short}</span>
                    </label>
                  ))}
                </div>
                <span className="recurring-weekday-hint">Marque um ou mais dias.</span>
              </fieldset>

              <div className="recurring-form-row">
                <div>
                  <label htmlFor="recurring-start">Data inicial</label>
                  <input
                    id="recurring-start"
                    type="date"
                    value={draft.data_inicial}
                    onChange={(event) => updateDraft('data_inicial', event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="recurring-end">Data final</label>
                  <input
                    id="recurring-end"
                    type="date"
                    min={draft.data_inicial || undefined}
                    value={draft.data_final}
                    onChange={(event) => updateDraft('data_final', event.target.value)}
                    required
                  />
                </div>
              </div>

              <p className="recurring-form-hint">A rotina será exibida nos dias selecionados e dentro do período informado.</p>
              {formError && <p className="demand-form-error" role="alert">{formError}</p>}

              <div className="demand-form-actions">
                <button className="cancel-button" type="button" disabled={saving} onClick={closeForm}>
                  Cancelar
                </button>
                <button className="save-demand-button" type="submit" disabled={saving}>
                  {saving ? 'Salvando…' : editingItem ? 'Salvar alterações' : 'Cadastrar rotina'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

export default RecorrentesPage
