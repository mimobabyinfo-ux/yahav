import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, BarChart3, LayoutGrid, List, type LucideIcon } from 'lucide-react'
import type { DailyLogEntryWithDetails } from '../../lib/supabase'
import { formatDate, formatDisplayDate } from '../../utils/dateUtils'
import { hebrewDateHeader } from '../../utils/hebrewDate'
import HorizontalCalendar from '../HorizontalCalendar'
import MimoLeaf from '../MimoLeaf'
import DailySummary from '../DailySummary'
import DailyTimeline from '../DailyTimeline'
import DayTimelineChart from './DayTimelineChart'

// Timeline filter — shown only inside the "list" sub-view.
type TimelineFilter = 'all' | 'feeding' | 'sleep' | 'diaper' | 'tummy_time'
const TIMELINE_FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all',        label: 'הכל' },
  { value: 'feeding',    label: 'האכלה' },
  { value: 'sleep',      label: 'שינה' },
  { value: 'diaper',     label: 'חיתול' },
  { value: 'tummy_time', label: 'בטן' },
]

// Phase 3 / C4 UX restructure: Day-view now toggles between 3
// visualization modes (graph / cards / list) so mom isn't fed all of
// them at once. Default 'graph' on every mount — intentionally NOT
// persisted to localStorage (Q from the spec).
type DayViewMode = 'graph' | 'cards' | 'list'
const VIEW_MODES: { id: DayViewMode; icon: LucideIcon; label: string }[] = [
  { id: 'graph', icon: BarChart3,  label: 'ציר זמן' },
  { id: 'cards', icon: LayoutGrid, label: 'סיכום יומי' },
  { id: 'list',  icon: List,       label: 'פירוט' },
]

type Props = {
  selectedDate: string                                  // YYYY-MM-DD
  onDateChange: (date: string) => void
  entries: DailyLogEntryWithDetails[]
  loading: boolean
  filter: TimelineFilter
  onFilterChange: (f: TimelineFilter) => void
  onEntrySaved: () => void
  onEditEntry: (entry: DailyLogEntryWithDetails) => void
}

// ── Date helpers ────────────────────────────────────────────────────────────
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
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
}: Props) {
  const today = formatDate(new Date())
  const isToday = selectedDate === today

  // JournalPage widens fetchEntries by 1 day on the LEFT so the chart can
  // render cross-midnight sleep tails. Everything else on this page wants
  // strictly-today entries.
  const todayEntries = entries.filter(e => e.entry_date === selectedDate)

  // View mode toggle — resets to 'graph' on mount (not persisted).
  const [mode, setMode] = useState<DayViewMode>('graph')

  // Hidden <input type="date"> ref — tapping the center label opens the
  // native date picker via .showPicker() (Chromium / Safari iOS support).
  const datePickerRef = useRef<HTMLInputElement>(null)
  function openPicker() {
    const el = datePickerRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return } catch { /* fall through */ }
    }
    el.click()
  }

  // ── Swipe-to-navigate (50px deltaX, horizontal-dominant) ────────────
  // RTL convention: swipe LEFT = next day; swipe RIGHT = previous day.
  // Matches HorizontalCalendar's chevron orientation.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  function handleTouchStart(e: React.TouchEvent) {
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

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="space-y-4">
      {/* Date-nav header */}
      <div className="flex items-center justify-between gap-2 bg-white rounded-2xl shadow-sm px-2 py-1.5">
        <button
          onClick={() => onDateChange(shiftDate(selectedDate, -1))}
          className="p-2 rounded-xl text-sand-500 hover:bg-sand-50 transition-colors"
          aria-label="יום קודם"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={openPicker}
          className="flex items-center gap-1.5 text-sm font-semibold text-sand-700 hover:text-mustard-600 transition-colors"
        >
          <CalendarIcon className="w-4 h-4 text-sand-600" />
          <span>{isToday ? `היום · ${hebrewDateHeader(selectedDate).split(' · ')[1]}` : hebrewDateHeader(selectedDate)}</span>
        </button>
        <button
          onClick={() => !isToday && onDateChange(shiftDate(selectedDate, 1))}
          disabled={isToday}
          className="p-2 rounded-xl text-sand-500 hover:bg-sand-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="יום הבא"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <input
          ref={datePickerRef}
          type="date"
          value={selectedDate}
          max={today}
          onChange={e => e.target.value && onDateChange(e.target.value)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>

      {/* Horizontal week strip — for jumping ±N days beyond the arrow row. */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-[#F0EAE0]">
        <HorizontalCalendar selectedDate={selectedDate} onSelect={onDateChange} />
      </div>

      {/* ── View toggle (graph / cards / list) ────────────────────────── */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#F0EAE0] gap-1">
        {VIEW_MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all ${
              mode === m.id ? 'shadow-sm' : 'text-sand-500'
            }`}
            style={mode === m.id ? { background: '#E7C78A', color: '#4A3A28' } : {}}
          >
            <m.icon className="w-4 h-4" strokeWidth={2.2} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      )}

      {/* ── Mode-specific content — keyed so tab switches animate ────── */}
      <div key={mode} className="animate-rise space-y-4">
      {!loading && mode === 'graph' && (
        <DayTimelineChart entries={entries} selectedDate={selectedDate} />
      )}

      {!loading && mode === 'cards' && (
        <DailySummary entries={todayEntries} />
      )}

      {!loading && mode === 'list' && (
        <>
          {/* Filter strip — narrows the timeline to a single category. */}
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

          {todayEntries.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#F0EAE0] text-center space-y-2">
              <MimoLeaf variant="sand-2" size={64} rotate={-8} className="mx-auto" />
              <p className="text-sm text-sand-500">{isToday ? 'עוד לא נרשמו פעולות היום' : `אין רשומות מ${formatDisplayDate(selectedDate)}`}</p>
            </div>
          ) : (
            <DailyTimeline
              entries={filter === 'all' ? todayEntries : todayEntries.filter(e => e.entry_type === filter)}
              onRefresh={onEntrySaved}
              onEditEntry={onEditEntry}
            />
          )}
        </>
      )}
      </div>
    </div>
  )
}
