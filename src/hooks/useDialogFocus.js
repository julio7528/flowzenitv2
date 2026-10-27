import { useEffect, useRef } from 'react'

export function useDialogFocus(open, onEscape, externalReturnFocusRef) {
  const dialogRef = useRef(null)
  const returnFocusRef = useRef(null)
  const escapeRef = useRef(onEscape)

  useEffect(() => { escapeRef.current = onEscape }, [onEscape])

  useEffect(() => {
    if (!open) return undefined
    const returnTarget = (externalReturnFocusRef ?? returnFocusRef).current
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        escapeRef.current?.()
      } else if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      returnTarget?.focus?.()
    }
  }, [open, externalReturnFocusRef])

  return { dialogRef, rememberFocus: () => { returnFocusRef.current = document.activeElement } }
}
