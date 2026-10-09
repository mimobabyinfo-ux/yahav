import { ChevronLeft } from 'lucide-react'
import { useTodaysSummary, TodaysSummary } from '../../hooks/useTodaysSummary'
import { formatTimeSince } from '../../utils/timeSince'

import { tx, LOCALE, DIR } from '../../i18n'
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
  const dm = now.toLocaleDateString(LOCALE, { timeZone: ISRAEL_TZ, day: 'numeric', month: 'long' })
  return tx('היום · {dm}', { dm })
}

// ── Number formatting helpers ─────────────────────────────────────────────
function fmtHoursMins(totalMin: number): string {
  const m = Math.round(totalMin)
  if (m <= 0) return tx('0 דק\'')
  if (m < 60) return tx('{m} דק\'', { m })
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (rem === 0) return tx('{h} שעות', { h })
  return tx('{h}ש {rem}דק\'', { h, rem })
}

// Build the feeding aggregate sub-line, e.g.:
//   "3 פעמים היום · 35 דק' הנקה · 180 מ\"ל בקבוק"
function buildFeedingAggregate(f: TodaysSummary['feeding']): string {
  if (f.count === 0) return ''
  const parts: string[] = [tx('{count} פעמים היום', { count: f.count })]
  if (f.breast && f.breast.totalSeconds > 0) {
    parts.push(tx('{v0} הנקה', { v0: fmtHoursMins(f.breast.totalSeconds / 60) }))
  }
  if (f.bottle && f.bottle.totalMl > 0) {
    parts.push(tx('{totalMl} מ"ל בקבוק', { totalMl: f.bottle.totalMl }))
  }
  if (f.solid && f.solid.count > 0) {
    parts.push(tx('{count} מוצק', { count: f.solid.count }))
  }
  return parts.join(' · ')
}

// Sleep aggregate line. Splits naps and nights with proper Hebrew
// pluralization, then a unified "סה"כ" total. Empty string when no
// completed sleeps today (so the row shows the since-text only — possibly
// referencing a still-running timer surfaced by the hook).
//
// Examples (per spec):
//   only naps  → "2 שינות יום · 1.8 שעות סה"כ"
//   only night → "שנת לילה אחת · 9.5 שעות סה"כ"
//   mixed      → "2 שינות יום · שנת לילה אחת · 11 שעות סה"כ"
//   one nap    → "שינת יום אחת · 45 דק' סה"כ"
function buildSleepAggregate(s: TodaysSummary['sleep']): string {
  if (s.napCount === 0 && s.nightCount === 0) return ''

  const parts: string[] = []
  if (s.napCount === 1) parts.push(tx('שינת יום אחת'))
  else if (s.napCount > 1) parts.push(tx('{napCount} שינות יום', { napCount: s.napCount }))

  if (s.nightCount === 1) parts.push(tx('שנת לילה אחת'))
  else if (s.nightCount > 1) parts.push(tx('{nightCount} שנות לילה', { nightCount: s.nightCount }))

  // Total: dק' under 1h, otherwise hours with optional 1-decimal place.
  if (s.totalMinutes < 60) {
    parts.push(tx('{v0} דק\' סה"כ', { v0: Math.round(s.totalMinutes) }))
  } else {
    const hrs = s.totalMinutes / 60
    const rounded = Math.round(hrs * 10) / 10
    // Drop the trailing .0 so "11" prints as "11" not "11.0".
    const label = Number.isInteger(rounded) ? `${rounded}` : `${rounded}`
    parts.push(tx('{label} שעות סה"כ', { label }))
  }
  return parts.join(' · ')
}

function buildDiaperAggregate(d: TodaysSummary['diaper']): string {
  if (d.count === 0) return ''
  // Breakdown chip lists wet/dirty/both. 'dry' is a separate axis — counted,
  // not surfaced in the parens to keep the line short.
  const breakdown: string[] = []
  if (d.wet) breakdown.push(tx('{wet} פיפי', { wet: d.wet }))
  if (d.dirty) breakdown.push(tx('{dirty} קקי', { dirty: d.dirty }))
  if (d.both) breakdown.push(tx('{both} שניהם', { both: d.both }))
  if (d.dry) breakdown.push(tx('{dry} יבש', { dry: d.dry }))
  const base = tx('{count} חיתולים היום', { count: d.count })
  return breakdown.length > 0 ? `${base} (${breakdown.join(' · ')})` : base
}

