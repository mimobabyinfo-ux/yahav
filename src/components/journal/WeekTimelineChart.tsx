import type { DailyLogEntryWithDetails, FeedingDetail, SleepDetail } from '../../lib/supabase'
import { formatDate } from '../../utils/dateUtils'
import { ENTRY_COLORS } from '../DailyTimeline'

// 7-day Gantt-style chart: one column per day, time-of-day on the Y axis
// (00:00 top → 24:00 bottom). Duration events render as solid blocks
// positioned + sized by entry_time + duration_minutes. Instant events
// (diaper / milestone / doctor / note) render as 4px-tall horizontal
// stripes at entry_time. Cross-midnight sleeps that began on the day
// BEFORE a visible column get rendered on the visible column with start
// clamped to 00:00 — matches the spec's Q7 decision and the same
// semantics already used by Today's Journal panel on the dashboard.
//
// Why not recharts: recharts is designed for series-of-data-points
// charts. Time-positioned variable-height segments stacked in 7 lanes
// is much cleaner with absolute-positioned divs against the existing
// 24-hour color-bar math from DailySummary.

const CHART_HEIGHT_PX = 280
const MIN_DURATION_BLOCK_PX = 6   // minimum visual height for duration blocks
const INSTANT_HEIGHT_PX = 4       // fixed pixel height for instant events
const MINS_PER_DAY = 1440

// Y axis gridline hours + their labels (LTR-formatted in the label span).
const GRID_HOURS = [6, 12, 18]

// Hebrew weekday letters, Sunday-start (matches Q9).
const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

