import { useEffect } from 'react'

// Escape closes a dialog only when it is the top-most modal on the page, so
// nested dialogs (a sheet preview or confirm on top of a panel) close one at
// a time. `ref` points at the dialog element (role="dialog" aria-modal="true").
export function useTopEscape(ref, onEscape, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = e => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const modals = document.querySelectorAll('[aria-modal="true"]')
      const top = modals[modals.length - 1]
      if (!ref.current || top !== ref.current) return
      onEscape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ref, onEscape, enabled])
}
