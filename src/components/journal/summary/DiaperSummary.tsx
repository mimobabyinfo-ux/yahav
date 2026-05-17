import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { DailyLogEntryWithDetails, DiaperDetail } from '../../../lib/supabase'
import type { Bucket, Granularity } from '../../../hooks/useSummaryData'
import { bucketKeyFor } from '../../../hooks/useSummaryData'

// Diaper tab: daily-average + per-type sub-stats + stacked bar chart
// with 4 segments (wet / dirty / both / dry).

type Props = {
  entries: DailyLogEntryWithDetails[]
  buckets: Bucket[]
  granularity: Granularity
  dayCount: number
  rangeLabel: string
  onNavigateToDay?: (iso: string) => void
}

// Color set — same family (green) with opacity variants for visual
// distinction. Keeps the palette consistent with the timeline's
// existing diaper color.
const DIAPER_BASE = '#22C55E'
const COLOR_WET   = '#FACC15'   // yellow (wet diaper convention)
const COLOR_DIRTY = '#A16207'   // brown (dirty diaper convention)
const COLOR_BOTH  = '#16A34A'   // green (mixed)
const COLOR_DRY   = '#94A3B8'   // slate gray (dry/checked)

function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default function DiaperSummary({ entries, buckets, granularity, dayCount, rangeLabel, onNavigateToDay }: Props) {
  const data = useMemo(() => {
    const map = new Map<string, { date: string; label: string; wet: number; dirty: number; both: number; dry: number }>()
    for (const b of buckets) {
      map.set(b.key, { date: b.date, label: b.label, wet: 0, dirty: 0, both: 0, dry: 0 })
    }
    for (const e of entries) {
      if (e.entry_type !== 'diaper') continue
      const slot = map.get(bucketKeyFor(e.entry_date, granularity))
      if (!slot) continue
      const dd = firstOf<DiaperDetail>(e.diaper_details as DiaperDetail | DiaperDetail[] | null)
      const t = dd?.diaper_type
      if (t === 'wet') slot.wet++
      else if (t === 'dirty') slot.dirty++
      else if (t === 'both') slot.both++
      else if (t === 'dry') slot.dry++
      else slot.wet++ // null → treat as wet (matches legacy default behavior)
    }
    return buckets.map(b => map.get(b.key)!)
  }, [entries, buckets, granularity])

  const totals = useMemo(() => {
    return data.reduce(
      (acc, d) => ({
        wet: acc.wet + d.wet,
        dirty: acc.dirty + d.dirty,
        both: acc.both + d.both,
        dry: acc.dry + d.dry,
      }),
      { wet: 0, dirty: 0, both: 0, dry: 0 },
    )
  }, [data])

  const total = totals.wet + totals.dirty + totals.both + totals.dry

  if (total === 0) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center space-y-2">
        <div className="text-4xl">💩</div>
        <p className="text-sm font-semibold text-sand-700">אין רישומי חיתולים ב{rangeLabel}</p>
        <p className="text-xs text-sand-400">החיתוך משתנה מיד אחרי שמירת חיתול</p>
      </div>
    )
  }

  const avgPerDay = total / dayCount

  function handleBarClick(payload: { date?: string } | undefined) {
    if (payload?.date && onNavigateToDay) onNavigateToDay(payload.date)
  }

  // Sub-stat line — show only types with data.
  const subStats: string[] = []
  if (totals.wet   > 0) subStats.push(`פיפי: ${totals.wet}`)
  if (totals.dirty > 0) subStats.push(`קקי: ${totals.dirty}`)
  if (totals.both  > 0) subStats.push(`שניהם: ${totals.both}`)
  if (totals.dry   > 0) subStats.push(`יבש: ${totals.dry}`)

  // suppress unused lint on DIAPER_BASE — kept for symmetry with other tabs'
  // base color constants and may be used by C7 polish.
  void DIAPER_BASE

  return (
    <div className="space-y-4">
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5">
        <p className="text-xs font-semibold text-sand-500 mb-1">ממוצע יומי</p>
        <p className="text-2xl font-bold text-sand-800 leading-none">
          {avgPerDay.toFixed(1)} <span className="text-sm font-semibold text-sand-500">חיתולים</span>
        </p>
        {subStats.length > 0 && (
          <p className="text-xs text-sand-600 mt-3">{subStats.join(' · ')}</p>
        )}
      </div>

      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-3 pt-4">
        <div dir="ltr" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: -16, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E5E0D2" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#9F8F71' }}
                interval={Math.max(0, Math.ceil(data.length / 7) - 1)}
                angle={-35}
                textAnchor="end"
                height={42}
                axisLine={{ stroke: '#E5E0D2' }}
                tickLine={false}
              />
              <YAxis
                orientation="right"
                tick={{ fontSize: 10, fill: '#9F8F71' }}
                axisLine={false}
                tickLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ fontSize: 11, border: '1px solid #E5E0D2', borderRadius: 8, direction: 'rtl' }}
                formatter={(value, name) => {
                  const label = name === 'wet' ? 'פיפי' : name === 'dirty' ? 'קקי' : name === 'both' ? 'שניהם' : 'יבש'
                  return [`${value ?? 0}`, label]
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { date?: string } | undefined
                  return p?.date ?? ''
                }}
              />
              <Bar dataKey="wet"   stackId="d" fill={COLOR_WET}   onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
              <Bar dataKey="dirty" stackId="d" fill={COLOR_DIRTY} onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
              <Bar dataKey="both"  stackId="d" fill={COLOR_BOTH}  onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
              <Bar dataKey="dry"   stackId="d" fill={COLOR_DRY}   onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-2 text-[10px] text-sand-500">
          {totals.wet   > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_WET   }} />פיפי</span>}
          {totals.dirty > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_DIRTY }} />קקי</span>}
          {totals.both  > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_BOTH  }} />שניהם</span>}
          {totals.dry   > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_DRY   }} />יבש</span>}
        </div>
      </div>
    </div>
  )
}
