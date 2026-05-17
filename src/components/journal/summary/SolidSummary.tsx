import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { DailyLogEntryWithDetails, FeedingDetail } from '../../../lib/supabase'
import type { Bucket, Granularity } from '../../../hooks/useSummaryData'
import { bucketKeyFor } from '../../../hooks/useSummaryData'

// Solids tab: per-day solid feeding count + simple single-color bar
// chart. No "most-eaten items" parsing in v1 (deferred to C7 — too
// fragile to parse free-text reliably).

type Props = {
  entries: DailyLogEntryWithDetails[]
  buckets: Bucket[]
  granularity: Granularity
  dayCount: number
  rangeLabel: string
  onNavigateToDay?: (iso: string) => void
}

const SOLID_COLOR = '#FFC107'

function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default function SolidSummary({ entries, buckets, granularity, dayCount, rangeLabel, onNavigateToDay }: Props) {
  const data = useMemo(() => {
    const map = new Map<string, { date: string; label: string; count: number }>()
    for (const b of buckets) {
      map.set(b.key, { date: b.date, label: b.label, count: 0 })
    }
    for (const e of entries) {
      if (e.entry_type !== 'feeding') continue
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.feeding_type !== 'solid') continue
      const slot = map.get(bucketKeyFor(e.entry_date, granularity))
      if (slot) slot.count++
    }
    return buckets.map(b => map.get(b.key)!)
  }, [entries, buckets, granularity])

  const total = useMemo(() => data.reduce((acc, d) => acc + d.count, 0), [data])

  if (total === 0) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center space-y-2">
        <div className="text-4xl">🥄</div>
        <p className="text-sm font-semibold text-sand-700">אין רישומי מוצקים ב{rangeLabel}</p>
        <p className="text-xs text-sand-400">החיתוך משתנה מיד אחרי שמירת מוצק</p>
      </div>
    )
  }

  const avgPerDay = total / dayCount

  function handleBarClick(payload: { date?: string } | undefined) {
    if (payload?.date && onNavigateToDay) onNavigateToDay(payload.date)
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5">
        <p className="text-xs font-semibold text-sand-500 mb-1">ממוצע יומי</p>
        <p className="text-2xl font-bold text-sand-800 leading-none">
          {avgPerDay.toFixed(1)} <span className="text-sm font-semibold text-sand-500">מנות</span>
        </p>
        <p className="text-xs text-sand-600 mt-3">סה"כ {total} מנות מוצק ב-{dayCount} ימים</p>
      </div>

      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-3 pt-4">
        <div dir="ltr" style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
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
                tick={{ fontSize: 10, fill: '#9F8F71' }}
                axisLine={false}
                tickLine={false}
                width={28}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ fontSize: 11, border: '1px solid #E5E0D2', borderRadius: 8, direction: 'rtl' }}
                formatter={(value) => [`${value ?? 0}`, 'מנות']}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { date?: string } | undefined
                  return p?.date ?? ''
                }}
              />
              <Bar dataKey="count" fill={SOLID_COLOR} onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
