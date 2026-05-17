import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-react'
import type { DailyLogEntryWithDetails } from '../../lib/supabase'
import { formatDate } from '../../utils/dateUtils'
import { hebrewDateHeader } from '../../utils/hebrewDate'
import DailyTimeline from '../DailyTimeline'

// Phase 3 / C5: ListView — chronological list of the selected week's
// entries, date-grouped, with filter chips (by entry_type) and a
// newest/oldest sort toggle. Tap an entry to edit (DailyTimeline already
// enforces the "safe types only" rule from C3).

type FilterChip = 'all' | 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'doctor_visit' | 'milestone' | 'note'

// Chip definitions. Feeding stays a single "האכלה" chip (breast/bottle/
// solid lumped, per the approved spec). Tummy uses 🤸 to match the
// Day-view filter strip + TummyTimePage's accent emoji.
const FILTER_CHIPS: { id: FilterChip; emoji: string; label: string }[] = [
  { id: 'all',          emoji: '',    label: 'הכל' },
  { id: 'feeding',      emoji: '🍼',  label: 'האכלה' },
  { id: 'sleep',        emoji: '😴',  label: 'שינה' },
  { id: 'diaper',       emoji: '💩',  label: 'חיתול' },
  { id: 'tummy_time',   emoji: '🤸',  label: 'בטן' },
  { id: 'doctor_visit', emoji: '👨‍⚕️', label: 'רופא' },
  { id: 'milestone',    emoji: '🎯',  label: 'אבן דרך' },
  { id: 'note',         emoji: '📝',  label: 'הערה' },
]

type Props = {
  entries: DailyLogEntryWithDetails[]
  weekStart: Date
  onWeekShift: (newWeekStart: Date) => void
  loading: boolean
  onEntrySaved: () => void
  onEditEntry: (entry: DailyLogEntryWithDetails) => void
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export default function ListView({
  entries,
  weekStart,
  onWeekShift,
  loading,
  onEntrySaved,
  onEditEntry,
}: Props) {
  const [filter, setFilter] = useState<FilterChip>('all')
  // Sort: true = newest-first (descending), false = oldest-first.
  const [sortDesc, setSortDesc] = useState(true)

  // The JournalPage fetch widens the range by 1 day on the left for the
  // Week chart's cross-midnight tails. The List view should only render
  // entries strictly within the visible week, so trim to weekStart..weekEnd.
  const weekDates = useMemo(
    () => new Set(Array.from({ length: 7 }, (_, i) => formatDate(addDays(weekStart, i)))),
    [weekStart],
  )

  const visibleEntries = useMemo(() => {
    const inWeek = entries.filter(e => weekDates.has(e.entry_date))
    const filtered = filter === 'all' ? inWeek : inWeek.filter(e => e.entry_type === filter)
    return [...filtered].sort((a, b) => {
      const aKey = `${a.entry_date}T${a.entry_time}`
      const bKey = `${b.entry_date}T${b.entry_time}`
      return sortDesc ? bKey.localeCompare(aKey) : aKey.localeCompare(bKey)
    })
  }, [entries, weekDates, filter, sortDesc])

  // Group entries by entry_date in already-sorted order.
  const groups = useMemo(() => {
    const out: { date: string; items: DailyLogEntryWithDetails[] }[] = []
    for (const e of visibleEntries) {
      const last = out[out.length - 1]
      if (last && last.date === e.entry_date) last.items.push(e)
      else out.push({ date: e.entry_date, items: [e] })
    }
    return out
  }, [visibleEntries])

  const weekRangeLabel = `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`

  return (
    <div className="space-y-3">
      {/* Week-arrow row — matches WeekView's pattern exactly. */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onWeekShift(addDays(weekStart, -7))}
          className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50 transition-colors"
          aria-label="שבוע קודם"
        >
          <ChevronRight className="w-4 h-4 text-sand-500" />
        </button>
        <span className="text-sm font-semibold text-sand-600">{weekRangeLabel}</span>
        <button
          onClick={() => onWeekShift(addDays(weekStart, 7))}
          className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50 transition-colors"
          aria-label="שבוע הבא"
        >
          <ChevronLeft className="w-4 h-4 text-sand-500" />
        </button>
      </div>

      {/* Filter chips — horizontal-scroll on overflow. Mustard-pill style
          on active matches Day-view's filter strip + the journal tabs. */}
      <div className="bg-[#F5F1EB] rounded-2xl p-1.5 shadow-sm overflow-x-auto scroll-hide">
        <div className="flex gap-1 min-w-fit">
          {FILTER_CHIPS.map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filter === c.id ? 'text-white shadow-sm' : 'text-sand-500 hover:text-sand-700'
              }`}
              style={filter === c.id ? { background: '#E7C78A' } : {}}
            >
              {c.emoji && <span className="text-sm leading-none">{c.emoji}</span>}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sort toggle — small, right-aligned. Single button flips direction. */}
      <div className="flex justify-end">
        <button
          onClick={() => setSortDesc(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-sand-600 bg-white shadow-sm hover:bg-sand-50 transition-colors"
          aria-label="מיון"
        >
          {sortDesc ? (
            <>
              <ArrowDownNarrowWide className="w-3.5 h-3.5" />
              <span>חדש → ישן</span>
            </>
          ) : (
            <>
              <ArrowUpNarrowWide className="w-3.5 h-3.5" />
              <span>ישן → חדש</span>
            </>
          )}
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center space-y-2">
          <div className="text-4xl">📜</div>
          <p className="text-sm text-sand-500">
            {filter === 'all' ? 'אין רשומות בשבוע זה' : 'אין רשומות מסוג זה השבוע'}
          </p>
          <p className="text-xs text-sand-400">השתמשי בחיצים למעלה כדי לעבור לשבועות אחרים</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <div key={g.date} className="space-y-2">
              {/* Date header */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-bold text-sand-700">{hebrewDateHeader(g.date)}</span>
                <span className="text-[10px] text-sand-400">·</span>
                <span className="text-[10px] text-sand-400">
                  {g.items.length === 1 ? 'רשומה אחת' : `${g.items.length} רשומות`}
                </span>
              </div>
              {/* Reuses DailyTimeline so edit/delete + visual style + the
                  "editable types only" rule from C3 stay consistent with
                  Day view's פירוט mode. */}
              <DailyTimeline
                entries={g.items}
                onRefresh={onEntrySaved}
                onEditEntry={onEditEntry}
                hideHeading
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
