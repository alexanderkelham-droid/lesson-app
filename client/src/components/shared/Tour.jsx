import { useState, useEffect, useLayoutEffect, useRef } from 'react'

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
          <div className="absolute bg-black/60 pointer-events-auto"
            style={{ top: 0, left: 0, right: 0, height: spotlightStyle.top }} onClick={finish} />
          <div className="absolute bg-black/60 pointer-events-auto"
            style={{ top: spotlightStyle.top + spotlightStyle.height, left: 0, right: 0, bottom: 0 }} onClick={finish} />
          <div className="absolute bg-black/60 pointer-events-auto"
            style={{ top: spotlightStyle.top, left: 0, width: spotlightStyle.left, height: spotlightStyle.height }} onClick={finish} />
          <div className="absolute bg-black/60 pointer-events-auto"
            style={{ top: spotlightStyle.top, left: spotlightStyle.left + spotlightStyle.width, right: 0, height: spotlightStyle.height }} onClick={finish} />

          {/* Spotlight ring */}
          <div
            className="absolute rounded-lg pointer-events-none ring-4 ring-redwood-400/80 ring-offset-2 transition-all"
            style={spotlightStyle}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={finish} />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute bg-white rounded-2xl shadow-2xl border-t-4 border-redwood-600 p-5 max-w-xs pointer-events-auto"
        style={tooltipStyle}
      >
        {currentStep.title && (
          <h3 className="font-serif font-bold text-gray-900 text-lg mb-1">{currentStep.title}</h3>
        )}
        <p className="text-sm text-forest-800 leading-relaxed">{currentStep.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400 font-medium">
            {stepIdx + 1} of {steps.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={finish}
              className="text-xs text-gray-500 hover:text-gray-800 px-2 py-1"
            >
              Skip
            </button>
            {stepIdx > 0 && (
              <button
                onClick={prev}
                className="btn-secondary text-xs py-1 px-3"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="btn-primary text-xs py-1 px-4"
            >
              {stepIdx === steps.length - 1 ? 'Got it' : 'Next'}
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
  const H = 200 // estimate
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
