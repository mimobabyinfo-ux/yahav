// Add-to-calendar, as a downloaded .ics file.
//
// Two ways out, because neither covers everyone:
//   googleCalendarUrl — one tap for anyone living in Google Calendar,
//     which is most Android and most desktops.
//   downloadIcs — a file every calendar on every device opens, and the
//     only thing that helps the many mothers on an iPhone using the
//     Apple calendar. Also the only option that can carry several
//     events at once.
//
// Times are written as LOCAL times with a VTIMEZONE-free
// Asia/Jerusalem-naive format (DTSTART;TZID=Asia/Jerusalem), which every
// major calendar resolves correctly and which — unlike UTC conversion —
// can't drift by an hour when Israel switches to winter time between
// today and the event.

export type CalendarEvent = {
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM or HH:MM:SS — optional. Missing time = an all-day entry. */
  startTime?: string | null
  endTime?: string | null
  location?: string | null
  description?: string | null
  /** Stable id so re-adding updates the same entry instead of duplicating. */
  uid: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** YYYY-MM-DD (+ HH:MM) → 20260812T100000 */
function stamp(date: string, time?: string | null): string {
  const d = date.replace(/-/g, '')
  if (!time) return d
  const [h, m] = time.split(':')
  return `${d}T${pad(Number(h))}${pad(Number(m))}00`
}

/** Add hours to an HH:MM, clamped inside the same day. */
function plusHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 59, h * 60 + m + hours * 60)
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** RFC 5545 wants CRLF, escaped separators, and lines under 75 octets. */
function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 73) {
    out.push(rest.slice(0, 73))
    rest = ' ' + rest.slice(73)
  }
  out.push(rest)
  return out.join('\r\n')
}

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildIcs(events: CalendarEvent[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mimo//he//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  for (const ev of events) {
    const allDay = !ev.startTime
    const start = stamp(ev.date, ev.startTime)
    // No end time given: an hour and a half, the length of a Mimo meeting.
    const end = allDay ? null : stamp(ev.date, ev.endTime || plusHours(ev.startTime!.slice(0, 5), 1.5))
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${ev.uid}@mimo-baby.co.il`)
    // A fixed DTSTAMP would be wrong; calendars use it for versioning.
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`)
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${start}`)
    } else {
      lines.push(`DTSTART;TZID=Asia/Jerusalem:${start}`)
      lines.push(`DTEND;TZID=Asia/Jerusalem:${end}`)
    }
    lines.push(fold(`SUMMARY:${esc(ev.title)}`))
    if (ev.location) lines.push(fold(`LOCATION:${esc(ev.location)}`))
    if (ev.description) lines.push(fold(`DESCRIPTION:${esc(ev.description)}`))
    // A reminder the evening before — the single most useful default
    // for something you signed up for weeks earlier.
    lines.push('BEGIN:VALARM', 'TRIGGER:-PT18H', 'ACTION:DISPLAY', 'DESCRIPTION:תזכורת', 'END:VALARM')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** Build the file and hand it to the device. */
export function downloadIcs(events: CalendarEvent[], filename = 'mimo.ics'): void {
  const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick — Safari needs the URL alive during click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A filename that won't confuse a downloads folder full of "mimo.ics". */
export function icsFilename(title: string, date: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || 'mimo'
  return `${safe} ${date}.ics`
}


// ─── Google Calendar ────────────────────────────────────────────────────────
// The render URL takes UTC instants, so an Israel wall-clock time has to
// be converted — and the offset is +2 or +3 depending on whether the
// event falls in winter or summer time. Asking the browser for the zone
// offset AT THAT DATE (rather than using the current one) is what keeps
// an event booked in August from landing an hour off in November.

function jerusalemOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value
    return acc
  }, {})
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second),
  )
  return (asUtc - instant.getTime()) / 60000
}

/** An Israel wall-clock date+time → the matching UTC instant. */
function jerusalemToUtc(date: string, time: string): Date {
  const naive = new Date(`${date}T${time.slice(0, 5)}:00Z`)
  return new Date(naive.getTime() - jerusalemOffsetMinutes(naive) * 60000)
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function googleCalendarUrl(ev: CalendarEvent): string {
  const params = new URLSearchParams({ action: 'TEMPLATE', text: ev.title })
  if (ev.startTime) {
    const start = jerusalemToUtc(ev.date, ev.startTime)
    const end = ev.endTime
      ? jerusalemToUtc(ev.date, ev.endTime)
      : new Date(start.getTime() + 90 * 60000)
    params.set('dates', `${utcStamp(start)}/${utcStamp(end)}`)
  } else {
    // All-day: Google wants the END date to be the following day.
    const next = new Date(`${ev.date}T12:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    params.set('dates', `${ev.date.replace(/-/g, '')}/${next.toISOString().slice(0, 10).replace(/-/g, '')}`)
  }
  if (ev.location) params.set('location', ev.location)
  if (ev.description) params.set('details', ev.description)
  params.set('ctz', 'Asia/Jerusalem')
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
