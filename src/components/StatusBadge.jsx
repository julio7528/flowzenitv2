const STATUS_NAMES = { Backlog: 'backlog', Analise: 'analysis', 'Análise': 'analysis', Executando: 'executing', Aguardando: 'waiting', Done: 'done', 'Em andamento': 'in-progress' }

function statusLabel(status) {
  return status === 'Analise' ? 'Análise' : status || 'Backlog'
}

export default function StatusBadge({ status, variant = 'daily' }) {
  const name = STATUS_NAMES[status] ?? 'backlog'
  const label = statusLabel(status)
  const prefix = variant === 'record' ? 'status' : 'daily-status'
  return <span className={`${variant === 'record' ? 'record-status' : 'daily-status'} ${prefix}-${name}`} aria-label={`Status: ${label}`}>{label}</span>
}
