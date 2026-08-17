import { useState } from 'react'
import { useSummaryData, SummaryRange } from '../../hooks/useSummaryData'
import SleepSummary from './summary/SleepSummary'
import FeedingSummary from './summary/FeedingSummary'
import SolidSummary from './summary/SolidSummary'
import DiaperSummary from './summary/DiaperSummary'
import JournalHeader from './JournalHeader'

// Phase 3 / C6: סיכום tab. Two-level navigation — category sub-nav
// (sleep / feeding / solids / diapers) + time-range strip (7 / 14 / 30
// days / 90 days / year). One primary chart + sub-stats per category;
// trend lines / period-over-period / L-R breast balance / "most-eaten"
// list intentionally deferred to C7 to keep this commit's scope tight.

type SubTab = 'sleep' | 'feeding' | 'solid' | 'diaper'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'sleep',   label: 'שינה' },
  { id: 'feeding', label: 'האכלה' },
  { id: 'solid',   label: 'מוצקים' },
  { id: 'diaper',  label: 'חיתולים' },
]

const RANGES: { id: SummaryRange; label: string }[] = [
  { id: '7d',  label: '7 ימים' },
  { id: '14d', label: '14 ימים' },
  { id: '30d', label: '30 ימים' },
  { id: '90d', label: '90 ימים' },
  { id: '1y',  label: 'שנה' },
]

type Props = {
  /** Bumped by JournalPage on any entry save → hook refetches. */
  refetchKey: number
  /** Tap a chart bar → navigate to that day in DayView. */
  onNavigateToDay?: (iso: string) => void
  onOpenViews: () => void
}

export default function SummaryView({ refetchKey, onNavigateToDay, onOpenViews }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('sleep')
  const [range, setRange] = useState<SummaryRange>('7d')

  const { loading, granularity, buckets, entries, dayCount } = useSummaryData(range, refetchKey)

  // Used by per-tab empty states so the message references the
  // selected range explicitly.
  const rangeLabel =
    range === '7d'  ? '7 הימים האחרונים'  :
    range === '14d' ? '14 הימים האחרונים' :
    range === '30d' ? '30 הימים האחרונים' :
    range === '90d' ? '90 הימים האחרונים' :
    'שנה האחרונה'

  return (
    <div className="space-y-3">
      {/* Same header as every other view. Nothing to step through here,
          so it is the label alone — but it is still the way back. */}
      <JournalHeader onOpenViews={onOpenViews}>
        <span className="font-semibold" style={{ fontSize: 17, color: '#443327' }}>סיכום</span>
      </JournalHeader>

      {/* Sub-nav — mustard pill on active. */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#F0EAE0] gap-1">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
              subTab === t.id ? 'shadow-sm' : 'text-sand-500'
            }`}
            style={subTab === t.id ? { background: '#E7C78A', color: '#4A3A28' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Range strip — same visual style, smaller text. */}
      <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-[#F0EAE0] gap-1 overflow-x-auto scroll-hide">
        {RANGES.map(r => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`flex-1 min-w-fit px-2 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              range === r.id ? 'shadow-sm' : 'text-sand-500'
            }`}
            style={range === r.id ? { background: '#E7C78A', color: '#4A3A28' } : {}}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="bg-white rounded-3xl shadow-sm border border-[#F0EAE0] p-8 text-center">
          <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <>
          {subTab === 'sleep' && (
            <SleepSummary
              entries={entries}
              buckets={buckets}
              granularity={granularity}
              dayCount={dayCount}
              rangeLabel={rangeLabel}
              onNavigateToDay={onNavigateToDay}
            />
          )}
          {subTab === 'feeding' && (
            <FeedingSummary
              entries={entries}
              buckets={buckets}
              granularity={granularity}
              dayCount={dayCount}
              rangeLabel={rangeLabel}
              onNavigateToDay={onNavigateToDay}
            />
          )}
          {subTab === 'solid' && (
            <SolidSummary
              entries={entries}
              buckets={buckets}
              granularity={granularity}
              dayCount={dayCount}
              rangeLabel={rangeLabel}
              onNavigateToDay={onNavigateToDay}
            />
          )}
          {subTab === 'diaper' && (
            <DiaperSummary
              entries={entries}
              buckets={buckets}
              granularity={granularity}
              dayCount={dayCount}
              rangeLabel={rangeLabel}
              onNavigateToDay={onNavigateToDay}
            />
          )}
        </>
      )}
    </div>
  )
}
