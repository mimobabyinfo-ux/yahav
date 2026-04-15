// Date formatting and calculation utilities

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5)
}

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (formatDate(date) === formatDate(today)) return 'היום'
  if (formatDate(date) === formatDate(yesterday)) return 'אתמול'

  return date.toLocaleDateString('he-IL', {
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
    diaper: '🧷',
    tummy_time: '🐣',
    milestone: '⭐',
    doctor_visit: '🏥',
    note: '📝',
  }
  return emojis[type] ?? '•'
}
