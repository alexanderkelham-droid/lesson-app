// All lesson dates and times in the portal are UK time (Europe/London),
// whatever time zone the viewer's device is set to. A tutor whose laptop is
// on Central European time must still see and enter "17:40" for a 17:40 UK
// lesson. Use these helpers instead of toLocale*String / new Date('…T…').

export const TZ = 'Europe/London'

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
})
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Wall-clock parts in UK time
export function ukParts(date) {
  const d = date instanceof Date ? date : new Date(date)
  const p = Object.fromEntries(partsFmt.formatToParts(d).map(x => [x.type, x.value]))
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second, weekday: WD[p.weekday] }
}

const pad = n => String(n).padStart(2, '0')

// "YYYY-MM-DD" / "HH:MM" of an instant, in UK time (for <input type="date|time">)
export const ukDateKey = date => { const p = ukParts(date); return `${p.year}-${pad(p.month)}-${pad(p.day)}` }
export const ukTimeKey = date => { const p = ukParts(date); return `${pad(p.hour)}:${pad(p.minute)}` }
export const ukDateTimeInput = date => `${ukDateKey(date)}T${ukTimeKey(date)}` // for datetime-local inputs
export const todayUk = () => ukDateKey(new Date())

// UK wall-clock date ("YYYY-MM-DD") + time ("HH:MM") -> ISO instant (handles BST/GMT)
export function ukToIso(dateKey, timeKey = '00:00') {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = (timeKey || '00:00').split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const offset = at => { const p = ukParts(new Date(at)); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at }
  let t = guess - offset(guess)
  const t2 = guess - offset(t)
  if (t2 !== t) t = t2
  return new Date(t).toISOString()
}
// datetime-local value ("YYYY-MM-DDTHH:MM") interpreted as UK time -> ISO
export const ukInputToIso = value => { const [d, t] = String(value).split('T'); return ukToIso(d, t) }

// Formatting (always UK time)
const f = opts => date => (date ? new Date(date).toLocaleString('en-GB', { timeZone: TZ, ...opts }) : '')
export const fmtTime = f({ hour: '2-digit', minute: '2-digit' })                                    // 17:40
export const fmtDate = f({ day: 'numeric', month: 'short', year: 'numeric' })                       // 7 Oct 2026
export const fmtDay = f({ weekday: 'short', day: 'numeric', month: 'short' })                       // Tue 7 Oct
export const fmtDayLong = f({ weekday: 'long', day: 'numeric', month: 'long' })                     // Tuesday 7 October
export const fmtDateLong = f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })   // Tuesday 7 October 2026
export const fmtDayTime = date => (date ? `${fmtDay(date)}, ${fmtTime(date)}` : '')                  // Tue 7 Oct, 17:40
export const ukWeekday = date => ukParts(date).weekday // 0 = Sunday
