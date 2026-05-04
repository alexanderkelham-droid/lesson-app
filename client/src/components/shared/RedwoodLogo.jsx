/**
 * RedwoodLogo — stylized redwood tree silhouette.
 *
 * Variants:
 *  - "mark"  : icon only (square)
 *  - "wordmark" : icon + "Redwood Scholars" text
 *  - "stacked" : icon over text, centered
 *
 * Colors are inherited via currentColor on the foliage (so it themes automatically).
 * The trunk uses a slightly darker tone built from the Redwood palette.
 */

export default function RedwoodLogo({
  variant = 'wordmark',
  size = 'md',
  className = '',
  trunkColor = '#7e2614',
}) {
  const sizes = {
    xs: { mark: 20, text: 'text-sm' },
    sm: { mark: 28, text: 'text-base' },
    md: { mark: 36, text: 'text-xl' },
    lg: { mark: 56, text: 'text-3xl' },
    xl: { mark: 72, text: 'text-4xl' },
  }
  const s = sizes[size] || sizes.md

  const Mark = (
    <svg
      width={s.mark}
      height={s.mark}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      {/* trunk */}
      <rect x="44" y="80" width="12" height="16" rx="1.5" fill={trunkColor} />
      {/* small base shadow */}
      <ellipse cx="50" cy="96" rx="22" ry="2" fill={trunkColor} opacity="0.15" />
      {/* foliage layers — three stacked triangles, currentColor inherits theme */}
      <path d="M50 6 L28 30 L72 30 Z" fill="currentColor" opacity="0.95" />
      <path d="M50 26 L22 52 L78 52 Z" fill="currentColor" opacity="0.85" />
      <path d="M50 46 L16 78 L84 78 Z" fill="currentColor" />
    </svg>
  )

  if (variant === 'mark') {
    return <span className={`text-redwood-600 ${className}`}>{Mark}</span>
  }

  if (variant === 'stacked') {
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <span className="text-redwood-600">{Mark}</span>
        <div className="text-center leading-tight">
          <p className={`font-serif font-bold text-redwood-700 ${s.text}`}>Redwood</p>
          <p className="text-xs uppercase tracking-[0.25em] text-forest-700 mt-0.5">Scholars</p>
        </div>
      </div>
    )
  }

  // wordmark (default): icon + name horizontally
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="text-redwood-600">{Mark}</span>
      <span className="leading-tight">
        <span className={`block font-serif font-bold text-redwood-700 ${s.text}`}>
          Redwood Scholars
        </span>
        {size !== 'xs' && size !== 'sm' && (
          <span className="block text-[10px] uppercase tracking-[0.25em] text-forest-700 -mt-0.5">
            Tuition
          </span>
        )}
      </span>
    </span>
  )
}
