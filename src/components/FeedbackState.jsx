export function LoadingState({ children, className = 'planning-state' }) {
  return <div className={className} role="status">{children}</div>
}

export function ErrorState({ title, detail, onRetry, className = 'planning-state', actionClassName = 'planning-retry-button' }) {
  return (
    <div className={`${className} is-error`} role="alert">
      <p>{title}</p>
      {detail && <code>{detail}</code>}
      <button type="button" className={actionClassName} onClick={onRetry}>Tentar novamente</button>
    </div>
  )
}
