import { lazy, Suspense, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router'
import './App.css'
import './celestial.css'
import { PomodoroProvider, PomodoroWidget } from './components/Pomodoro.jsx'
import { enableAlarmAudio } from './lib/pomodoroSound.js'

const DemandasPage = lazy(() => import('./pages/DemandasPage.jsx'))
const InicioPage = lazy(() => import('./pages/InicioPage.jsx'))
const PlanejamentoSemanalPage = lazy(() => import('./pages/PlanejamentoSemanalPage.jsx'))
const PlanejamentoDiarioPage = lazy(() => import('./pages/PlanejamentoDiarioPage.jsx'))
const RecorrentesPage = lazy(() => import('./pages/RecorrentesPage.jsx'))
const KanbanPage = lazy(() => import('./pages/KanbanPage.jsx'))
const PomodoroPage = lazy(() => import('./pages/PomodoroPage.jsx'))
const ChatPage = lazy(() => import('./pages/ChatPage.jsx'))

const ACCESS_CODE = '52345232'
const ACCESS_STORAGE_KEY = 'flowzenit-internal-access'

function PasskeyPage() {
  const [passkey, setPasskey] = useState('')
  const [error, setError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { document.title = 'Acesso | FlowZenit' }, [])

  if (sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'granted') {
    return <Navigate to="/interno" replace />
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (passkey !== ACCESS_CODE) {
      setError('Passkey incorreto. Tente novamente.')
      return
    }

    enableAlarmAudio()
    sessionStorage.setItem(ACCESS_STORAGE_KEY, 'granted')
    setError('')
    navigate(location.state?.from || '/interno', { replace: true })
  }

  return (
    <main className="gate-screen">
      <div className="gate-grid" aria-hidden="true" />
      <div className="ambient-light" aria-hidden="true" />

      <header className="gate-header">
        <Link className="wordmark" to="/" aria-label="Flowzenit — início">
          <svg className="brand-mark" viewBox="0 0 36 36" aria-hidden="true">
            <path d="M7 27 18 7l11 20" />
            <path d="M12 27h12" />
            <circle cx="18" cy="7" r="2.4" />
          </svg>
          <span>flowzenit</span>
        </Link>

        <div className="header-status">
          <span className="status-dot" />
          <span>acesso restrito</span>
        </div>
      </header>

      <section className="gate-layout" aria-labelledby="gate-title">
        <div className="gate-content">
          <div className="eyebrow">
            <span className="eyebrow-index">01</span>
            <span>PORTAL INTERNO</span>
          </div>

          <h1 id="gate-title">
            Digite seu
            <br />
            <span>passkey.</span>
          </h1>

          <p className="gate-description">
            Informe seu código de acesso para continuar.
          </p>

          <form className="passkey-form" onSubmit={handleSubmit}>
            <label htmlFor="passkey">PASSKEY</label>
            <div className={`passkey-field${error ? ' is-error' : ''}`}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="8.5" cy="15.5" r="4.5" />
                <path d="m12 12 8-8m-3 3 3 3m-6 0 3 3" />
              </svg>
              <input
                id="passkey"
                name="passkey"
                type="password"
                value={passkey}
                onChange={(event) => {
                  setPasskey(event.target.value.replace(/\D/g, '').slice(0, 8))
                  setError('')
                }}
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                placeholder="Digite o passkey"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'passkey-error' : 'passkey-hint'}
              />
              <span className="input-count">{passkey.length}/8</span>
            </div>

            {error ? (
              <p className="form-message is-error" id="passkey-error" role="alert">
                {error}
              </p>
            ) : (
              <p className="form-message" id="passkey-hint">
                Código numérico de 8 dígitos.
              </p>
            )}

            <button className="submit-button" type="submit">
              <span>OK</span>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 16 16 4M6 4h10v10" />
              </svg>
            </button>
          </form>
        </div>

        <div className="gate-visual" aria-hidden="true">
          <div className="visual-glow" />
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-middle" />
          <div className="orbit orbit-inner" />
          <div className="visual-axis" />
          <div className="visual-core">
            <svg viewBox="0 0 36 36">
              <path d="M7 27 18 7l11 20" />
              <path d="M12 27h12" />
              <circle cx="18" cy="7" r="2.4" />
            </svg>
          </div>
          <span className="orbit-point orbit-point-top" />
          <span className="orbit-point orbit-point-bottom" />
        </div>
      </section>

      <footer className="gate-footer">
        <span>FLOWZENIT <i>·</i> SISTEMA INTERNO</span>
        <span>ACESSO <b>01</b></span>
      </footer>
    </main>
  )
}

function RequireAccess() {
  const location = useLocation()
  const hasAccess = sessionStorage.getItem(ACCESS_STORAGE_KEY) === 'granted'

  return hasAccess ? (
    <Outlet />
  ) : (
    <Navigate to="/" replace state={{ from: location }} />
  )
}

function InternalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const navigation = [
    { path: '/interno', label: 'Início', end: true },
    { path: '/interno/chat', label: 'Chat' },
    { path: '/interno/demandas', label: 'Demandas' },
    { path: '/interno/recorrentes', label: 'Recorrentes' },
    { path: '/interno/planejamento-semanal', label: 'Semanal' },
    { path: '/interno/planejamento-diario', label: 'Diário' },
    { path: '/interno/kanban', label: 'Kanban' },
  ]
  const sourceIsDaily = ['/interno/planejamento-diario', '/interno/kanban'].includes(location.pathname)
  const selectedDate = new URLSearchParams(location.search).get('data')
  const dateSearch = sourceIsDaily && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate ?? '') ? `?data=${selectedDate}` : ''

  useEffect(() => {
    const titles = { '/interno': 'Início', '/interno/chat': 'Chat', '/interno/demandas': 'Demandas', '/interno/recorrentes': 'Recorrentes', '/interno/planejamento-semanal': 'Planejamento semanal', '/interno/planejamento-diario': 'Planejamento diário', '/interno/kanban': 'Kanban diário', '/interno/pomodoro': 'Pomodoro' }
    document.title = `${titles[location.pathname] ?? 'Área interna'} | FlowZenit`
  }, [location.pathname])

  function handleLogout() {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY)
    navigate('/', { replace: true })
  }

  return (
    <PomodoroProvider>
    <div className="internal-shell">
      <a className="skip-link" href="#internal-main">Ir para o conteúdo</a>
      <header className="internal-header">
        <Link className="internal-brand" to="/interno" aria-label="Flowzenit — área interna">
          <svg className="internal-brand-mark" viewBox="0 0 36 36" aria-hidden="true">
            <path d="M7 27 18 7l11 20" />
            <path d="M12 27h12" />
            <circle cx="18" cy="7" r="2.4" />
          </svg>
          <span className="internal-brand-name">flowzenit</span>
          <span className="internal-header-divider" aria-hidden="true" />
          <span className="internal-area-name">Área interna</span>
        </Link>

        <button className="mobile-nav-toggle" type="button" aria-expanded={menuOpen} aria-controls="internal-navigation" onClick={() => setMenuOpen((open) => !open)}>
          <span aria-hidden="true">☰</span> Menu
        </button>

        <nav id="internal-navigation" className={`internal-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Navegação interna">
          {navigation.map(({ path, label, end }) => (
            <NavLink
              key={path}
              end={end}
              className={({ isActive }) => `internal-nav-link${isActive ? ' is-active' : ''}`}
              to={{ pathname: path, search: ['/interno/planejamento-diario', '/interno/kanban'].includes(path) ? dateSearch : '' }}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <button className="logout-button" type="button" onClick={handleLogout}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8 4H4.5A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16H8m3-3 3-3-3-3m3 3H7" />
          </svg>
          <span>Deslogar do passkey</span>
        </button>
      </header>

      <main className="internal-workspace" id="internal-main" aria-label="Conteúdo interno" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="internal-footer">
        <span>FLOWZENIT <i>·</i> ÁREA INTERNA</span>
        <span className="internal-session-status">
          <span className="internal-session-dot" />
          SESSÃO ATIVA
        </span>
      </footer>
      <PomodoroWidget />
    </div>
    </PomodoroProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PasskeyPage />} />
        <Route path="interno" element={<RequireAccess />}>
          <Route element={<InternalLayout />}>
            <Route index element={(
              <Suspense fallback={<div className="planning-state" role="status">Carregando painel inicial…</div>}>
                <InicioPage />
              </Suspense>
            )} />
            <Route
              path="chat"
              element={(
                <Suspense fallback={<div className="planning-state" role="status">Carregando chat…</div>}>
                  <ChatPage />
                </Suspense>
              )}
            />
            <Route path="demandas" element={(
              <Suspense fallback={<div className="planning-state" role="status">Carregando demandas…</div>}>
                <DemandasPage />
              </Suspense>
            )} />
            <Route
              path="recorrentes"
              element={(
                <Suspense fallback={<div className="planning-state" role="status">Carregando cadastros recorrentes…</div>}>
                  <RecorrentesPage />
                </Suspense>
              )}
            />
            <Route
              path="planejamento-semanal"
              element={(
                <Suspense fallback={<div className="planning-state" role="status">Carregando planejamento…</div>}>
                  <PlanejamentoSemanalPage />
                </Suspense>
              )}
            />
            <Route
              path="planejamento-diario"
              element={(
                <Suspense fallback={<div className="planning-state" role="status">Carregando planejamento diário…</div>}>
                  <PlanejamentoDiarioPage />
                </Suspense>
              )}
            />
            <Route
              path="kanban"
              element={(
                <Suspense fallback={<div className="planning-state" role="status">Carregando Kanban…</div>}>
                  <KanbanPage />
                </Suspense>
              )}
            />
            <Route
              path="pomodoro"
              element={(
                <Suspense fallback={<div className="planning-state" role="status">Carregando configurações do Pomodoro…</div>}>
                  <PomodoroPage />
                </Suspense>
              )}
            />
            <Route path="*" element={<Navigate to="/interno" replace />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
