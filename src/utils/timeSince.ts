import { tx } from '../i18n'
export function formatTimeSince(timestamp: Date | null, emptyText: string): string {
  if (!timestamp) return emptyText
  const ms = Date.now() - timestamp.getTime()
  if (ms < 0) return emptyText

  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return tx('עכשיו')
  if (totalMin < 60) return tx('לפני {totalMin} דק\'', { totalMin })

  const totalHours = Math.floor(totalMin / 60)
  const remMin = totalMin % 60
  if (totalHours < 24) {
    if (remMin === 0) return tx('לפני {totalHours}ש', { totalHours })
    return tx('לפני {totalHours}ש {remMin}דק\'', { totalHours, remMin })
  }

  const totalDays = Math.floor(totalHours / 24)
  const remHours = totalHours % 24
  if (totalDays === 1) {
    if (remHours === 0) return tx('לפני יום')
    if (remHours === 1) return tx('לפני יום ושעה')
    if (remHours === 2) return tx('לפני יום ושעתיים')
    return tx('לפני יום ו-{remHours} שעות', { remHours })
  }
  if (totalDays === 2) {
    if (remHours === 0) return tx('לפני יומיים')
    if (remHours === 1) return tx('לפני יומיים ושעה')
    if (remHours === 2) return tx('לפני יומיים ושעתיים')
    return tx('לפני יומיים ו-{remHours} שעות', { remHours })
  }
  return tx('לפני {totalDays} ימים', { totalDays })
}
