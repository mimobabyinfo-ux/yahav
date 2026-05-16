import { ChevronLeft } from 'lucide-react'
import { useTodaysSummary, TodaysSummary } from '../../hooks/useTodaysSummary'
import { formatTimeSince } from '../../utils/timeSince'

// "Today's Journal" panel — Phase 3 C1. Lands on the Dashboard directly
// below the 9-tile quick-add grid. Surfaces a one-glance summary of every
// tracked-action category for today so mom doesn't have to navigate into
// the journal to see what happened.

type Props = {
  refetchKey?: number
  onNavigate: (target: 'journal') => void
}

// ── Hebrew date header: "היום · 14 ביולי" ─────────────────────────────────
const ISRAEL_TZ = 'Asia/Jerusalem'
function todayHebrewLabel(): string {
  const now = new Date()
  // "14 ביולי" — Hebrew month name, no year (keeps the chip compact).
  const dm = now.toLocaleDateString('he-IL', { timeZone: ISRAEL_TZ, day: 'numeric', month: 'long' })
  return `היום · ${dm}`
}

// ── Number formatting helpers ─────────────────────────────────────────────
function fmtHoursMins(totalMin: number): string {
  const m = Math.round(totalMin)
  if (m <= 0) return '0 דק\''
  if (m < 60) return `${m} דק'`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return `${h} שעות`
  return `${h}ש ${rem}דק'`
}

// Build the feeding aggregate sub-line, e.g.:
//   "3 פעמים היום · 35 דק' הנקה · 180 מ\"ל בקבוק"
function buildFeedingAggregate(f: TodaysSummary['feeding']): string {
  if (f.count === 0) return ''
  const parts: string[] = [`${f.count} פעמים היום`]
  if (f.breast && f.breast.totalSeconds > 0) {
    parts.push(`${fmtHoursMins(f.breast.totalSeconds / 60)} הנקה`)
  }
  if (f.bottle && f.bottle.totalMl > 0) {
    parts.push(`${f.bottle.totalMl} מ"ל בקבוק`)
  }
  if (f.solid && f.solid.count > 0) {
    parts.push(`${f.solid.count} מוצק`)
  }
  return parts.join(' · ')
}

function buildDiaperAggregate(d: TodaysSummary['diaper']): string {
  if (d.count === 0) return ''
  // Breakdown chip lists wet/dirty/both. 'dry' is a separate axis — counted,
  // not surfaced in the parens to keep the line short.
  const breakdown: string[] = []
  if (d.wet) breakdown.push(`${d.wet} פיפי`)
  if (d.dirty) breakdown.push(`${d.dirty} קקי`)
  if (d.both) breakdown.push(`${d.both} שניהם`)
  if (d.dry) breakdown.push(`${d.dry} יבש`)
  const base = `${d.count} חיתולים היום`
  return breakdown.length > 0 ? `${base} (${breakdown.join(' · ')})` : base
}

export default function TodaysJournalPanel({ refetchKey = 0, onNavigate }: Props) {
  const s = useTodaysSummary(refetchKey)

  if (s.loading) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm" dir="rtl">
        <div className="text-xs text-sand-400 text-center py-4">טוענת…</div>
      </div>
    )
  }

  return (
    <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-sand-700">📅 {todayHebrewLabel()}</span>
      </div>

      {/* Body */}
      {s.hasAny ? (
        <div className="space-y-2.5">
          {/* Feeding */}
          <Row
            emoji="🤱"
            label="האכלה אחרונה"
            sinceText={formatTimeSince(s.feeding.last, 'עוד לא היום!')}
            detail={buildFeedingAggregate(s.feeding)}
            onTap={() => onNavigate('journal')}
            isEmpty={s.feeding.count === 0}
          />

          {/* Sleep */}
          <Row
            emoji="😴"
            label="שינה אחרונה"
            sinceText={formatTimeSince(s.sleep.last, 'עוד לא היום!')}
            detail={
              s.sleep.count > 0
                ? `${s.sleep.count} שלוקים · ${fmtHoursMins(s.sleep.totalMinutes)} סה"כ`
                : ''
            }
            onTap={() => onNavigate('journal')}
            isEmpty={s.sleep.count === 0}
          />

          {/* Diaper */}
          <Row
            emoji="💩"
            label="חיתול אחרון"
            sinceText={formatTimeSince(s.diaper.last, 'עוד לא היום!')}
            detail={buildDiaperAggregate(s.diaper)}
            onTap={() => onNavigate('journal')}
            isEmpty={s.diaper.count === 0}
          />

          {/* Tummy */}
          <Row
            emoji="🤸"
            label="זמן בטן"
            sinceText={formatTimeSince(s.tummy.last, 'עוד לא היום!')}
            detail={s.tummy.count > 0 ? `${s.tummy.count} פעמים היום` : ''}
            onTap={() => onNavigate('journal')}
            isEmpty={s.tummy.count === 0}
          />
        </div>
      ) : (
        <div className="py-5 text-center">
          <div className="text-3xl mb-2">☀️</div>
          <p className="text-sm font-semibold text-sand-700">עוד לא נרשמו פעולות היום</p>
          <p className="text-xs text-sand-500 mt-1">לחצי על אחד הריבועים למעלה כדי להתחיל</p>
        </div>
      )}

      {/* Footer CTA — only when there's something to show */}
      {s.hasAny && (
        <button
          onClick={() => onNavigate('journal')}
          className="w-full flex items-center justify-center gap-1 py-2 mt-1 text-xs font-bold text-mustard-700 hover:bg-mustard-50 rounded-2xl transition-colors"
        >
          ראי יומן מלא
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Row sub-component ─────────────────────────────────────────────────────
function Row({
  emoji,
  label,
  sinceText,
  detail,
  onTap,
  isEmpty,
}: {
  emoji: string
  label: string
  sinceText: string
  detail: string
  onTap: () => void
  isEmpty: boolean
}) {
  return (
    <button
      onClick={onTap}
      className="w-full text-right flex items-start gap-3 px-3 py-2 rounded-2xl hover:bg-white/50 transition-colors"
    >
      <span className="text-xl leading-tight pt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-semibold ${isEmpty ? 'text-sand-400' : 'text-sand-800'}`}>
            {label}
          </span>
          <span className={`text-xs ${isEmpty ? 'text-sand-400 italic' : 'text-mustard-600 font-medium'} whitespace-nowrap`}>
            {sinceText}
          </span>
        </div>
        {detail && (
          <p className="text-[11px] text-sand-500 leading-tight mt-0.5">{detail}</p>
        )}
      </div>
    </button>
  )
}
