import { History, CalendarClock } from 'lucide-react'
import { describeHistory } from '../../hooks/useSheetHistory'

// Small badge showing whether the student has done / has planned this sheet.
// Score colours follow the app rule: >=70 forest, 40-69 amber, <40 red.
export default function SheetHistoryBadge({ history, className = '' }) {
  if (!history || (!history.completed && !history.planned)) return null
  const done = history.completed > 0
  const score = done && history.lastScore != null ? Math.round(history.lastScore) : null
  const cls = score == null ? 'badge' : score >= 70 ? 'badge-success' : score >= 40 ? 'badge-warning' : 'badge-danger'
  const Icon = done ? History : CalendarClock
  const short = done ? `Done${score != null ? ` ${score}%` : ''}` : 'Planned'
  const description = describeHistory(history)
  return (
    <span className={`${cls} text-[10px] px-1.5 py-0 flex-shrink-0 ${className}`} title={description}>
      <Icon className="icon-sm" aria-hidden />
      <span aria-hidden>{short}</span>
      <span className="sr-only">{description}</span>
    </span>
  )
}
