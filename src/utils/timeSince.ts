export function formatTimeSince(timestamp: Date | null, emptyText: string): string {
  if (!timestamp) return emptyText
  const ms = Date.now() - timestamp.getTime()
  if (ms < 0) return emptyText

  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return 'עכשיו'
  if (totalMin < 60) return `לפני ${totalMin} דק'`

  const totalHours = Math.floor(totalMin / 60)
  const remMin = totalMin % 60
  if (totalHours < 24) {
    if (remMin === 0) return `לפני ${totalHours}ש`
    return `לפני ${totalHours}ש ${remMin}דק'`
  }

  const totalDays = Math.floor(totalHours / 24)
  const remHours = totalHours % 24
  if (totalDays === 1) {
    if (remHours === 0) return 'לפני יום'
    if (remHours === 1) return 'לפני יום ושעה'
    if (remHours === 2) return 'לפני יום ושעתיים'
    return `לפני יום ו-${remHours} שעות`
  }
  if (totalDays === 2) {
    if (remHours === 0) return 'לפני יומיים'
    if (remHours === 1) return 'לפני יומיים ושעה'
    if (remHours === 2) return 'לפני יומיים ושעתיים'
    return `לפני יומיים ו-${remHours} שעות`
  }
  return `לפני ${totalDays} ימים`
}
