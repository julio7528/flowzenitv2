export default function DateNavigation({ dateLabel, isToday, onPrevious, onNext, onToday }) {
  return (
    <nav className="daily-date-controls" aria-label="Navegar entre dias">
      <button className="daily-date-arrow" type="button" aria-label="Dia anterior" onClick={onPrevious}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4-6 6 6 6" /></svg>
      </button>
      <div className="daily-date-range" aria-live="polite">
        <span>{isToday ? 'HOJE' : 'DIA SELECIONADO'}</span>
        <strong>{dateLabel}</strong>
      </div>
      <button className="daily-date-arrow" type="button" aria-label="Próximo dia" onClick={onNext}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" /></svg>
      </button>
      {!isToday && <button className="daily-today-button" type="button" onClick={onToday}>Hoje</button>}
    </nav>
  )
}
