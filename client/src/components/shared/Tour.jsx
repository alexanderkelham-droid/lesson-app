import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'

/**
 * Tour — lightweight onboarding tooltip walkthrough.
 *
 * Usage:
 *   <Tour
 *     id="manager-intro"           // unique key used for localStorage
 *     autoStart                    // launch on mount if not seen
 *     steps={[
 *       { target: '[data-tour="today-tab"]', title: 'Today', body: '...' },
 *       { target: '[data-tour="add-student"]', title: 'Add students', body: '...' },
 *     ]}
 *   />
 *
 * Each step locates its target via querySelector (use a `data-tour="key"`
 * attribute on the element). If a step has `placement: 'center'`, the
 * tooltip is shown without a target.
 */
export default function Tour({ id, steps, autoStart = false, onClose, forceOpen = false }) {
  const storageKey = `tour:${id}:done`
  const [active, setActive] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState(null)
  const tooltipRef = useRef(null)

  // Decide whether to open on mount
  useEffect(() => {
    if (forceOpen) {
      setActive(true)
      setStepIdx(0)
      return
    }
    if (autoStart && typeof window !== 'undefined') {
      const seen = localStorage.getItem(storageKey)
      if (!seen) {
        // Slight delay so target elements are mounted
        const t = setTimeout(() => setActive(true), 300)
        return () => clearTimeout(t)
      }
    }
  }, [autoStart, forceOpen, storageKey])

  const currentStep = steps?.[stepIdx]

  // Measure target rect for spotlight + tooltip positioning
  useLayoutEffect(() => {
    if (!active || !currentStep) return
    function measure() {
      if (currentStep.placement === 'center' || !currentStep.target) {
        setRect(null)
        return
      }
      const el = document.querySelector(currentStep.target)
      if (!el) {
        setRect(null)
        return
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      // Re-measure after scroll
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right })
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, stepIdx, currentStep?.target, currentStep?.placement])

  function finish() {
    localStorage.setItem(storageKey, '1')
    setActive(false)
    setStepIdx(0)
    onClose?.()
  }

  function next() {
    if (stepIdx >= steps.length - 1) finish()
    else setStepIdx(stepIdx + 1)
  }
  function prev() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1)
  }

  if (!active || !currentStep) return null

  // Compute tooltip position
  const tooltipStyle = computeTooltipStyle(rect, currentStep.placement)
  const spotlightStyle = rect && currentStep.placement !== 'center' ? {
    top: rect.top - 6,
    left: rect.left - 6,
    width: rect.width + 12,
    height: rect.height + 12,
  } : null

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* Dark overlay with a cutout where the spotlight is */}
      {spotlightStyle ? (
        <>
          {/* 4 dark panels around the spotlight */}
          <div className="absolute bg-gray-900/50 pointer-events-auto"
            style={{ top: 0, left: 0, right: 0, height: spotlightStyle.top }} onClick={finish} />
          <div className="absolute bg-gray-900/50 pointer-events-auto"
            style={{ top: spotlightStyle.top + spotlightStyle.height, left: 0, right: 0, bottom: 0 }} onClick={finish} />
          <div className="absolute bg-gray-900/50 pointer-events-auto"
            style={{ top: spotlightStyle.top, left: 0, width: spotlightStyle.left, height: spotlightStyle.height }} onClick={finish} />
          <div className="absolute bg-gray-900/50 pointer-events-auto"
            style={{ top: spotlightStyle.top, left: spotlightStyle.left + spotlightStyle.width, right: 0, height: spotlightStyle.height }} onClick={finish} />

          {/* Spotlight ring */}
          <div
            className="absolute rounded-xl pointer-events-none ring-2 ring-redwood-500 ring-offset-2 ring-offset-white transition-all"
            style={spotlightStyle}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-gray-900/50 pointer-events-auto" onClick={finish} />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={currentStep.title ? `tour-${id}-title` : undefined}
        className="absolute modal-panel p-5 pointer-events-auto"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Step {stepIdx + 1} of {steps.length}</p>
          <button
            type="button"
            onClick={finish}
            className="-mt-1.5 -mr-1.5 p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Close tour"
            title="Close tour"
          >
            <X className="icon" aria-hidden />
          </button>
        </div>
        {currentStep.title && (
          <h3 id={`tour-${id}-title`} className="font-serif font-semibold text-gray-900 text-lg leading-snug mt-1">
            {currentStep.title}
          </h3>
        )}
        <p className="text-sm text-gray-600 leading-relaxed mt-1.5">{currentStep.body}</p>

        {/* Progress dots */}
        <div className="mt-4 flex items-center gap-1" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${i === stepIdx ? 'w-5 bg-redwood-600' : i < stepIdx ? 'w-2 bg-redwood-200' : 'w-2 bg-gray-200'}`}
            />
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="btn-ghost btn-sm"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={prev}
                className="btn-secondary btn-sm"
              >
                <ArrowLeft className="icon-sm" aria-hidden />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="btn-primary btn-sm"
            >
              {stepIdx === steps.length - 1 ? (
                <>
                  <Check className="icon-sm" aria-hidden />
                  Got it
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="icon-sm" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Decide where to put the tooltip card relative to the highlighted element
function computeTooltipStyle(rect, placement) {
  const W = 320 // tooltip max width
  const H = 240 // estimate
  const margin = 12

  if (!rect || placement === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(90vw, 360px)'
    }
  }

  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  // Try below first
  const spaceBelow = viewportH - rect.bottom
  const spaceAbove = rect.top
  const goBelow = placement === 'bottom' || (placement !== 'top' && spaceBelow > H + margin)
  const top = goBelow
    ? Math.min(rect.bottom + margin, viewportH - H - margin)
    : Math.max(margin, rect.top - H - margin)

  // Center horizontally to target, clamp to viewport
  let left = rect.left + rect.width / 2 - W / 2
  left = Math.max(margin, Math.min(left, viewportW - W - margin))

  return { top, left, width: W }
}

// Hook for triggering a tour from anywhere (e.g., a help button)
export function useTour(id) {
  const storageKey = `tour:${id}:done`
  return {
    markSeen: () => localStorage.setItem(storageKey, '1'),
    reset: () => localStorage.removeItem(storageKey),
  }
}
