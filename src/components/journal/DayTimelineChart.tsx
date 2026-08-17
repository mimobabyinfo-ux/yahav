import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { DailyLogEntryWithDetails, FeedingDetail, SleepDetail } from '../../lib/supabase'
import { formatDate, formatDuration } from '../../utils/dateUtils'
import { sleepTypeFromStartTime } from '../../utils/sleepTypeFromTime'
import { ENTRY_COLORS } from '../DailyTimeline'

// The day's Gantt timeline: 00:00 at the top, 24:00 at the bottom, blocks
// placed by real time.
//
// Brenda 17.8.26 asked for three things here, and the first one forced the
// geometry to change:
//  · ZOOM. The chart used to squeeze 24 hours into a fixed 400px, so a
//    12-minute feed was two pixels and a busy morning was a smear. Layout
//    is px-per-hour, the container scrolls, and the value is continuous:
//    pinch drives it directly, +/− step it.
//  · A LEGEND. Colour with no key is decoration.
//  · A clearer NOW line — see below.
//
// Cross-midnight rule is unchanged: a sleep that started yesterday and
// ended today renders on today's column starting at 00:00.

const MIN_PX_PER_HOUR = 20    // the whole day just fits the viewport
const MAX_PX_PER_HOUR = 150   // a single feed is a readable block
const BUTTON_STEP = 1.6       // what one tap of +/- multiplies by
const VIEWPORT_MAX_PX = 480
const MIN_DURATION_BLOCK_PX = 6
const INSTANT_HEIGHT_PX = 4
const MINS_PER_DAY = 1440
const TEXT_LABEL_THRESHOLD_PX = 28
const LEGEND: { type: string; label: string }[] = [
  { type: 'feeding',    label: 'האכלה' },
  { type: 'sleep',      label: 'שינה' },
  { type: 'diaper',     label: 'חיתול' },
  { type: 'tummy_time', label: 'זמן בטן' },
]

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
  startMin: number
  durMin: number
  color: string
  isInstant: boolean
  bordered: boolean
  primaryLabel: string | null
  secondaryLabel: string | null
}

