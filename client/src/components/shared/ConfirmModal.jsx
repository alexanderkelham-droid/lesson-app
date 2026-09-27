import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'

export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  onConfirm,
  onClose,
}) {
  const titleId = useId()
  const confirmRef = useRef(null)

  // Escape closes; focus the primary action so Enter confirms
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape' && !loading) { e.stopPropagation(); onClose?.() } }
    document.addEventListener('keydown', onKey, true)
    confirmRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, loading, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4"
      onClick={() => !loading && onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-panel w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          {destructive && (
            <div className="w-9 h-9 rounded-full bg-red-50 text-red-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="icon" aria-hidden />
            </div>
          )}
          <div className="min-w-0">
            <h2 id={titleId} className="section-title mb-1">{title}</h2>
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{message}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="btn-secondary flex-1"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 ${destructive ? 'btn-danger' : 'btn-primary'}`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Promise-based styled confirm (use instead of the browser dialog).
 *   const [confirm, confirmModal] = useConfirm()
 *   if (!(await confirm({ title, message, confirmLabel, destructive }))) return
 *   ...render {confirmModal} somewhere in the tree.
 */
export function useConfirm() {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback(opts => new Promise(resolve => {
    resolver.current?.(false)
    resolver.current = resolve
    setState(typeof opts === 'string' ? { message: opts } : opts)
  }), [])

  const finish = useCallback(result => {
    resolver.current?.(result)
    resolver.current = null
    setState(null)
  }, [])

  const close = useCallback(() => finish(false), [finish])

  const element = (
    <ConfirmModal
      open={!!state}
      title={state?.title}
      message={state?.message}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      destructive={state?.destructive}
      onConfirm={() => finish(true)}
      onClose={close}
    />
  )
  return [confirm, element]
}

/**
 * Read-only text (e.g. a new password) with a Copy button. If the clipboard
 * isn't available or is blocked, the text is selected and the user is told
 * to press Ctrl/Cmd+C instead.
 */
export function CopyableText({ text, label = 'Copy to clipboard', multiline = false, className = '' }) {
  const [state, setState] = useState('idle') // idle | copied | manual
  const ref = useRef(null)

  function selectText() {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select?.()
  }

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      selectText()
      setState('manual')
    }
  }

  const common = {
    ref,
    readOnly: true,
    value: text,
    onFocus: e => e.target.select(),
    'aria-label': 'Text to copy',
    className: 'w-full bg-cream border border-gray-200 rounded-lg p-3 font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-redwood-500/30',
  }

  return (
    <div className={className}>
      {multiline
        ? <textarea {...common} rows={Math.max(2, String(text).split('\n').length)} className={`${common.className} resize-none`} />
        : <input type="text" {...common} className={`${common.className} text-center text-lg font-semibold`} />}
      <button type="button" onClick={copy} className="btn-secondary w-full mt-3">
        {state === 'copied'
          ? <><Check className="icon" aria-hidden /> Copied</>
          : <><Copy className="icon" aria-hidden /> {label}</>}
      </button>
      <p className="text-xs text-gray-600 mt-1.5 min-h-[1rem]" role="status" aria-live="polite">
        {state === 'manual' && 'Copying is blocked here. The text is selected: press Ctrl+C (or Cmd+C on a Mac) to copy.'}
      </p>
    </div>
  )
}
