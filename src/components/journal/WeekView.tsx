import { useMemo, useRef, useState } from 'react'
import { Baby, Moon, Droplets, Shapes, type LucideIcon } from 'lucide-react'
import type { DailyLogEntryWithDetails, SleepDetail } from '../../lib/supabase'
import { formatDate, formatDuration } from '../../utils/dateUtils'
import { hebrewDateHeader } from '../../utils/hebrewDate'
import DailyTimeline from '../DailyTimeline'
import MimoLeaf from '../MimoLeaf'
import WeekTimelineChart from './WeekTimelineChart'
import JournalHeader from './JournalHeader'
import TimelineLegend from './TimelineLegend'
import { hebrewWeekRange } from '../../utils/hebrewWeekRange'

// The week screen.
//
// Brenda 17.8.26: "the list tab — fold it into the week, exactly the way
// you did the day. Show the timeline, the detail and the summary of that
// week. In the end: day is the timeline, detail and summary of that day.
// Week is the same. And summary is averages and trends over time."
//
// So there is no list view any more. It was the week's entries in a list,
// and the week was the same entries as a chart, and they lived in separate
// tabs — you had to remember which tab held the thing you wanted. A week
// now reads top to bottom in the same three beats as a day: what happened,
// when exactly, how much in total. The only difference between the two
// screens is the width of the window.

type Props = {
  entries: DailyLogEntryWithDetails[]
  weekStart: Date
  loading: boolean
  onWeekShift: (newWeekStart: Date) => void
  onDayClick: (date: string) => void
  onEntrySaved: () => void
  onEditEntry: (entry: DailyLogEntryWithDetails) => void
  onOpenViews: () => void
}

type TimelineFilter = 'all' | 'feeding' | 'sleep' | 'diaper' | 'tummy_time'
const TIMELINE_FILTERS: { value: TimelineFilter; label: string }[] = [
  { value: 'all',        label: 'הכל' },
  { value: 'feeding',    label: 'האכלה' },
  { value: 'sleep',      label: 'שינה' },
  { value: 'diaper',     label: 'חיתול' },
  { value: 'tummy_time', label: 'בטן' },
]

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

