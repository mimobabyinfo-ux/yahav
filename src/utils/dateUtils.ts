// Date formatting and calculation utilities.
// All "today/yesterday/tomorrow" logic and YYYY-MM-DD strings use Israel timezone
// (Asia/Jerusalem), regardless of the browser's local timezone. The app is Israel-only;
// this avoids day-shift bugs when the device is set to a different timezone or when
// UTC and local cross midnight in opposite directions.

const ISRAEL_TZ = 'Asia/Jerusalem'

export function formatDate(date: Date): string {
  // 'en-CA' formats as YYYY-MM-DD; timeZone forces the Israel calendar day.
  return date.toLocaleDateString('en-CA', { timeZone: ISRAEL_TZ })
}

export function formatTime(date: Date): string {
  // 24-hour HH:MM in Israel timezone.
  return date.toLocaleTimeString('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
}

// Hour of day (0-23) in Israel timezone — for greeting / time-of-day branching.
export function getIsraelHour(date: Date = new Date()): number {
  const hh = date.toLocaleString('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false })
  return parseInt(hh, 10)
}

export function formatDisplayDate(dateStr: string): string {
  const todayStr = formatDate(new Date())
  // Anchor at noon to dodge any DST edge when shifting by ±1 day.
  const anchor = new Date(todayStr + 'T12:00:00')
  const yesterdayStr = formatDate(new Date(anchor.getTime() - 86400000))
  const tomorrowStr  = formatDate(new Date(anchor.getTime() + 86400000))

  if (dateStr === todayStr)     return 'היום'
  if (dateStr === yesterdayStr) return 'אתמול'
  if (dateStr === tomorrowStr)  return 'מחר'

  // Fall back to a Hebrew weekday + day + month label.
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('he-IL', {
    timeZone: ISRAEL_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) {
    const secs = Math.round(minutes * 60)
    return `${secs} שנ'`
  }
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} דק'`
  if (m === 0) return `${h} ש'`
  return `${h} ש' ${m} דק'`
}

export function formatElapsed(startTime: string): string {
  const start = new Date(startTime).getTime()
  const now = Date.now()
  const diffMs = now - start
  const totalSeconds = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

export function getBabyAge(dob: string | null): string {
  if (!dob) return ''
  const birth = new Date(dob)
  const now = new Date()
  const diffMs = now.getTime() - birth.getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30.44)

  if (days < 14) return `${days} ימים`
  if (weeks < 8) return `${weeks} שבועות`
  if (months < 24) return `${months} חודשים`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths > 0 ? `${years} שנים ו-${remMonths} חודשים` : `${years} שנים`
}

export function getWeekDates(centerDate: Date, count = 7): Date[] {
  const dates: Date[] = []
  const start = new Date(centerDate)
  start.setDate(centerDate.getDate() - Math.floor(count / 2))
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d)
  }
  return dates
}

export function isToday(dateStr: string): boolean {
  return dateStr === formatDate(new Date())
}

export function entryTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    feeding: 'האכלה',
    sleep: 'שינה',
    diaper: 'חיתול',
    tummy_time: 'זמן בטן',
    pumping: 'שאיבה',
    milestone: 'אבן דרך',
    doctor_visit: 'ביקור רופא',
    note: 'הערה',
  }
  return labels[type] ?? type
}

export function entryTypeEmoji(type: string): string {
  const emojis: Record<string, string> = {
    feeding: '🍼',
    sleep: '😴',
    diaper: '💩',
    tummy_time: '🤸',
    pumping: '🥛',
    milestone: '🎯',
    doctor_visit: '👨‍⚕️',
    note: '📝',
  }
  return emojis[type] ?? '•'
}
