import { useDialogFocus } from '../hooks/useDialogFocus.js'

export default function ConfirmDialog({ open, title, children, confirmLabel = 'Continuar', onCancel, onConfirm, returnFocusRef }) {
  const { dialogRef } = useDialogFocus(open, onCancel, returnFocusRef)
  if (!open) return null
  return (
    <div className="demand-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
      <section className="demand-dialog celestial-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" ref={dialogRef}>
        <p className="demands-eyebrow">CONFIRMAR ALTERAÇÃO</p>
        <h2 id="confirm-dialog-title">{title}</h2>
        <div className="celestial-confirm-copy">{children}</div>
        <div className="demand-form-actions">
          <button type="button" className="cancel-button" autoFocus onClick={onCancel}>Cancelar</button>
          <button type="button" className="save-demand-button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
