import type { DailyLogEntryWithDetails, FeedingDetail, SleepDetail, DiaperDetail } from '../lib/supabase'
import { formatDuration } from '../utils/dateUtils'
import { ENTRY_COLORS } from './DailyTimeline'

type Props = {
  entries: DailyLogEntryWithDetails[]
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

// PostgREST returns 1:1 detail joins as arrays at runtime. Same firstOf
// pattern the dashboard's TodaysJournalPanel uses.
function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Phase 3 / C3: stat tiles → 5-line text breakdown. Color bar above kept
// as-is. Lines render only when their category has activity, so a
// breast-only day shows just one feeding line rather than 3 zero rows.
export default function DailySummary({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5 text-center">
        <p className="text-sand-400 text-sm">עדיין אין פעילויות היום</p>
        <p className="text-sand-300 text-xs mt-1">הוסיפי רשומה ראשונה 👇</p>
      </div>
    )
  }

  // ── Category aggregates ────────────────────────────────────────────
  const breast = { count: 0, totalSeconds: 0 }
  const bottle = { count: 0, totalMl: 0 }
  const solid = { count: 0 }
  let sleepCount = 0
  let sleepMins = 0
  let diaperCount = 0
  let tummyCount = 0
  let tummyMins = 0

  for (const e of entries) {
    if (e.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.feeding_type === 'breast') {
        breast.count++
        // Prefer per-side seconds (Phase 2 schema); fall back to duration_minutes.
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
      sleepCount++
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      if (sd?.duration_minutes != null) sleepMins += sd.duration_minutes
    } else if (e.entry_type === 'diaper') {
      diaperCount++
    } else if (e.entry_type === 'tummy_time') {
      tummyCount++
      // Tummy entries encode duration in notes ("משך: X דקות"). Parse it
      // out — best-effort, falls through to 0 if the format doesn't match.
      const m = e.notes?.match(/משך:\s*(\d+)\s*דקות/)
      if (m) tummyMins += parseInt(m[1], 10)
    }
  }

  // Build the 5 candidate lines. Filter empties so the card is dense.
  const lines: { emoji: string; text: string }[] = []
  if (breast.count > 0) {
    const mins = Math.round(breast.totalSeconds / 60)
    lines.push({ emoji: '🤱', text: `${breast.count} הנקות${mins > 0 ? ` · ${formatDuration(mins)}` : ''}` })
  }
  if (bottle.count > 0) {
    lines.push({ emoji: '🍼', text: `${bottle.count} בקבוקים${bottle.totalMl > 0 ? ` · ${bottle.totalMl} מ"ל` : ''}` })
  }
  if (solid.count > 0) {
    lines.push({ emoji: '🥄', text: `${solid.count} מנות מוצק` })
  }
  if (sleepCount > 0) {
    lines.push({ emoji: '😴', text: `${sleepCount} שינות${sleepMins > 0 ? ` · ${formatDuration(sleepMins)}` : ''}` })
  }
  if (diaperCount > 0) {
    lines.push({ emoji: '💩', text: `${diaperCount} חיתולים` })
  }
  if (tummyCount > 0) {
    lines.push({ emoji: '🤸', text: `${tummyCount} זמן בטן${tummyMins > 0 ? ` · ${formatDuration(tummyMins)}` : ''}` })
  }

  // ── 24-hour color bar segments (unchanged behavior from the previous
  //    version — kept above the new text breakdown). ──────────────────
  const DAY_MINS = 24 * 60
  const colorSegments = entries
    .filter(e => e.entry_time)
    .map(e => {
      const startMin = timeToMinutes(e.entry_time)
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      const dd = firstOf<DiaperDetail>(e.diaper_details as DiaperDetail | DiaperDetail[] | null)
      void dd
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

  return (
    <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-4 space-y-4">
      {/* 24-hour color bar */}
      <div>
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

      {/* 5-line text breakdown (Phase 3 / C3) */}
      <div className="space-y-1.5 pt-1 border-t border-sand-100/60">
        <h3 className="text-xs font-semibold text-sand-500 mb-1">סה"כ היום</h3>
        {lines.length === 0 ? (
          <p className="text-xs text-sand-400">אין נתונים מספריים להציג</p>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-sand-700">
              <span className="text-base leading-none">{l.emoji}</span>
              <span>{l.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
