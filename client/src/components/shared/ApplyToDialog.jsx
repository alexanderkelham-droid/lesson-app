import { useState, useRef, useCallback, useId } from 'react'
import { Repeat, X } from 'lucide-react'
import { useTopEscape } from '../../lib/escape'

/**
 * Promise-based "this session / this and following" chooser for repeating
 * group sessions.
 *   const [askApplyTo, applyToDialog] = useApplyTo()
 *   const applyTo = await askApplyTo({ title, message, confirmLabel })  // 'this' | 'following' | null
 *   ...render {applyToDialog} somewhere in the tree.
 */
export function useApplyTo() {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const ask = useCallback(opts => new Promise(resolve => {
    resolver.current?.(null)
    resolver.current = resolve
    setState(opts || {})
  }), [])

  const finish = useCallback(result => {
    resolver.current?.(result)
    resolver.current = null
    setState(null)
  }, [])

  const element = state ? <ApplyToDialog {...state} onDone={finish} /> : null
  return [ask, element]
}

function ApplyToDialog({ title = 'Apply to which sessions?', message, confirmLabel = 'Continue', destructive = false, onDone }) {
  const [choice, setChoice] = useState('this')
  const ref = useRef(null)
  const titleId = useId()
  const name = useId()
  const close = useCallback(() => onDone(null), [onDone])
  useTopEscape(ref, close)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 p-4" onClick={close}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center"><Repeat className="icon" aria-hidden /></span>
            <h2 id={titleId} className="section-title">{title}</h2>
          </div>
          <button type="button" onClick={close} className="btn-ghost p-1" aria-label="Close" title="Close"><X className="icon" aria-hidden /></button>
        </div>
        {message && <p className="text-sm text-gray-600 mb-3">{message}</p>}
        <fieldset className="space-y-2 mb-5">
          <legend className="sr-only">Apply to</legend>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name={name} checked={choice === 'this'} onChange={() => setChoice('this')} className="mt-0.5 accent-redwood-600" />
            <span className="font-medium">This session only</span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="radio" name={name} checked={choice === 'following'} onChange={() => setChoice('following')} className="mt-0.5 accent-redwood-600" />
            <span><span className="font-medium">This and following sessions</span><span className="block text-gray-500 text-xs">Every later session in this weekly series.</span></span>
          </label>
        </fieldset>
        <div className="flex gap-2">
          <button type="button" onClick={close} className="btn-secondary flex-1">Cancel</button>
          <button type="button" onClick={() => onDone(choice)} className={`flex-1 ${destructive ? 'btn-danger' : 'btn-primary'}`} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
