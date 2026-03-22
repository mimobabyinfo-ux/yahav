import type { DailyLogEntryWithDetails } from '../lib/supabase'
import { formatDuration } from '../utils/dateUtils'

type Props = {
  entries: DailyLogEntryWithDetails[]
}

export default function DailySummary({ entries }: Props) {
  const feedings = entries.filter(e => e.entry_type === 'feeding')
  const sleeps = entries.filter(e => e.entry_type === 'sleep')
  const diapers = entries.filter(e => e.entry_type === 'diaper')

  const totalFeedingMins = feedings.reduce(
    (sum, e) => sum + (e.feeding_details?.duration_minutes ?? 0), 0
  )
  const totalSleepMins = sleeps.reduce(
    (sum, e) => sum + (e.sleep_details?.duration_minutes ?? 0), 0
  )

  const stats = [
    { emoji: '🍼', label: 'האכלות', value: feedings.length.toString(), sub: totalFeedingMins > 0 ? formatDuration(totalFeedingMins) : '' },
    { emoji: '😴', label: 'שינה', value: sleeps.length.toString(), sub: totalSleepMins > 0 ? formatDuration(totalSleepMins) : '' },
    { emoji: '🧷', label: 'חיתולים', value: diapers.length.toString(), sub: '' },
  ]

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm p-5 text-center">
        <p className="text-sand-400 text-sm">עדיין אין פעילויות היום</p>
        <p className="text-sand-300 text-xs mt-1">הוסיפי רשומה ראשונה 👇</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl shadow-sm p-4">
      <h3 className="text-sm font-semibold text-sand-600 mb-3">סיכום יומי</h3>
      <div className="flex gap-3 justify-around">
        {stats.map(stat => (
          <div key={stat.label} className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 bg-mustard-50 rounded-2xl flex items-center justify-center">
              <span className="text-2xl">{stat.emoji}</span>
            </div>
            <span className="text-2xl font-bold text-sand-800">{stat.value}</span>
            <span className="text-xs text-sand-500">{stat.label}</span>
            {stat.sub && <span className="text-xs text-mustard-600 font-medium">{stat.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