export default function TodaysJournalPanel({ refetchKey = 0, onNavigate }: Props) {
  const s = useTodaysSummary(refetchKey)

  if (s.loading) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm" dir={DIR}>
        <div className="text-xs text-sand-600 text-center py-4">{tx('טוענת…')}</div>
      </div>
    )
  }

  return (
    <div className="bg-[#F5F1EB] rounded-3xl p-4 shadow-sm space-y-3" dir={DIR}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-sand-700">📅 {todayHebrewLabel()}</span>
      </div>

      {/* Body */}
      {s.hasAny ? (
        <div className="space-y-2.5">
          {/* Feeding */}
          <Row
            emoji="🤱🏼"
            label={tx('האכלה אחרונה')}
            sinceText={formatTimeSince(s.feeding.last, tx('עוד לא היום!'))}
            detail={buildFeedingAggregate(s.feeding)}
            onTap={() => onNavigate('journal')}
            isEmpty={s.feeding.count === 0}
          />

          {/* Sleep — `isEmpty` keyed off `last === null` so a row showing
              only an active sleep timer (no completed entries yet) renders
              fully-coloured rather than muted. */}
          <Row
            emoji="😴"
            label={tx('שינה אחרונה')}
            sinceText={formatTimeSince(s.sleep.last, tx('עוד לא היום!'))}
            detail={buildSleepAggregate(s.sleep)}
            onTap={() => onNavigate('journal')}
            isEmpty={s.sleep.last === null}
          />

          {/* Diaper */}
          <Row
            emoji="💩"
            label={tx('חיתול אחרון')}
            sinceText={formatTimeSince(s.diaper.last, tx('עוד לא היום!'))}
            detail={buildDiaperAggregate(s.diaper)}
            onTap={() => onNavigate('journal')}
            isEmpty={s.diaper.count === 0}
          />

          {/* Tummy */}
          <Row
            emoji="🤸🏼"
            label={tx('זמן בטן')}
            sinceText={formatTimeSince(s.tummy.last, tx('עוד לא היום!'))}
            detail={s.tummy.count > 0 ? tx('{count} פעמים היום', { count: s.tummy.count }) : ''}
            onTap={() => onNavigate('journal')}
            isEmpty={s.tummy.count === 0}
          />
        </div>
      ) : (
        <div className="py-5 text-center">
          <div className="text-3xl mb-2">☀️</div>
          <p className="text-sm font-semibold text-sand-700">{tx('עוד לא נרשמו פעולות היום')}</p>
          <p className="text-xs text-sand-500 mt-1">{tx('לחצי על אחד הריבועים למעלה כדי להתחיל')}</p>
        </div>
      )}

      {/* Footer CTA — only when there's something to show */}
      {s.hasAny && (
        <button
          onClick={() => onNavigate('journal')}
          className="w-full flex items-center justify-center gap-1 py-2 mt-1 text-xs font-bold text-mustard-700 hover:bg-mustard-50 rounded-2xl transition-colors"
        >
          
          {tx('ראי יומן מלא')}
          <ChevronLeft className="flip-dir w-3.5 h-3.5" />
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
      className="w-full text-start flex items-start gap-3 px-3 py-2 rounded-2xl hover:bg-white/50 transition-colors"
    >
      <span className="text-xl leading-tight pt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`text-sm font-semibold ${isEmpty ? 'text-sand-600' : 'text-sand-800'}`}>
            {label}
          </span>
          <span className={`text-xs ${isEmpty ? 'text-sand-600 italic' : 'text-mustard-600 font-medium'} whitespace-nowrap`}>
            {sinceText}
          </span>
        </div>
        {detail && (
          <p className="text-[13px] text-sand-500 leading-tight mt-0.5">{detail}</p>
        )}
      </div>
    </button>
  )
}
