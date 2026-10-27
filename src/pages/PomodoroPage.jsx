import { useState } from 'react'
import PageHeading from '../components/PageHeading.jsx'
import { usePomodoro } from '../hooks/usePomodoro.js'
import { DEFAULT_POMODORO_SETTINGS } from '../lib/pomodoro.js'
import './PomodoroPage.css'

const FIELDS = [
  {
    key: 'focusMinutes',
    label: 'Foco',
    description: 'Duração de cada sessão de trabalho.',
    min: 1,
    max: 120,
    suffix: 'minutos',
  },
  {
    key: 'shortBreakMinutes',
    label: 'Pausa curta',
    description: 'Intervalo entre sessões de foco.',
    min: 1,
    max: 30,
    suffix: 'minutos',
  },
  {
    key: 'longBreakMinutes',
    label: 'Pausa longa',
    description: 'Intervalo para recuperar após o ciclo.',
    min: 1,
    max: 60,
    suffix: 'minutos',
  },
  {
    key: 'longBreakEvery',
    label: 'Focos até a pausa longa',
    description: 'Quantidade de focos completos por ciclo.',
    min: 2,
    max: 12,
    suffix: 'focos',
  },
]

function PomodoroPage() {
  const { settings, session, saveSettings, resetSequence } = usePomodoro()
  const [draft, setDraft] = useState(() => ({ ...settings }))
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('')
  const [notice, setNotice] = useState('')

  function updateField(key, value) {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
    setErrorField('')
    setNotice('')
  }

  function handleSubmit(event) {
    event.preventDefault()
    const result = saveSettings(draft)
    if (!result.ok) {
      setError(result.error)
      setErrorField(result.key)
      setNotice('')
      return
    }
    setDraft(result.values)
    setNotice('Configurações salvas. Elas serão usadas nas próximas fases do timer.')
    setError('')
    setErrorField('')
  }

  function restoreDefaults() {
    const result = saveSettings(DEFAULT_POMODORO_SETTINGS)
    if (!result.ok) return
    setDraft(result.values)
    setNotice('Padrão restaurado: foco de 25 min, pausa de 5 min e pausa longa de 15 min a cada 4 focos.')
    setError('')
    setErrorField('')
  }

  return (
    <section className="pomodoro-config-page" aria-labelledby="pomodoro-config-title">
      <PageHeading
        className="pomodoro-config-heading"
        section="PREFERÊNCIAS"
        titleId="pomodoro-config-title"
        title="Pomodoro"
        description="Defina a duração das sessões e das pausas do relógio de foco."
      />

      <div className="pomodoro-config-layout">
        <form className="pomodoro-settings-form" onSubmit={handleSubmit} noValidate>
          <div className="pomodoro-settings-heading">
            <div>
              <p className="pomodoro-config-kicker">DURAÇÕES</p>
              <h2>Configurar ciclo</h2>
            </div>
            <span>Os valores são salvos neste dispositivo.</span>
          </div>

          <div className="pomodoro-fields-grid">
            {FIELDS.map((field) => (
              <label className="pomodoro-setting-field" key={field.key} htmlFor={`pomodoro-${field.key}`}>
                <span className="pomodoro-field-label">{field.label}</span>
                <span className="pomodoro-field-input-wrap">
                  <input
                    id={`pomodoro-${field.key}`}
                    name={field.key}
                    type="number"
                    inputMode="numeric"
                    min={field.min}
                    max={field.max}
                    step="1"
                    required
                    value={draft[field.key]}
                    aria-invalid={errorField === field.key}
                    aria-describedby={`pomodoro-${field.key}-hint${errorField === field.key ? ' pomodoro-settings-error' : ''}`}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  />
                  <span>{field.suffix}</span>
                </span>
                <span className="pomodoro-field-description" id={`pomodoro-${field.key}-hint`}>{field.description} ({field.min}–{field.max} {field.key === 'longBreakEvery' ? 'sessões' : 'min'}).</span>
              </label>
            ))}
          </div>

          {error && <p className="pomodoro-form-message is-error" id="pomodoro-settings-error" role="alert">{error}</p>}
          {notice && <p className="pomodoro-form-message is-success" role="status">{notice}</p>}

          <div className="pomodoro-form-actions">
            <button className="pomodoro-save-button" type="submit">Salvar configurações</button>
            <button className="pomodoro-default-button" type="button" onClick={restoreDefaults}>Restaurar padrão</button>
          </div>
        </form>

        <aside className="pomodoro-cycle-preview" aria-labelledby="pomodoro-preview-title">
          <p className="pomodoro-config-kicker">SEQUÊNCIA</p>
          <h2 id="pomodoro-preview-title">Um ciclo de foco</h2>
          <p className="pomodoro-preview-copy">Complete os focos; a pausa longa entra no fim de cada ciclo.</p>
          <ol className="pomodoro-preview-steps">
            <li><span>01—{String(draft.longBreakEvery || '·').padStart(2, '0')}</span><strong>Foco</strong><em>{draft.focusMinutes || '—'} min cada</em></li>
            <li><span>ENTRE FOCOS</span><strong>Pausa curta</strong><em>{draft.shortBreakMinutes || '—'} min</em></li>
            <li className="is-long-break"><span>FIM DO CICLO</span><strong>Pausa longa</strong><em>{draft.longBreakMinutes || '—'} min</em></li>
          </ol>
          <p className="pomodoro-cycle-progress">Ciclo atual: <strong>{session.cycleFocusSessions} de {settings.longBreakEvery}</strong> · total: {session.completedFocusSessions} foco(s) concluídos.</p>
          <button className="pomodoro-sequence-reset" type="button" onClick={resetSequence}>Reiniciar sequência atual</button>
        </aside>
      </div>

      <p className="pomodoro-config-note">Se o relógio estiver rodando ou pausado, a fase atual mantém o tempo original. Quando estiver pronto, a nova duração é aplicada imediatamente; para mudar uma fase em andamento, reinicie-a.</p>
    </section>
  )
}

export default PomodoroPage
