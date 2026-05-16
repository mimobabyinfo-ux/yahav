import { useRef } from 'react'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import type { DailyLogEntryWithDetails } from '../../lib/supabase'
import type { Page } from '../../App'
import { formatDate, formatDisplayDate } from '../../utils/dateUtils'
import HorizontalCalendar from '../HorizontalCalendar'
import ActivityTimers from '../ActivityTimers'
import DailySummary from '../DailySummary'
import DailyTimeline from '../DailyTimeline'

// Hebrew weekday labels for the date header (e.g. "יום שישי").
const HE_WEEKDAY = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת']

// Timeline filter — same 5 options that used to live inline in JournalPage.
type TimelineFilter = 'all' | 'feeding' | 'sleep' | 'diaper' | 'tummy_time'
const TIMELINE_FILTERS: { value: TimelineFilter; emoji: string; label: string }[] = [
  { value: 'all',        emoji: '',   label: 'הכל' },
  { value: 'feeding',    emoji: '🍼', label: 'האכלה' },
  { value: 'sleep',      emoji: '😴', label: 'שינה' },
  { value: 'diaper',     emoji: '💩', label: 'חיתול' },
  { value: 'tummy_time', emoji: '🐣', label: 'בטן' },
]

// EntryType + preset payloads passed back up to the page on a quick-add
// tap that should open LogEntryModal instead of navigating.
export type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  selectedDate: string                                  // YYYY-MM-DD
  onDateChange: (date: string) => void
  entries: DailyLogEntryWithDetails[]
  loading: boolean
  filter: TimelineFilter
  onFilterChange: (f: TimelineFilter) => void
  refetchKey: number
  onEntrySaved: () => void
  onModalRequest: (entryType: string, preset?: { feedingType?: 'breast' | 'bottle' | 'solid' }) => void
  onNavigate?: (page: Page) => void
  onEditEntry: (entry: DailyLogEntryWithDetails) => void
}

// ── Date helpers ────────────────────────────────────────────────────────────
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return formatDate(d)
}
function hebrewDateHeader(iso: string): string {
  // "יום שישי · 14 ביולי"
  const d = new Date(iso + 'T00:00:00')
  const weekday = HE_WEEKDAY[d.getDay()]
  const dm = d.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'long' })
  return `${weekday} · ${dm}`
}

export default function DayView({
  selectedDate,
  onDateChange,
  entries,
  loading,
  filter,
  onFilterChange,
  refetchKey,
  onEntrySaved,
  onModalRequest,
  onNavigate,
  onEditEntry,
}: Props) {
  const today = formatDate(new Date())
  const isToday = selectedDate === today
  const isPast = selectedDate < today

  // Hidden <input type="date"> ref — tapping the center label opens the
  // native date picker via .showPicker() (Chromium / Safari iOS support).
  const datePickerRef = useRef<HTMLInputElement>(null)
  function openPicker() {
    const el = datePickerRef.current
    if (!el) return
    // showPicker() is the modern API; .click() is the fallback that works
    // everywhere the input is rendered.
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return } catch { /* fall through */ }
    }
    el.click()
  }

  // ── Swipe-to-navigate (50px deltaX, horizontal-dominant) ────────────
  // RTL convention: swipe LEFT = next day (forward in reading direction);
  // swipe RIGHT = previous day. Matches the existing HorizontalCalendar
  // chevron orientation (right-arrow = previous, left-arrow = next).
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
    if (Math.abs(dx) <= Math.abs(dy)) return // vertical-dominant → ignore
    if (dx < 0) {
      // Swipe left → next day (disabled if at today).
      if (!isToday) onDateChange(shiftDate(selectedDate, 1))
    } else {
      // Swipe right → previous day.
      onDateChange(shiftDate(selectedDate, -1))
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="space-y-4">
      {/* ── New date-nav header (Phase 3 / C3) ──────────────────────────
          ChevronRight = previous, ChevronLeft = next — matches the
          existing HorizontalCalendar's RTL convention. Center label is
          tappable to open the native date picker. */}
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
          <CalendarIcon className="w-4 h-4 text-sand-400" />
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
      <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm">
        <HorizontalCalendar selectedDate={selectedDate} onSelect={onDateChange} />
      </div>

      {/* Quick-add bar. On today: timer-based / dedicated pages; on past
          dates: forceModal routes every tap to LogEntryModal. */}
      <div className="bg-[#F5F1EB] rounded-3xl p-3 shadow-sm">
        <ActivityTimers
          onEntrySaved={onEntrySaved}
          refetchKey={refetchKey}
          onModalRequest={onModalRequest}
          forceModal={isPast}
          onOpenLogPage={onNavigate ? (logType) => {
            if (logType === 'sleep') onNavigate('log-sleep')
            else if (logType === 'tummy_time') onNavigate('log-tummy')
            else if (logType === 'feeding-breast') onNavigate('log-feeding-breast')
            else if (logType === 'feeding-bottle') onNavigate('log-feeding-bottle')
            else if (logType === 'feeding-solid') onNavigate('log-feeding-solid')
            else if (logType === 'diaper') onNavigate('log-diaper')
            else if (logType === 'doctor_visit') onNavigate('log-medical')
            else if (logType === 'milestone') onNavigate('log-milestone')
            else if (logType === 'note') onNavigate('log-note')
          } : undefined}
        />
      </div>

      <DailySummary entries={entries} />

      {/* Timeline filter strip — narrows the timeline to a single category. */}
      <div className="flex bg-[#F5F1EB] rounded-2xl p-1 shadow-sm gap-1">
        {TIMELINE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-semibold transition-all leading-tight ${
              filter === f.value ? 'text-white shadow-sm' : 'text-sand-500'
            }`}
            style={filter === f.value ? { background: '#E7C78A' } : {}}
          >
            {f.emoji && <span className="text-base">{f.emoji}</span>}
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-[#F5F1EB] rounded-3xl p-8 shadow-sm text-center space-y-2">
          <div className="text-4xl">📒</div>
          <p className="text-sm text-sand-500">{isToday ? 'עוד לא נרשמו פעולות היום' : `אין רשומות מ${formatDisplayDate(selectedDate)}`}</p>
        </div>
      ) : (
        <DailyTimeline
          entries={filter === 'all' ? entries : entries.filter(e => e.entry_type === filter)}
          onRefresh={onEntrySaved}
          onEditEntry={onEditEntry}
        />
      )}
    </div>
  )
}