function computeHighlights(entries: DailyLogEntryWithDetails[], weekDates: Set<string>): Highlights {
  const feedingsByDate = new Map<string, number>()
  let longest: Highlights['longestSleep'] = null
  let tummy = 0
  let diapers = 0

  for (const e of entries) {
    if (!weekDates.has(e.entry_date)) continue
    if (e.entry_type === 'sleep') {
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      const mins = sd?.duration_minutes ?? 0
      if (mins > 0 && (!longest || mins > longest.mins)) longest = { mins, date: e.entry_date }
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

export default function WeekView({
  entries,
  weekStart,
  loading,
  onWeekShift,
  onDayClick,
  onEntrySaved,
  onEditEntry,
  onOpenViews,
}: Props) {
  const [filter, setFilter] = useState<TimelineFilter>('all')

  const weekDates = useMemo(
    () => new Set(Array.from({ length: 7 }, (_, i) => formatDate(addDays(weekStart, i)))),
    [weekStart],
  )

  // JournalPage widens the fetch by a day on the left so the chart can draw
  // cross-midnight sleep tails. Everything below the chart wants strictly
  // this week, newest first, the way the day screen reads.
  const groups = useMemo(() => {
    const inWeek = entries.filter(e => weekDates.has(e.entry_date))
    const filtered = filter === 'all' ? inWeek : inWeek.filter(e => e.entry_type === filter)
    const sorted = [...filtered].sort((a, b) =>
      `${b.entry_date}T${b.entry_time}`.localeCompare(`${a.entry_date}T${a.entry_time}`))
    const out: { date: string; items: DailyLogEntryWithDetails[] }[] = []
    for (const e of sorted) {
      const last = out[out.length - 1]
      if (last && last.date === e.entry_date) last.items.push(e)
      else out.push({ date: e.entry_date, items: [e] })
    }
    return out
  }, [entries, weekDates, filter])

  const anyThisWeek = useMemo(
    () => entries.some(e => weekDates.has(e.entry_date)),
    [entries, weekDates],
  )

  const highlights = computeHighlights(entries, weekDates)
  const weekLabel = hebrewWeekRange(weekStart)

  // Swipe between weeks, same gesture and thresholds as the day screen.
  // RTL: swipe left = next week, swipe right = previous.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) { touchStartRef.current = null; return }
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return
    onWeekShift(addDays(weekStart, dx < 0 ? 7 : -7))
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="space-y-4">
      <JournalHeader
        onPrev={() => onWeekShift(addDays(weekStart, -7))}
        onNext={() => onWeekShift(addDays(weekStart, 7))}
        prevLabel="שבוע קודם"
        nextLabel="שבוע הבא"
        onOpenViews={onOpenViews}
      >
        <span className="font-semibold" style={{ fontSize: 17, color: '#443327' }}>{weekLabel}</span>
      </JournalHeader>

      {/* 1 — ציר זמן */}
      <div className="space-y-2">
        <WeekTimelineChart entries={entries} weekStart={weekStart} onDayClick={onDayClick} />
        <TimelineLegend className="px-1" />
      </div>

      {/* 2 — פירוט */}
      <div className="space-y-2">
        <p className="text-[13px] font-bold px-1" style={{ color: '#7B604C' }}>פירוט</p>
        <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#F0EAE0] gap-1">
          {TIMELINE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                filter === f.value ? 'shadow-sm' : 'text-sand-500'
              }`}
              style={filter === f.value ? { background: '#E7C78A', color: '#4A3A28' } : {}}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow-sm border border-[#F0EAE0] p-8 text-center">
            <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-[#F0EAE0] text-center space-y-2">
            <MimoLeaf variant="sand-2" size={64} rotate={-8} className="mx-auto" />
            <p className="text-sm text-sand-500">
              {anyThisWeek ? 'אין רשומות בקטגוריה הזו השבוע' : 'אין רשומות בשבוע הזה'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(g => (
              <div key={g.date} className="space-y-2">
                <button
                  onClick={() => onDayClick(g.date)}
                  className="flex items-center gap-2 pt-1 text-right"
                >
                  <span className="text-xs font-bold text-sand-700">{hebrewDateHeader(g.date)}</span>
                  <span className="text-[13px] text-sand-600">·</span>
                  <span className="text-[13px] text-sand-600">
                    {g.items.length === 1 ? 'רשומה אחת' : `${g.items.length} רשומות`}
                  </span>
                </button>
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

      {/* 3 — סיכום שבועי */}
      {anyThisWeek && (
        <div className="space-y-2">
          <p className="text-[13px] font-bold px-1" style={{ color: '#7B604C' }}>סיכום שבועי</p>
          <div className="grid grid-cols-2 gap-2">
            <HighlightCard
              icon={Moon}
              headline={highlights.longestSleep ? formatDuration(highlights.longestSleep.mins) : '—'}
              sub={highlights.longestSleep ? `יום ${hebrewWeekday(highlights.longestSleep.date)}` : 'אין רישומי שינה השבוע'}
              label="שינה ארוכה ביותר"
            />
            <HighlightCard
              icon={Baby}
              headline={highlights.mostFeedings ? `${highlights.mostFeedings.count}` : '—'}
              sub={highlights.mostFeedings ? `יום ${hebrewWeekday(highlights.mostFeedings.date)}` : 'אין רישומי האכלה השבוע'}
              label="הכי הרבה האכלות"
            />
            <HighlightCard
              icon={Shapes}
              headline={highlights.totalTummyMins > 0 ? formatDuration(highlights.totalTummyMins) : '—'}
              sub="סה״כ השבוע"
              label="זמן בטן"
            />
            <HighlightCard
              icon={Droplets}
              headline={highlights.totalDiapers > 0 ? `${highlights.totalDiapers}` : '—'}
              sub="סה״כ השבוע"
              label="חיתולים"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function HighlightCard({ icon: Icon, headline, sub, label }: {
  icon: LucideIcon
  headline: string
  sub: string
  label: string
}) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-[#F0EAE0] flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-full bg-[#F4EDE1] flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-sand-600" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-sand-500 truncate">{label}</p>
        <p className="text-sm font-bold text-sand-800 mt-0.5">{headline}</p>
        <p className="text-[13px] text-sand-600 truncate">{sub}</p>
      </div>
    </div>
  )
}
