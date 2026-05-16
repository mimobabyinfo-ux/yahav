import type { DailyLogEntryWithDetails } from '../../lib/supabase'
import { formatDate } from '../../utils/dateUtils'
import { ENTRY_COLORS } from '../DailyTimeline'

// Weekly grid: 7-column day strip + color-dot stack per day. Extracted
// as-is from JournalPage during the Phase 3 / C3 refactor. C4 will replace
// this with the BabyTracker-style stacked-bar visualization + highlights.

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

type Props = {
  entries: DailyLogEntryWithDetails[]
  weekStart: Date
  onDayClick: (date: string) => void
}

export default function WeekView({ entries, weekStart, onDayClick }: Props) {
  const today = formatDate(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const byDate: Record<string, DailyLogEntryWithDetails[]> = {}
  entries.forEach(e => {
    if (!byDate[e.entry_date]) byDate[e.entry_date] = []
    byDate[e.entry_date].push(e)
  })

  return (
    <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-sand-100">
        {days.map((d, i) => {
          const ds = formatDate(d)
          const isToday = ds === today
          return (
            <button
              key={ds}
              onClick={() => onDayClick(ds)}
              className="flex flex-col items-center py-2 hover:bg-mustard-50 transition-colors"
            >
              <span className="text-[10px] text-sand-400">{DAY_LABELS[i]}</span>
              <span
                className={`text-sm font-bold mt-0.5 w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'text-white' : 'text-sand-700'}`}
                style={isToday ? { background: '#E7C78A' } : {}}
              >
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {/* Entry color dots grid */}
      <div className="grid grid-cols-7 min-h-[120px] p-2 gap-1">
        {days.map(d => {
          const ds = formatDate(d)
          const dayEntries = byDate[ds] ?? []
          return (
            <button
              key={ds}
              onClick={() => onDayClick(ds)}
              className="flex flex-col gap-1 items-center pt-1 hover:bg-sand-50 rounded-xl transition-colors min-h-[100px]"
            >
              {dayEntries.slice(0, 6).map(e => {
                const col = ENTRY_COLORS[e.entry_type] ?? { dot: '#9ca3af' }
                return (
                  <div key={e.id} className="w-4 h-4 rounded-md flex-shrink-0" style={{ background: col.dot }} title={e.entry_type} />
                )
              })}
              {dayEntries.length > 6 && (
                <span className="text-[9px] text-sand-400">+{dayEntries.length - 6}</span>
              )}
            </button>
          )
        })}
      </div>

      <p className="text-center text-xs text-sand-300 pb-2">לחצי על יום לצפייה מפורטת</p>
    </div>
  )
}
