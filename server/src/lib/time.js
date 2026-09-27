// Timezone helpers. The server runs in UTC on Vercel, but lesson times are
// entered in the tuition centre's local time (UK). Every "18:00 on Tuesday"
// or "today" calculation must happen in APP_TIMEZONE, not server time.
//
// No external dependency — uses Intl, which Node ships with full ICU data.

const TZ = process.env.APP_TIMEZONE || 'Europe/London';

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  weekday: 'short',
});

// Wall-clock parts of `date` as seen in APP_TIMEZONE.
function zonedParts(date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map(x => [x.type, x.value]));
  return {
    year: Number(p.year),
    month0: Number(p.month) - 1,
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAY_INDEX[p.weekday], // 0 = Sunday
  };
}

// Offset of APP_TIMEZONE from UTC at the given instant, in minutes.
function offsetMinutes(date) {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month0, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

// Convert a wall-clock time in APP_TIMEZONE to a real (UTC) Date.
function zonedToUtc(year, month0, day, hour = 0, minute = 0) {
  const guess = new Date(Date.UTC(year, month0, day, hour, minute));
  let result = new Date(guess.getTime() - offsetMinutes(guess) * 60000);
  // Second pass corrects the rare case where the guess straddles a DST change.
  const corrected = new Date(guess.getTime() - offsetMinutes(result) * 60000);
  if (corrected.getTime() !== result.getTime()) result = corrected;
  return result;
}

// "YYYY-MM-DD" for the calendar day `date` falls on in APP_TIMEZONE.
function zonedDateKey(date) {
  const p = zonedParts(date);
  return `${p.year}-${String(p.month0 + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// UTC start/end instants for one local calendar day. Accepts "YYYY-MM-DD"
// (interpreted as a local date) or defaults to today.
function zonedDayRange(dateKey) {
  let year, month0, day;
  if (typeof dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    [year, month0, day] = dateKey.split('-').map(Number);
    month0 -= 1;
  } else {
    ({ year, month0, day } = zonedParts(new Date()));
  }
  const start = zonedToUtc(year, month0, day, 0, 0);
  // Next local midnight, minus 1ms (handles 23h/25h DST days correctly)
  const next = new Date(Date.UTC(year, month0, day + 1));
  const end = new Date(zonedToUtc(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 0, 0).getTime() - 1);
  return { start, end };
}

module.exports = { TZ, zonedParts, zonedToUtc, zonedDateKey, zonedDayRange };
