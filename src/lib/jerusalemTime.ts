// Task B (offer expiry enhancement): all offer expiry times are
// interpreted as Asia/Jerusalem wall-clock. The DB stores a UTC
// timestamptz; the admin types "20:30 on Sunday" expecting that to
// mean 20:30 Israel time regardless of which browser timezone she
// happens to be in. These helpers do the conversion without pulling
// in date-fns / luxon.
//
// Algorithm for wall-clock → UTC:
//   1. Treat the input components as if they were UTC. This gives a
//      tentative instant that's off by exactly the Jerusalem offset.
//   2. Ask Intl what wall-clock that tentative instant displays as
//      in Asia/Jerusalem. The difference between THAT display and
//      the original input IS the Jerusalem offset at that moment
//      (DST-aware — Intl handles IDT/IST transitions for us).
//   3. Subtract that offset from the tentative instant to get the
//      real UTC moment when Jerusalem wall-clock reads the input.

const TZ = 'Asia/Jerusalem'

function partsToObject(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const p of parts) o[p.type] = p.value
  return o
}

/**
 * Convert a wall-clock datetime in Asia/Jerusalem to a UTC ISO string.
 * Input shape: "YYYY-MM-DDTHH:mm" (the value emitted by
 * `<input type="datetime-local">`, no timezone, no seconds).
 *
 * Example (summer / IDT, UTC+3):
 *   "2026-06-21T20:30" → "2026-06-21T17:30:00.000Z"
 * Example (winter / IST, UTC+2):
 *   "2026-12-21T20:30" → "2026-12-21T18:30:00.000Z"
 */
export function jerusalemWallClockToIsoUtc(wallClock: string): string {
  const [datePart, timePart = '00:00'] = wallClock.split('T')
  const [yStr, mStr, dStr] = datePart.split('-')
  const [hhStr = '0', miStr = '0'] = timePart.split(':')
  const y = Number(yStr), m = Number(mStr), d = Number(dStr)
  const hh = Number(hhStr), mi = Number(miStr)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Bad wall-clock value: ${wallClock}`)
  }

  const asIfUtc = Date.UTC(y, m - 1, d, hh, mi)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const p = partsToObject(fmt.formatToParts(new Date(asIfUtc)))
  // Some Intl impls return "24" for midnight when hour12=false; normalize.
  const jH = Number(p.hour) === 24 ? 0 : Number(p.hour)
  const jerusalemAsUtcComponents = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    jH, Number(p.minute), Number(p.second),
  )
  const offsetMs = jerusalemAsUtcComponents - asIfUtc
  return new Date(asIfUtc - offsetMs).toISOString()
}

/**
 * Convert a UTC ISO timestamp to a wall-clock string suitable for
 * pre-filling `<input type="datetime-local">`, representing
 * Asia/Jerusalem local time.
 *
 * Input: "2026-06-21T17:30:00.000Z" → Output: "2026-06-21T20:30"
 */
export function utcToJerusalemWallClock(iso: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
  const p = partsToObject(fmt.formatToParts(d))
  const hh = p.hour === '24' ? '00' : p.hour
  return `${p.year}-${p.month}-${p.day}T${hh}:${p.minute}`
}

/**
 * Format a UTC ISO timestamp for display, in Asia/Jerusalem, as
 * "DD/MM/YYYY HH:mm" — what the admin should see in the offers list.
 */
export function formatJerusalemDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    timeZone: TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  })
}
