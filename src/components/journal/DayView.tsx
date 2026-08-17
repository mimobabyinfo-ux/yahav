import { useRef } from 'react'
import type { DailyLogEntryWithDetails } from '../../lib/supabase'
import { formatDate, formatDisplayDate } from '../../utils/dateUtils'
import MimoLeaf from '../MimoLeaf'
import DailySummary from '../DailySummary'
import DailyTimeline from '../DailyTimeline'
import DayTimelineChart from './DayTimelineChart'
import JournalHeader from './JournalHeader'

// The day screen.
//
// Brenda 17.8.26: "the journal is very very crowded and messy and hard to
// use... I want it to be intuitive like Google Calendar, where what's in
// the journal is purely baby things."
//
// The crowding was structural, not cosmetic: before any data appeared she
// passed FIVE stacked controls — the tab strip, an arrow row, a week
// strip, a graph/cards/list toggle, and a category filter. Each was
// reasonable on its own; together they were the page.
//
// Google Calendar shows exactly one control, the date, and hides
// everything else behind it. So:
//  · One header line: ‹ 16 יום ראשון › . Tapping the date opens a sheet
//    with the four views and a date picker. The week strip is gone —
//    swiping between days replaces it.
//  · The content is then a single scroll in the order she asked for:
//    timeline → detail → daily summary. No toggle. That is also how a
//    day is actually read: what happened, when exactly, how much in total.
//  · The category filter moved down to sit on the detail list it filters.

type TimelineFilter = 'all' | 'feeding' | 'sleep' | 'diaper' | 'tummy_time'
const TIMELINE_FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all',        label: 'הכל' },
  { value: 'feeding',    label: 'האכלה' },
  { value: 'sleep',      label: 'שינה' },
  { value: 'diaper',     label: 'חיתול' },
  { value: 'tummy_time', label: 'בטן' },
]

const HE_WEEKDAY = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']

type Props = {
  selectedDate: string                                  // YYYY-MM-DD
  onDateChange: (date: string) => void
  entries: DailyLogEntryWithDetails[]
  loading: boolean
  filter: TimelineFilter
  onFilterChange: (f: TimelineFilter) => void
  onEntrySaved: () => void
  onEditEntry: (entry: DailyLogEntryWithDetails) => void
  /** Opens the shared view sheet, which JournalPage owns. */
  onOpenViews: () => void
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
}

/** "16 יום ראשון" — the number first, the way Google Calendar writes it. */
function dayHeading(iso: string): { num: string; weekday: string } {
  const d = new Date(iso + 'T00:00:00')
  return { num: String(d.getDate()), weekday: HE_WEEKDAY[d.getDay()] }
}

export default function DayView({
  selectedDate,
  onDateChange,
  entries,
  loading,
  filter,
  onFilterChange,
  onEntrySaved,
  onEditEntry,
  onOpenViews,
}: Props) {
  const today = formatDate(new Date())
  const isToday = selectedDate === today

  // JournalPage widens fetchEntries by 1 day on the LEFT so the chart can
  // render cross-midnight sleep tails. Everything else wants strictly today.
  const todayEntries = entries.filter(e => e.entry_date === selectedDate)

  const { num, weekday } = dayHeading(selectedDate)

  // ── Swipe-to-navigate (50px deltaX, horizontal-dominant) ────────────
  // RTL convention: swipe LEFT = next day; swipe RIGHT = previous day.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) { touchStartRef.current = null; return }
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 50) return
    if (Math.abs(dx) <= Math.abs(dy)) return
    if (dx < 0) {
      if (!isToday) onDateChange(shiftDate(selectedDate, 1))
    } else {
      onDateChange(shiftDate(selectedDate, -1))
    }
  }

  const filtered = filter === 'all' ? todayEntries : todayEntries.filter(e => e.entry_type === filter)

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="space-y-4">
      <JournalHeader
        onPrev={() => onDateChange(shiftDate(selectedDate, -1))}
        onNext={() => onDateChange(shiftDate(selectedDate, 1))}
        nextDisabled={isToday}
        prevLabel="יום קודם"
        nextLabel="יום הבא"
        onOpenViews={onOpenViews}
      >
        <span className="font-display" style={{ fontSize: 26, lineHeight: 1, color: '#443327' }}>{num}</span>
        <span className="font-semibold" style={{ fontSize: 15, color: '#7B604C' }}>{weekday}</span>
        {isToday && (
          <span className="font-bold rounded-full" style={{ fontSize: 11, padding: '2px 7px', background: '#F6ECD8', color: '#8A6A2F' }}>
            היום
          </span>
        )}
      </JournalHeader>

      {loading && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      )}

      {!loading && (
        <div key={selectedDate} className="animate-rise space-y-4">
          {/* 1 — ציר זמן */}
          <DayTimelineChart entries={entries} selectedDate={selectedDate} />

          {/* 2 — פירוט */}
          <div className="space-y-2">
            <p className="text-[13px] font-bold px-1" style={{ color: '#7B604C' }}>פירוט</p>
            <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#F0EAE0] gap-1">
              {TIMELINE_FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => onFilterChange(f.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                    filter === f.value ? 'shadow-sm' : 'text-sand-500'
                  }`}
                  style={filter === f.value ? { background: '#E7C78A', color: '#4A3A28' } : {}}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#F0EAE0] text-center space-y-2">
                <MimoLeaf variant="sand-2" size={64} rotate={-8} className="mx-auto" />
                <p className="text-sm text-sand-500">
                  {todayEntries.length > 0
                    ? 'אין רשומות בקטגוריה הזו'
                    : isToday ? 'עוד לא נרשמו פעולות היום' : `אין רשומות מ${formatDisplayDate(selectedDate)}`}
                </p>
              </div>
            ) : (
              <DailyTimeline entries={filtered} onRefresh={onEntrySaved} onEditEntry={onEditEntry} />
            )}
          </div>

          {/* 3 — סיכום יומי */}
          {todayEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-bold px-1" style={{ color: '#7B604C' }}>סיכום יומי</p>
              <DailySummary entries={todayEntries} />
            </div>
          )}
        </div>
      )}

    </div>
  )
}
