// "YYYY-MM-DD" for a Date in the browser's LOCAL timezone.
// (Never use toISOString() for this — it converts to UTC, which shifts
// local midnight to the previous day during British Summer Time.)
export function localDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
