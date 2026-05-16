import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { DailyLogEntryWithDetails, SleepDetail } from '../../lib/supabase'
import { formatDate, formatDuration, entryTypeLabel } from '../../utils/dateUtils'
import { ENTRY_COLORS } from '../DailyTimeline'
import WeekTimelineChart from './WeekTimelineChart'

// Phase 3 / C4: full rewrite of WeekView.
// Replaces the colored-dots grid with a true Gantt-style chart (in
// WeekTimelineChart) plus a Highlights row (4 stats) and a tighter
// legend below. Week-nav arrows absorbed from JournalPage per Q8.

type Props = {
  entries: DailyLogEntryWithDetails[]
  weekStart: Date
  onWeekShift: (newWeekStart: Date) => void
  onDayClick: (date: string) => void
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function tummyMinsFromNotes(notes: string | null): number {
  if (!notes) return 0
  const m = notes.match(/^משך:\s*(\d+(?:\.\d+)?)\s*דקות/)
  return m ? parseFloat(m[1]) : 0
}

// Hebrew weekday name for a date string (YYYY-MM-DD), using the date
// itself (not parsed-as-UTC which would shift) — noon anchor avoids
// DST drift.
function hebrewWeekday(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return HEBREW_WEEKDAYS[d.getDay()]
}

type Highlights = {
  longestSleep: { mins: number; date: string } | null
  mostFeedings: { count: number; date: string } | null
  totalTummyMins: number
  totalDiapers: number
}

function computeHighlights(entries: DailyLogEntryWithDetails[], weekDates: string[]): Highlights {
  const visible = new Set(weekDates)
  // Group by date for "most feedings per day".
  const feedingsByDate = new Map<string, number>()
  let longest: Highlights['longestSleep'] = null
  let tummy = 0
  let diapers = 0

  for (const e of entries) {
    if (!visible.has(e.entry_date)) continue
    if (e.entry_type === 'sleep') {
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      const mins = sd?.duration_minutes ?? 0
      if (mins > 0 && (!longest || mins > longest.mins)) {
        longest = { mins, date: e.entry_date }
      }
    } else if (e.entry_type === 'feeding') {
      feedingsByDate.set(e.entry_date, (feedingsByDate.get(e.entry_date) ?? 0) + 1)
    } else if (e.entry_type === 'tummy_time') {
      tummy += tummyMinsFromNotes(e.notes)
    } else if (e.entry_type === 'diaper') {
      diapers++
    }
  }

  let mostFeedings: Highlights['mostFeedings'] = null
  for (const [date, count] of feedingsByDate) {
    if (!mostFeedings || count > mostFeedings.count) mostFeedings = { count, date }
  }

  return { longestSleep: longest, mostFeedings, totalTummyMins: tummy, totalDiapers: diapers }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function WeekView({ entries, weekStart, onWeekShift, onDayClick }: Props) {
  const weekDates = Array.from({ length: 7 }, (_, i) => formatDate(addDays(weekStart, i)))
  const highlights = computeHighlights(entries, weekDates)
  const weekLabel = `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`

  return (
    <div className="space-y-3">
      {/* Week arrow row (absorbed from JournalPage per Q8). */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onWeekShift(addDays(weekStart, -7))}
          className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50 transition-colors"
          aria-label="שבוע קודם"
        >
          <ChevronRight className="w-4 h-4 text-sand-500" />
        </button>
        <span className="text-sm font-semibold text-sand-600">{weekLabel}</span>
        <button
          onClick={() => onWeekShift(addDays(weekStart, 7))}
          className="p-2 rounded-xl bg-white shadow-sm hover:bg-sand-50 transition-colors"
          aria-label="שבוע הבא"
        >
          <ChevronLeft className="w-4 h-4 text-sand-500" />
        </button>
      </div>

      {/* Chart */}
      <WeekTimelineChart entries={entries} weekStart={weekStart} onDayClick={onDayClick} />

      {/* Highlights — 2×2 grid, only renders cards that have a value. */}
      <div className="grid grid-cols-2 gap-2">
        <HighlightCard
          emoji="😴"
          headline={
            highlights.longestSleep
              ? formatDuration(highlights.longestSleep.mins)
              : '—'
          }
          sub={
            highlights.longestSleep
              ? `יום ${hebrewWeekday(highlights.longestSleep.date)}`
              : 'אין רישומי שינה השבוע'
          }
          label="שינה ארוכה ביותר"
        />
        <HighlightCard
          emoji="🤱"
          headline={
            highlights.mostFeedings
              ? `${highlights.mostFeedings.count}`
              : '—'
          }
          sub={
            highlights.mostFeedings
              ? `יום ${hebrewWeekday(highlights.mostFeedings.date)}`
              : 'אין רישומי האכלה השבוע'
          }
          label="הכי הרבה האכלות"
        />
        <HighlightCard
          emoji="🤸"
          headline={highlights.totalTummyMins > 0 ? formatDuration(highlights.totalTummyMins) : '—'}
          sub="סה״כ השבוע"
          label="זמן בטן"
        />
        <HighlightCard
          emoji="💩"
          headline={highlights.totalDiapers > 0 ? `${highlights.totalDiapers}` : '—'}
          sub="סה״כ השבוע"
          label="חיתולים"
        />
      </div>

      {/* Legend — restricted to the 4 chart categories per Q3/Q4 (single
          color per category). Other types render in the chart as instants
          but aren't worth a legend chip. */}
      <div className="bg-[#F5F1EB] rounded-2xl p-3 shadow-sm">
        <p className="text-[10px] font-semibold text-sand-500 mb-1.5">מקרא</p>
        <div className="flex flex-wrap gap-3">
          {(['sleep', 'feeding', 'tummy_time', 'diaper'] as const).map(type => {
            const col = ENTRY_COLORS[type]
            if (!col) return null
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: col.dot }} />
                <span className="text-xs text-sand-500">{entryTypeLabel(type)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function HighlightCard({ emoji, headline, sub, label }: {
  emoji: string
  headline: string
  sub: string
  label: string
}) {
  return (
    <div className="bg-[#F5F1EB] rounded-2xl p-3 shadow-sm flex items-center gap-2.5">
      <span className="text-2xl flex-shrink-0">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold text-sand-500 truncate">{label}</p>
        <p className="text-sm font-bold text-sand-800 mt-0.5">{headline}</p>
        <p className="text-[10px] text-sand-400 truncate">{sub}</p>
      </div>
    </div>
  )
}
