import type { DailyLogEntryWithDetails, FeedingDetail, SleepDetail } from '../../lib/supabase'
import { formatDate, formatDuration } from '../../utils/dateUtils'
import { sleepTypeFromStartTime } from '../../utils/sleepTypeFromTime'
import { ENTRY_COLORS } from '../DailyTimeline'

// Phase 3 / C4 (Day-view addition): single-column Gantt timeline for the
// selected day. Mirrors WeekTimelineChart's geometry — 0:00 top, 24:00
// bottom, time-positioned segments — but bigger (400px tall) with text
// labels inside large duration blocks, plus a muted gray "now" line that
// appears on EVERY day (not just today). The cross-midnight rule matches
// the rest of the journal: a sleep that started yesterday but ended today
// renders on today's column starting at 00:00.

const CHART_HEIGHT_PX = 400
const MIN_DURATION_BLOCK_PX = 6
const INSTANT_HEIGHT_PX = 4
const MINS_PER_DAY = 1440
const TEXT_LABEL_THRESHOLD_PX = 28   // only render text inside a block this tall or taller
const GRID_HOURS = [0, 3, 6, 9, 12, 15, 18, 21]  // every 3 hours

type Props = {
  /** Entries with entry_date in [selectedDate-1, selectedDate]. The
   *  parent widens by 1 day so cross-midnight sleeps that started
   *  before today still appear. */
  entries: DailyLogEntryWithDetails[]
  selectedDate: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function tummyDurationFromNotes(notes: string | null): number | null {
  if (!notes) return null
  const m = notes.match(/^משך:\s*(\d+(?:\.\d+)?)\s*דקות/)
  return m ? parseFloat(m[1]) : null
}

type SleepKind = 'nap' | 'night'

// Resolve nap vs night for a sleep entry. Prefers the saved sleep_type;
// falls back to the silent start-time rule for legacy NULL rows.
function resolveSleepKind(e: DailyLogEntryWithDetails, sd: SleepDetail | null): SleepKind {
  if (sd?.sleep_type === 'nap' || sd?.sleep_type === 'night') return sd.sleep_type
  if (e.entry_time) {
    const dt = new Date(`${e.entry_date}T${e.entry_time.slice(0, 5)}:00`)
    return sleepTypeFromStartTime(dt)
  }
  return 'nap'
}

type Segment = {
  topPct: number
  heightPct: number
  minHeightPx: number
  color: string
  isInstant: boolean
  bordered: boolean
  // For text labels inside large blocks
  primaryLabel: string | null
  secondaryLabel: string | null
}

function buildSegmentsForDay(entries: DailyLogEntryWithDetails[], day: string): Segment[] {
  const out: Segment[] = []

  for (const e of entries) {
    if (!e.entry_time) continue
    const startMin = timeToMinutes(e.entry_time.slice(0, 5))
    if (startMin == null) continue

    // Compute duration + flags.
    let durMin = 0
    let isInstant = false
    let primaryLabel: string | null = null

    if (e.entry_type === 'sleep') {
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      durMin = sd?.duration_minutes ?? 0
      if (durMin <= 0) {
        isInstant = true
      } else {
        const kind = resolveSleepKind(e, sd)
        primaryLabel = kind === 'night' ? 'שנת לילה' : 'שנת יום'
      }
    } else if (e.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      const perSideSec = (fd?.left_duration_seconds ?? 0) + (fd?.right_duration_seconds ?? 0)
      durMin = perSideSec > 0 ? perSideSec / 60 : (fd?.duration_minutes ?? 0)
      if (durMin <= 0) {
        isInstant = true
      } else if (fd?.feeding_type === 'breast') primaryLabel = 'הנקה'
      else if (fd?.feeding_type === 'bottle')  primaryLabel = 'בקבוק'
      else if (fd?.feeding_type === 'solid')   primaryLabel = 'מוצק'
      else primaryLabel = 'האכלה'
    } else if (e.entry_type === 'tummy_time') {
      durMin = tummyDurationFromNotes(e.notes) ?? 0
      if (durMin <= 0) isInstant = true
      else primaryLabel = 'זמן בטן'
    } else {
      isInstant = true
    }

    const colors = ENTRY_COLORS[e.entry_type] ?? ENTRY_COLORS.note
    const bordered = e.entry_type === 'feeding' || e.entry_type === 'tummy_time'
    const secondary = !isInstant && durMin > 0 ? formatDuration(durMin) : null

    if (e.entry_date === day) {
      // Primary segment on selected day. If it overflows past midnight,
      // the height calc clamps to 24:00 (no tail rendered here — tomorrow's
      // column would carry it on its own day view).
      const effectiveDur = isInstant ? 0 : Math.max(0, Math.min(durMin, MINS_PER_DAY - startMin))
      out.push({
        topPct: (startMin / MINS_PER_DAY) * 100,
        heightPct: (effectiveDur / MINS_PER_DAY) * 100,
        minHeightPx: isInstant ? INSTANT_HEIGHT_PX : MIN_DURATION_BLOCK_PX,
        color: colors.dot,
        isInstant,
        bordered,
        primaryLabel,
        secondaryLabel: secondary,
      })
    } else if (e.entry_type === 'sleep' && !isInstant && durMin > 0) {
      // Cross-midnight tail from a previous day. Only sleeps tail.
      const startEpoch = new Date(`${e.entry_date}T${e.entry_time.slice(0, 5)}:00`).getTime()
      const endEpoch = startEpoch + durMin * 60000
      const dayStartEpoch = new Date(`${day}T00:00:00`).getTime()
      const dayEndEpoch = dayStartEpoch + MINS_PER_DAY * 60000
      if (endEpoch > dayStartEpoch && startEpoch < dayEndEpoch) {
        const tailMin = Math.min(endEpoch, dayEndEpoch) - dayStartEpoch
        const tailDur = tailMin / 60000
        out.push({
          topPct: 0,
          heightPct: Math.min((tailDur / MINS_PER_DAY) * 100, 100),
          minHeightPx: MIN_DURATION_BLOCK_PX,
          color: colors.dot,
          isInstant: false,
          bordered: false,
          primaryLabel,
          secondaryLabel: secondary,  // shows the FULL sleep duration; mom understands "this is a 9h sleep, you see 6h of it here"
        })
      }
    }
    // Other day entries from neighbors don't render in the day view.
  }

  // Z-order: long blocks first (background), instants on top.
  out.sort((a, b) => {
    if (a.isInstant !== b.isInstant) return a.isInstant ? 1 : -1
    return b.heightPct - a.heightPct
  })

  return out
}

function currentMinuteOfDay(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function pad2(n: number): string { return n.toString().padStart(2, '0') }

// ── Component ──────────────────────────────────────────────────────────────

export default function DayTimelineChart({ entries, selectedDate }: Props) {
  const segs = buildSegmentsForDay(entries, selectedDate)

  const nowMin = currentMinuteOfDay()
  const nowLabel = `${pad2(Math.floor(nowMin / 60))}:${pad2(nowMin % 60)}`
  // Tomorrow guard: if the user is looking at a FUTURE date, the now-line
  // doesn't belong. Hide it. (Past days = show now-line at current hour as
  // a comparison aid, per spec.)
  const today = formatDate(new Date())
  const showNowLine = selectedDate <= today

  return (
    <div className="bg-[#F5F1EB] rounded-3xl shadow-sm overflow-hidden">
      <div
        key={selectedDate}
        className="grid grid-cols-[28px_1fr] animate-fade-in"
        style={{ height: CHART_HEIGHT_PX }}
      >
        {/* Time rail — 8 hour labels every 3h, LTR-formatted. */}
        <div className="relative border-l border-sand-100" dir="ltr">
          {GRID_HOURS.map(h => {
            if (h === 0) return null  // skip 00:00 — clips the chart edge
            return (
              <span
                key={h}
                className="absolute text-[10px] text-sand-400 right-1"
                style={{ top: `calc(${(h / 24) * 100}% - 6px)` }}
              >
                {pad2(h)}:00
              </span>
            )
          })}
        </div>

        {/* The single day column */}
        <div className="relative">
          {/* Faint hour gridlines */}
          {GRID_HOURS.map(h => (
            <div
              key={h}
              className="absolute left-0 right-0 h-px bg-sand-200/40 pointer-events-none"
              style={{ top: `${(h / 24) * 100}%` }}
            />
          ))}

          {/* "Now" line — muted slate, full-width across the column.
              Visible on today + past days (a comparison aid: "what was
              happening at this hour on past days?"). Hidden on future days. */}
          {showNowLine && (
            <>
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{
                  top: `${(nowMin / MINS_PER_DAY) * 100}%`,
                  height: 1.5,
                  background: '#64748B',
                  opacity: 0.55,
                }}
              />
              <div
                className="absolute pointer-events-none"
                style={{
                  top: `calc(${(nowMin / MINS_PER_DAY) * 100}% - 8px)`,
                  left: 4,
                }}
              >
                <span className="inline-block text-[10px] font-bold text-sand-600 bg-white/85 px-1.5 py-0.5 rounded">
                  {nowLabel}
                </span>
              </div>
            </>
          )}

          {/* Segments */}
          {segs.map((seg, i) => {
            const heightStyle = seg.isInstant
              ? `${INSTANT_HEIGHT_PX}px`
              : `max(${seg.heightPct}%, ${seg.minHeightPx}px)`
            // Decide if there's room for the in-block text label.
            const blockPx = seg.isInstant
              ? INSTANT_HEIGHT_PX
              : Math.max((seg.heightPct / 100) * CHART_HEIGHT_PX, seg.minHeightPx)
            const showText = !seg.isInstant && blockPx >= TEXT_LABEL_THRESHOLD_PX && (seg.primaryLabel || seg.secondaryLabel)

            return (
              <div
                key={i}
                className="absolute left-1.5 right-1.5 overflow-hidden"
                style={{
                  top: `${seg.topPct}%`,
                  height: heightStyle,
                  background: seg.color,
                  opacity: seg.isInstant ? 0.85 : 0.92,
                  borderRadius: seg.isInstant ? 2 : 6,
                  boxShadow: seg.bordered ? 'inset 0 0 0 1px rgba(255,255,255,0.55)' : undefined,
                }}
              >
                {showText && (
                  <div className="flex items-start justify-between px-2.5 py-1.5 text-white">
                    {seg.primaryLabel && (
                      <span className="text-xs font-bold whitespace-nowrap">{seg.primaryLabel}</span>
                    )}
                    {seg.secondaryLabel && (
                      <span className="text-xs font-medium whitespace-nowrap opacity-90">{seg.secondaryLabel}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