function buildSegmentsForDay(entries: DailyLogEntryWithDetails[], day: string): Segment[] {
  const out: Segment[] = []

  for (const e of entries) {
    if (!e.entry_time) continue
    const startMin = timeToMinutes(e.entry_time.slice(0, 5))
    if (startMin == null) continue

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
      out.push({
        startMin,
        durMin: isInstant ? 0 : Math.max(0, Math.min(durMin, MINS_PER_DAY - startMin)),
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
        const tailMin = (Math.min(endEpoch, dayEndEpoch) - dayStartEpoch) / 60000
        out.push({
          startMin: 0,
          durMin: Math.min(tailMin, MINS_PER_DAY),
          color: colors.dot,
          isInstant: false,
          bordered: false,
          primaryLabel,
          // The FULL sleep duration: "this is a 9h sleep, you see 6h of it".
          secondaryLabel: secondary,
        })
      }
    }
  }

  // Z-order: long blocks first (background), instants on top.
  out.sort((a, b) => {
    if (a.isInstant !== b.isInstant) return a.isInstant ? 1 : -1
    return b.durMin - a.durMin
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

  // Zoom is a continuous px-per-hour, not three fixed steps. Brenda
  // 17.8.26: "isn't there a way to zoom with my hand, two fingers, not
  // + and -?" A pinch that snaps between three presets does not feel
  // like a pinch, so the gesture drives the number directly and the
  // buttons step it.
  const [pxPerHour, setPxPerHour] = useState<number>(MIN_PX_PER_HOUR)
  const chartHeight = pxPerHour * 24
  const scrollRef = useRef<HTMLDivElement>(null)

  /** Change zoom while keeping the same clock time under the middle of
   *  the viewport — otherwise zooming throws her to a different hour. */
  const zoomTo = useCallback((next: number, focusClientY?: number) => {
    const el = scrollRef.current
    const clamped = Math.min(MAX_PX_PER_HOUR, Math.max(MIN_PX_PER_HOUR, next))
    if (!el) { setPxPerHour(clamped); return }
    const rect = el.getBoundingClientRect()
    const focusOffset = focusClientY == null ? el.clientHeight / 2 : focusClientY - rect.top
    const minutesAtFocus = ((el.scrollTop + focusOffset) / pxPerHour) * 60
    setPxPerHour(clamped)
    requestAnimationFrame(() => {
      const target = (minutesAtFocus / 60) * clamped - focusOffset
      el.scrollTop = Math.max(0, Math.min(target, clamped * 24 - el.clientHeight))
    })
  }, [pxPerHour])

  // The now-line ticks. A journal that shows a frozen "now" is a chart;
  // one that moves is a clock you can read your day against.
  const [nowMin, setNowMin] = useState(currentMinuteOfDay)
  useEffect(() => {
    const t = setInterval(() => setNowMin(currentMinuteOfDay()), 60_000)
    return () => clearInterval(t)
  }, [])

  const today = formatDate(new Date())
  const isToday = selectedDate === today
  const showNowLine = selectedDate <= today
  const nowLabel = `${pad2(Math.floor(nowMin / 60))}:${pad2(nowMin % 60)}`

  // Open where the day actually is. On today that is the current hour; on
  // a past day it is the first thing that happened. Starting at 00:00 wastes
  // the first screen on the hours she slept through.
  const anchorMin = isToday
    ? nowMin
    : (segs.length > 0 ? Math.min(...segs.map(s => s.startMin)) : 7 * 60)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const target = (anchorMin / 60) * pxPerHour - el.clientHeight / 2
    el.scrollTop = Math.max(0, Math.min(target, pxPerHour * 24 - el.clientHeight))
    // Only when the DAY changes. Re-anchoring on zoom would fight the
    // pinch, which keeps its own focus point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // ── Pinch to zoom ────────────────────────────────────────────────────
  // Registered natively with { passive: false } rather than through React's
  // onTouchMove. React attaches touchmove passively, so preventDefault is
  // ignored there and the BROWSER takes the two-finger gesture and zooms
  // the whole page — which is why the first version did nothing on a phone.
  // touch-action: pan-y on the element tells the browser the same thing up
  // front, so vertical scrolling still works and pinching is ours.
  const pinchRef = useRef<{ dist: number; px: number } | null>(null)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const dist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 2) return
      pinchRef.current = { dist: dist(e.touches), px: pxPerHour }
    }
    function onMove(e: TouchEvent) {
      const start = pinchRef.current
      if (e.touches.length !== 2 || !start) return
      e.preventDefault()
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
      zoomTo(start.px * (dist(e.touches) / start.dist), midY)
    }
    function onEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinchRef.current = null
    }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [pxPerHour, zoomTo])

  // Hour gridlines: every 3h when compressed, every hour once zoomed in.
  const hourStep = pxPerHour >= 44 ? 1 : 3
  const gridHours: number[] = []
  for (let h = 0; h < 24; h += hourStep) gridHours.push(h)

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-[#F0EAE0] overflow-hidden">
      {/* Zoom control */}
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-[11px] font-semibold text-sand-500">ציר הזמן של היום · אפשר לצבוט להגדלה</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomTo(pxPerHour / BUTTON_STEP)}
            disabled={pxPerHour <= MIN_PX_PER_HOUR + 0.5}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sand-600 disabled:opacity-30"
            style={{ background: '#F4EDE1' }}
            aria-label="הקטנה"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => zoomTo(pxPerHour * BUTTON_STEP)}
            disabled={pxPerHour >= MAX_PX_PER_HOUR - 0.5}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sand-600 disabled:opacity-30"
            style={{ background: '#F4EDE1' }}
            aria-label="הגדלה"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto scroll-hide mt-2"
        style={{ maxHeight: VIEWPORT_MAX_PX, touchAction: 'pan-y' }}
      >
        <div className="grid grid-cols-[34px_1fr]" style={{ height: chartHeight }}>
          {/* Time rail */}
          <div className="relative border-l border-sand-100" dir="ltr">
            {gridHours.map(h => (
              h === 0 ? null : (
                <span
                  key={h}
                  className="absolute text-[11px] text-sand-600 right-1"
                  style={{ top: h * pxPerHour - 6 }}
                >
                  {pad2(h)}:00
                </span>
              )
            ))}
          </div>

          {/* The day column */}
          <div className="relative">
            {gridHours.map(h => (
              <div
                key={h}
                className="absolute left-0 right-0 h-px bg-sand-200/40 pointer-events-none"
                style={{ top: h * pxPerHour }}
              />
            ))}

            {/* Now line. On today it is the brand's rojo tierra, because it
                means "you are here". On a past day it stays muted grey —
                there it is only a comparison aid. */}
            {showNowLine && (
              <>
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    top: (nowMin / 60) * pxPerHour,
                    height: isToday ? 2 : 1.5,
                    background: isToday ? '#A35C3D' : '#64748B',
                    opacity: isToday ? 0.9 : 0.5,
                  }}
                />
                <div
                  className="absolute pointer-events-none"
                  style={{ top: (nowMin / 60) * pxPerHour - 8, left: 4 }}
                >
                  <span
                    className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={isToday
                      ? { background: '#A35C3D', color: '#FFFFFF' }
                      : { background: 'rgba(255,255,255,.85)', color: '#6E6257' }}
                  >
                    {nowLabel}
                  </span>
                </div>
              </>
            )}

            {/* Segments */}
            {segs.map((seg, i) => {
              const top = (seg.startMin / 60) * pxPerHour
              const rawHeight = (seg.durMin / 60) * pxPerHour
              const height = seg.isInstant
                ? INSTANT_HEIGHT_PX
                : Math.max(rawHeight, MIN_DURATION_BLOCK_PX)
              const showText = !seg.isInstant && height >= TEXT_LABEL_THRESHOLD_PX
                && (seg.primaryLabel || seg.secondaryLabel)

              return (
                <div
                  key={i}
                  className="absolute left-1.5 right-1.5 overflow-hidden"
                  style={{
                    top,
                    height,
                    background: seg.color,
                    opacity: seg.isInstant ? 0.85 : 0.92,
                    borderRadius: seg.isInstant ? 2 : 6,
                    boxShadow: seg.bordered ? 'inset 0 0 0 1px rgba(255,255,255,0.55)' : undefined,
                  }}
                >
                  {showText && (
                    <div className="flex items-start justify-between px-2.5 py-1.5 text-[#4A3A28]">
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

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 border-t border-[#F4EFE7]">
        {LEGEND.map(l => (
          <span key={l.type} className="flex items-center gap-1.5 text-[11px] font-semibold text-sand-600">
            <span
              className="inline-block rounded-sm"
              style={{ width: 9, height: 9, background: (ENTRY_COLORS[l.type] ?? ENTRY_COLORS.note).dot }}
            />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}
