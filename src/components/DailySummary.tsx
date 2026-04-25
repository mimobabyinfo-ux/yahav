import type { DailyLogEntryWithDetails } from '../lib/supabase'
import { formatDuration } from '../utils/dateUtils'
import { ENTRY_COLORS } from './DailyTimeline'

type Props = {
  entries: DailyLogEntryWithDetails[]
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

export default function DailySummary({ entries }: Props) {
  const feedings = entries.filter(e => e.entry_type === 'feeding')
  const sleeps   = entries.filter(e => e.entry_type === 'sleep')
  const diapers  = entries.filter(e => e.entry_type === 'diaper')

  const totalFeedingMins = feedings.reduce((s, e) => s + (e.feeding_details?.duration_minutes ?? 0), 0)
  const totalSleepMins   = sleeps.reduce((s, e) => s + (e.sleep_details?.duration_minutes ?? 0), 0)

  const stats = [
    { emoji: '🍼', label: 'האכלות', value: feedings.length, sub: totalFeedingMins > 0 ? formatDuration(totalFeedingMins) : '' },
    { emoji: '😴', label: 'שינה',   value: sleeps.length,   sub: totalSleepMins > 0 ? formatDuration(totalSleepMins) : '' },
    { emoji: '🧷', label: 'חיתולים', value: diapers.length, sub: '' },
  ]

  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-sm p-5 text-center">
        <p className="text-sand-400 text-sm">עדיין אין פעילויות היום</p>
        <p className="text-sand-300 text-xs mt-1">הוסיפי רשומה ראשונה 👇</p>
      </div>
    )
  }

  // 24-hour color bar segments
  const DAY_MINS = 24 * 60
  const colorSegments = entries
    .filter(e => e.entry_time)
    .map(e => {
      const startMin = timeToMinutes(e.entry_time)
      const durMin =
        e.entry_type === 'feeding' ? (e.feeding_details?.duration_minutes ?? 5) :
        e.entry_type === 'sleep'   ? (e.sleep_details?.duration_minutes ?? 30) :
        e.entry_type === 'pumping' ? 15 : 5
      const colors = ENTRY_COLORS[e.entry_type] ?? ENTRY_COLORS.note
      return {
        left: (startMin / DAY_MINS) * 100,
        width: Math.max((durMin / DAY_MINS) * 100, 0.8),
        color: colors.dot,
      }
    })

  const legend = [
    { label: 'האכלה', color: ENTRY_COLORS.feeding.dot },
    { label: 'שינה',  color: ENTRY_COLORS.sleep.dot },
    { label: 'חיתול', color: ENTRY_COLORS.diaper.dot },
  ]

  return (
    <div className="bg-white rounded-3xl shadow-sm p-4 space-y-4">
      {/* 24-hour color bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-sand-500">יום בצבעים</h3>
          <div className="flex items-center gap-2">
            {legend.map(l => (
              <span key={l.label} className="flex items-center gap-0.5 text-[10px] text-sand-400">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="relative h-5 rounded-xl overflow-hidden" dir="ltr" style={{ background: '#F3F0EB' }}>
          {colorSegments.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${seg.left}%`,
                width: `${seg.width}%`,
                background: seg.color,
                opacity: 0.85,
                borderRadius: '3px',
              }}
            />
          ))}
          {[6, 12, 18].map(h => (
            <div
              key={h}
              className="absolute top-0 h-full w-px bg-white opacity-50"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-sand-300 mt-0.5 px-0.5" dir="ltr">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-3 justify-around">
        {stats.map(stat => (
          <div key={stat.label} className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#FBF6E9' }}>
              <span className="text-2xl">{stat.emoji}</span>
            </div>
            <span className="text-2xl font-bold text-sand-800">{stat.value}</span>
            <span className="text-xs text-sand-500">{stat.label}</span>
            {stat.sub && <span className="text-xs font-medium" style={{ color: '#C49438' }}>{stat.sub}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