type Props = {
  /** All entries whose entry_date is in [weekStart-1, weekStart+6]. The
   *  parent widens by 1 day so cross-midnight sleeps that started before
   *  weekStart still get drawn on Sunday's column. */
  entries: DailyLogEntryWithDetails[]
  weekStart: Date
  onDayClick: (date: string) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

// PostgREST 1:1 embed unwrap. Same firstOf pattern used elsewhere.
function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function isoDateAtNoon(iso: string): Date {
  // Noon anchor avoids DST drift when stepping ±1 day.
  return new Date(iso + 'T12:00:00')
}

// Parse tummy_time duration out of the "משך: N דקות" notes prefix.
// Returns minutes or null if the prefix is missing/malformed.
function tummyDurationFromNotes(notes: string | null): number | null {
  if (!notes) return null
  const m = notes.match(/^משך:\s*(\d+(?:\.\d+)?)\s*דקות/)
  return m ? parseFloat(m[1]) : null
}

// Derive a chart segment from a log entry. Returns null for entries we
// can't position (missing entry_time, unknown type).
type Segment = {
  topPct: number       // 0..100, % from top of column
  heightPct: number    // 0..100, % of column height
  minHeightPx?: number // floor (px), overrides heightPct when smaller
  color: string
  isInstant: boolean
  bordered: boolean    // feeding/tummy get a subtle border to distinguish from sleep
  label: string        // for tooltip
}

function segmentForEntry(e: DailyLogEntryWithDetails, startMin: number, durMin: number, instantOverride?: boolean): Segment | null {
  const isInstant = instantOverride ?? (durMin <= 0)
  const colors = ENTRY_COLORS[e.entry_type] ?? ENTRY_COLORS.note

  // Clamp to day bounds. If a duration overflows past midnight, the chart
  // caller renders the post-midnight portion separately on the next day's
  // column (see render loop below).
  const effectiveDur = Math.max(0, Math.min(durMin, MINS_PER_DAY - startMin))
  const topPct = (startMin / MINS_PER_DAY) * 100
  const heightPct = (effectiveDur / MINS_PER_DAY) * 100

  // Feeding + tummy get a subtle inner border so they're visually
  // distinct from sleep without changing color hue.
  const bordered = e.entry_type === 'feeding' || e.entry_type === 'tummy_time'

  return {
    topPct,
    heightPct,
    minHeightPx: isInstant ? INSTANT_HEIGHT_PX : MIN_DURATION_BLOCK_PX,
    color: colors.dot,
    isInstant,
    bordered,
    label: e.entry_type,
  }
}

// Build per-column segments. Each entry contributes:
//  - One "primary" segment on its own entry_date column (if visible)
//  - For sleeps that cross midnight, a "tail" segment on the next day's
//    column starting at 00:00 (if next day is visible)
function buildSegmentsByDate(entries: DailyLogEntryWithDetails[], visibleDates: Set<string>): Record<string, Segment[]> {
  const out: Record<string, Segment[]> = {}
  for (const date of visibleDates) out[date] = []

  for (const e of entries) {
    if (!e.entry_time) continue
    const startMin = timeToMinutes(e.entry_time.slice(0, 5))
    if (startMin == null) continue

    // Compute duration per entry type.
    let durMin = 0
    let isInstant = false

    if (e.entry_type === 'sleep') {
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      durMin = sd?.duration_minutes ?? 0
      if (durMin <= 0) isInstant = true
    } else if (e.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      // Prefer per-side seconds (Phase 2). Fall back to duration_minutes.
      const perSideSec = (fd?.left_duration_seconds ?? 0) + (fd?.right_duration_seconds ?? 0)
      durMin = perSideSec > 0 ? perSideSec / 60 : (fd?.duration_minutes ?? 0)
      if (durMin <= 0) isInstant = true
    } else if (e.entry_type === 'tummy_time') {
      durMin = tummyDurationFromNotes(e.notes) ?? 0
      if (durMin <= 0) isInstant = true
    } else {
      // diaper / milestone / doctor_visit / note / pumping → instant
      isInstant = true
    }

    // Primary segment on entry_date column.
    if (visibleDates.has(e.entry_date)) {
      const seg = segmentForEntry(e, startMin, isInstant ? 0 : durMin, isInstant)
      if (seg) out[e.entry_date].push(seg)
    }

    // Cross-midnight tail (sleeps only). Don't tail-render instants or
    // sub-minute durations.
    if (!isInstant && e.entry_type === 'sleep' && durMin > 0) {
      const endMin = startMin + durMin
      if (endMin > MINS_PER_DAY) {
        const nextDate = formatDate(addDays(isoDateAtNoon(e.entry_date), 1))
        if (visibleDates.has(nextDate)) {
          const tailDur = endMin - MINS_PER_DAY
          out[nextDate].push({
            topPct: 0,
            heightPct: Math.min((tailDur / MINS_PER_DAY) * 100, 100),
            minHeightPx: MIN_DURATION_BLOCK_PX,
            color: (ENTRY_COLORS.sleep ?? ENTRY_COLORS.note).dot,
            isInstant: false,
            bordered: false,
            label: 'sleep (tail)',
          })
        }
      }
    }
  }

  // Z-order: long duration segments first (background), instants on top
  // (foreground). Stable sort within each layer keeps DOM stable across
  // re-renders.
  for (const date of visibleDates) {
    out[date].sort((a, b) => {
      if (a.isInstant !== b.isInstant) return a.isInstant ? 1 : -1
      return b.heightPct - a.heightPct
    })
  }

  return out
}

// Current minute-of-day for the "now" line on today's column.
function currentMinuteOfDay(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

// ── Component ──────────────────────────────────────────────────────────────

export default function WeekTimelineChart({ entries, weekStart, onDayClick }: Props) {
  const todayIso = formatDate(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const visibleDates = new Set(days.map(d => formatDate(d)))
  const segmentsByDate = buildSegmentsByDate(entries, visibleDates)
  const nowMin = currentMinuteOfDay()
  // Render order: Sunday on the RIGHT, Saturday on the LEFT (Hebrew RTL —
  // time flows right-to-left through the week). Reverse a render-only copy
  // so segment building (which keyed off the chronological order) stays
  // unaffected.
  const daysRtl = [...days].reverse()

  return (
    <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
      {/* Day headers — letter + date, tappable to day view. Rendered in
          RTL order: Sunday on the right, Saturday on the left. */}
      <div className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] border-b border-sand-100">
        <div /> {/* spacer aligned with time-axis column */}
        {daysRtl.map(d => {
          const ds = formatDate(d)
          const isToday = ds === todayIso
          return (
            <button
              key={ds}
              onClick={() => onDayClick(ds)}
              className="flex flex-col items-center py-2 hover:bg-mustard-50 transition-colors"
            >
              {/* DAY_LABELS keyed by getDay() so the letter is correct
                  regardless of render order. */}
              <span className="text-[10px] text-sand-400">{DAY_LABELS[d.getDay()]}</span>
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

      {/* Chart body — key on weekStart so the animate-fade-in fires on
          every week navigation. */}
      <div
        key={weekStart.toISOString()}
        className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] animate-fade-in"
        style={{ height: CHART_HEIGHT_PX }}
      >
        {/* Time axis — 6/12/18 labels in LTR so digits read naturally */}
        <div className="relative border-l border-sand-100" dir="ltr">
          {GRID_HOURS.map(h => (
            <span
              key={h}
              className="absolute text-[9px] text-sand-300 right-1"
              style={{ top: `calc(${(h / 24) * 100}% - 5px)` }}
            >
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {/* 7 day columns — RTL render order matches the header strip. */}
        {daysRtl.map(d => {
          const ds = formatDate(d)
          const isToday = ds === todayIso
          const segs = segmentsByDate[ds] ?? []

          return (
            <button
              key={ds}
              onClick={() => onDayClick(ds)}
              className="relative border-l border-sand-100/60 hover:bg-mustard-50/40 transition-colors"
              style={isToday ? { background: 'rgba(231, 199, 138, 0.07)' } : {}}
              aria-label={`Open day ${ds}`}
            >
              {/* Faint hour gridlines */}
              {GRID_HOURS.map(h => (
                <div
                  key={h}
                  className="absolute left-0 right-0 h-px bg-sand-200/40 pointer-events-none"
                  style={{ top: `${(h / 24) * 100}%` }}
                />
              ))}

              {/* Today's "now" line — mustard, 1.5px, slightly translucent */}
              {isToday && (
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    top: `${(nowMin / MINS_PER_DAY) * 100}%`,
                    height: 1.5,
                    background: '#E7C78A',
                    opacity: 0.85,
                  }}
                />
              )}

              {/* Segments */}
              {segs.map((seg, i) => (
                <div
                  key={i}
                  className="absolute left-0.5 right-0.5 pointer-events-none"
                  style={{
                    top: `${seg.topPct}%`,
                    height: seg.isInstant
                      ? INSTANT_HEIGHT_PX
                      : `max(${seg.heightPct}%, ${seg.minHeightPx ?? MIN_DURATION_BLOCK_PX}px)`,
                    background: seg.color,
                    opacity: seg.isInstant ? 0.85 : 0.9,
                    borderRadius: seg.isInstant ? 1 : 4,
                    boxShadow: seg.bordered ? `inset 0 0 0 1px rgba(255,255,255,0.55)` : undefined,
                  }}
                  title={seg.label}
                />
              ))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
