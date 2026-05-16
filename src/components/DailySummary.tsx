import type { DailyLogEntryWithDetails, FeedingDetail, SleepDetail, DiaperDetail } from '../lib/supabase'
import { formatDuration } from '../utils/dateUtils'
import { sleepTypeFromStartTime } from '../utils/sleepTypeFromTime'
import { ENTRY_COLORS } from './DailyTimeline'

type Props = {
  entries: DailyLogEntryWithDetails[]
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

// PostgREST returns 1:1 detail joins as arrays at runtime.
function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Resolve nap vs night — prefer the saved value, fall back to the silent
// start-time rule for legacy rows.
function resolveSleepKind(e: DailyLogEntryWithDetails, sd: SleepDetail | null): 'nap' | 'night' {
  if (sd?.sleep_type === 'nap' || sd?.sleep_type === 'night') return sd.sleep_type
  if (e.entry_time) {
    const dt = new Date(`${e.entry_date}T${e.entry_time.slice(0, 5)}:00`)
    return sleepTypeFromStartTime(dt)
  }
  return 'nap'
}

// Phase 3 / C4 (Day-view addition): summary cards replace the older
// 6-line text breakdown. Each card = colored leading bar + emoji +
// label + big bold primary value + subtype breakdown sub-line.
// Only cards with activity render.
export default function DailySummary({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5 text-center">
        <p className="text-sand-400 text-sm">עדיין אין פעילויות היום</p>
        <p className="text-sand-300 text-xs mt-1">הוסיפי רשומה ראשונה 👇</p>
      </div>
    )
  }

  // ── Aggregates ────────────────────────────────────────────────────
  const breast = { count: 0, totalSeconds: 0 }
  const bottle = { count: 0, totalMl: 0 }
  const solid = { count: 0 }
  let napCount = 0
  let napMins = 0
  let nightCount = 0
  let nightMins = 0
  const diaper = { wet: 0, dirty: 0, both: 0, dry: 0, total: 0 }
  let tummyCount = 0
  let tummyMins = 0

  for (const e of entries) {
    if (e.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.feeding_type === 'breast') {
        breast.count++
        const perSide = (fd.left_duration_seconds ?? 0) + (fd.right_duration_seconds ?? 0)
        breast.totalSeconds += perSide > 0
          ? perSide
          : fd.duration_minutes != null ? Math.round(fd.duration_minutes * 60) : 0
      } else if (fd?.feeding_type === 'bottle') {
        bottle.count++
        bottle.totalMl += fd.amount_ml ?? 0
      } else if (fd?.feeding_type === 'solid') {
        solid.count++
      }
    } else if (e.entry_type === 'sleep') {
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      const mins = sd?.duration_minutes ?? 0
      const kind = resolveSleepKind(e, sd)
      if (kind === 'night') { nightCount++; nightMins += mins }
      else { napCount++; napMins += mins }
    } else if (e.entry_type === 'diaper') {
      diaper.total++
      const t = firstOf<DiaperDetail>(e.diaper_details as DiaperDetail | DiaperDetail[] | null)?.diaper_type
      if (t === 'wet') diaper.wet++
      else if (t === 'dirty') diaper.dirty++
      else if (t === 'both') diaper.both++
      else if (t === 'dry') diaper.dry++
    } else if (e.entry_type === 'tummy_time') {
      tummyCount++
      const m = e.notes?.match(/משך:\s*(\d+(?:\.\d+)?)\s*דקות/)
      if (m) tummyMins += parseFloat(m[1])
    }
  }

  const totalSleepMins = napMins + nightMins
  const totalFeedingCount = breast.count + bottle.count + solid.count

  // ── Sub-line composers ─────────────────────────────────────────────
  function composeSleepSub(): string {
    const parts: string[] = []
    if (nightCount > 0) {
      const label = nightCount === 1 ? 'שנת לילה' : `${nightCount} שנות לילה`
      parts.push(`${label}: ${formatDuration(nightMins)}`)
    }
    if (napCount > 0) {
      const label = napCount === 1 ? 'שינת יום' : `${napCount} שינות יום`
      parts.push(`${label}: ${formatDuration(napMins)}`)
    }
    return parts.join(' · ')
  }

  function composeFeedingSub(): string {
    const parts: string[] = []
    if (breast.count > 0) {
      const label = breast.count === 1 ? 'הנקה' : `${breast.count} הנקות`
      const mins = Math.round(breast.totalSeconds / 60)
      parts.push(mins > 0 ? `${label} · ${formatDuration(mins)}` : label)
    }
    if (bottle.count > 0) {
      const label = bottle.count === 1 ? 'בקבוק' : `${bottle.count} בקבוקים`
      parts.push(bottle.totalMl > 0 ? `${label} · ${bottle.totalMl} מ"ל` : label)
    }
    if (solid.count > 0) {
      const label = solid.count === 1 ? 'מנת מוצק' : `${solid.count} מנות מוצק`
      parts.push(label)
    }
    return parts.join(' · ')
  }

  function composeDiaperSub(): string {
    const parts: string[] = []
    if (diaper.wet > 0) parts.push(`${diaper.wet} פיפי`)
    if (diaper.dirty > 0) parts.push(`${diaper.dirty} קקי`)
    if (diaper.both > 0) parts.push(`${diaper.both} שניהם`)
    if (diaper.dry > 0) parts.push(`${diaper.dry} יבש`)
    return parts.join(' · ')
  }

  function composeTummySub(): string {
    return tummyCount === 1 ? 'סשן אחד' : `${tummyCount} סשנים`
  }

  // ── 24h color bar (kept above the cards per spec) ─────────────────
  const DAY_MINS = 24 * 60
  const colorSegments = entries
    .filter(e => e.entry_time)
    .map(e => {
      const startMin = timeToMinutes(e.entry_time)
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      const durMin =
        e.entry_type === 'feeding' ? (fd?.duration_minutes ?? 5) :
        e.entry_type === 'sleep' ? (sd?.duration_minutes ?? 30) :
        e.entry_type === 'pumping' ? 15 : 5
      const colors = ENTRY_COLORS[e.entry_type] ?? ENTRY_COLORS.note
      return {
        left: (startMin / DAY_MINS) * 100,
        width: Math.max((durMin / DAY_MINS) * 100, 0.8),
        color: colors.dot,
      }
    })

  const legend = [
    { label: 'האכלה', color: ENTRY_COLORS.feeding.dot },
    { label: 'שינה',  color: ENTRY_COLORS.sleep.dot },
    { label: 'חיתול', color: ENTRY_COLORS.diaper.dot },
  ]

  // Renderable card list — gated on non-zero counts.
  const cards: SummaryCardProps[] = []
  if (napCount + nightCount > 0) {
    cards.push({
      emoji: '😴',
      color: ENTRY_COLORS.sleep.dot,
      label: 'שינה',
      primary: formatDuration(totalSleepMins),
      sub: composeSleepSub(),
    })
  }
  if (totalFeedingCount > 0) {
    cards.push({
      emoji: '🍼',
      color: ENTRY_COLORS.feeding.dot,
      label: 'האכלה',
      primary: `${totalFeedingCount}`,
      sub: composeFeedingSub(),
    })
  }
  if (diaper.total > 0) {
    cards.push({
      emoji: '💩',
      color: ENTRY_COLORS.diaper.dot,
      label: 'חיתולים',
      primary: `${diaper.total}`,
      sub: composeDiaperSub(),
    })
  }
  if (tummyCount > 0) {
    cards.push({
      emoji: '🤸',
      color: ENTRY_COLORS.tummy_time.dot,
      label: 'זמן בטן',
      primary: tummyMins > 0 ? formatDuration(tummyMins) : `${tummyCount}`,
      sub: composeTummySub(),
    })
  }

  return (
    <div className="space-y-3">
      {/* 24-hour color bar (preserved per Addition 1 spec) */}
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold text-sand-500">יום בצבעים</h3>
          <div className="flex items-center gap-2">
            {legend.map(l => (
              <span key={l.label} className="flex items-center gap-0.5 text-[10px] text-sand-400">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="relative h-5 rounded-xl overflow-hidden" dir="ltr" style={{ background: '#F3F0EB' }}>
          {colorSegments.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 h-full"
              style={{
                left: `${seg.left}%`,
                width: `${seg.width}%`,
                background: seg.color,
                opacity: 0.85,
                borderRadius: '3px',
              }}
            />
          ))}
          {[6, 12, 18].map(h => (
            <div
              key={h}
              className="absolute top-0 h-full w-px bg-white opacity-50"
              style={{ left: `${(h / 24) * 100}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-sand-300 mt-0.5 px-0.5" dir="ltr">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
        </div>
      </div>

      {/* Per-category summary cards. Stacks vertically; full-width. */}
      <div className="space-y-2">
        {cards.map((c, i) => (
          <SummaryCard key={i} {...c} />
        ))}
      </div>
    </div>
  )
}

// ── Sub-component ──────────────────────────────────────────────────────────

type SummaryCardProps = {
  emoji: string
  color: string         // activity color (left/start bar)
  label: string         // category name
  primary: string       // big bold value
  sub: string           // breakdown sub-line
}

function SummaryCard({ emoji, color, label, primary, sub }: SummaryCardProps) {
  return (
    <div
      className="bg-white rounded-2xl shadow-sm p-3"
      style={{
        // RTL-aware: borderInlineStart puts the 4px bar on the visual
        // START of the card (right side in RTL, left side in LTR).
        borderInlineStart: `4px solid ${color}`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl leading-none flex-shrink-0">{emoji}</span>
          <span className="text-sm font-semibold text-sand-700">{label}</span>
        </div>
        <span className="text-base font-bold text-sand-800 whitespace-nowrap">{primary}</span>
      </div>
      {sub && (
        <p className="text-xs text-sand-500 mt-1.5 leading-snug">{sub}</p>
      )}
    </div>
  )
}
