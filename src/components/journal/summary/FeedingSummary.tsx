import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { DailyLogEntryWithDetails, FeedingDetail } from '../../../lib/supabase'
import type { Bucket, Granularity } from '../../../hooks/useSummaryData'
import { bucketKeyFor } from '../../../hooks/useSummaryData'

// Feeding tab: daily-average feedings + per-subtype sub-stats + stacked
// bar chart per bucket showing breast / bottle / solid counts. Colors
// match the timeline's feeding-subtype palette so the visual language
// stays consistent across views.

type Props = {
  entries: DailyLogEntryWithDetails[]
  buckets: Bucket[]
  granularity: Granularity
  dayCount: number
  rangeLabel: string
  onNavigateToDay?: (iso: string) => void
}

// Same teal/blue/yellow palette as DailyTimeline's FEEDING_SUBTYPE_COLORS.
const COLOR_BREAST = '#00ACC1'
const COLOR_BOTTLE = '#2196F3'
const COLOR_SOLID  = '#FFC107'

function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default function FeedingSummary({ entries, buckets, granularity, dayCount, rangeLabel, onNavigateToDay }: Props) {
  const data = useMemo(() => {
    const map = new Map<string, { date: string; label: string; breast: number; bottle: number; solid: number }>()
    for (const b of buckets) {
      map.set(b.key, { date: b.date, label: b.label, breast: 0, bottle: 0, solid: 0 })
    }
    for (const e of entries) {
      if (e.entry_type !== 'feeding') continue
      const slot = map.get(bucketKeyFor(e.entry_date, granularity))
      if (!slot) continue
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.feeding_type === 'breast') slot.breast++
      else if (fd?.feeding_type === 'bottle') slot.bottle++
      else if (fd?.feeding_type === 'solid') slot.solid++
      else slot.breast++ // null subtype → assume breast (matches legacy default)
    }
    return buckets.map(b => map.get(b.key)!)
  }, [entries, buckets, granularity])

  const totals = useMemo(() => {
    let breast = 0, bottle = 0, solid = 0, bottleMl = 0
    for (const e of entries) {
      if (e.entry_type !== 'feeding') continue
      const fd = firstOf<FeedingDetail>(e.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.feeding_type === 'bottle') {
        bottle++
        bottleMl += fd.amount_ml ?? 0
      } else if (fd?.feeding_type === 'solid') solid++
      else breast++
    }
    return { breast, bottle, solid, bottleMl, total: breast + bottle + solid }
  }, [entries])

  if (totals.total === 0) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center space-y-2">
        <div className="text-4xl">🤱</div>
        <p className="text-sm font-semibold text-sand-700">אין נתוני האכלה ב{rangeLabel}</p>
        <p className="text-xs text-sand-400">החיתוך משתנה מיד אחרי שמירת האכלה</p>
      </div>
    )
  }

  const avgPerDay = totals.total / dayCount

  function handleBarClick(payload: { date?: string } | undefined) {
    if (payload?.date && onNavigateToDay) onNavigateToDay(payload.date)
  }

  // Sub-stat line — show only subtypes with data.
  const subStats: string[] = []
  if (totals.breast > 0) subStats.push(`הנקה: ${(totals.breast / dayCount).toFixed(1)} ליום`)
  if (totals.bottle > 0) subStats.push(`בקבוק: ${(totals.bottle / dayCount).toFixed(1)} ליום`)
  if (totals.solid > 0) subStats.push(`מוצק: ${(totals.solid / dayCount).toFixed(1)} ליום`)

  return (
    <div className="space-y-4">
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5">
        <p className="text-xs font-semibold text-sand-500 mb-1">ממוצע יומי</p>
        <p className="text-2xl font-bold text-sand-800 leading-none">{avgPerDay.toFixed(1)} <span className="text-sm font-semibold text-sand-500">האכלות</span></p>
        {subStats.length > 0 && (
          <p className="text-xs text-sand-600 mt-3 leading-relaxed">{subStats.join(' · ')}</p>
        )}
        {totals.bottleMl > 0 && (
          <p className="text-[11px] text-sand-400 mt-1">
            סה"כ בקבוק: {totals.bottleMl} מ"ל ב-{dayCount} ימים
          </p>
        )}
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
                reversed
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
                formatter={(value, name) => {
                  const label = name === 'breast' ? 'הנקה' : name === 'bottle' ? 'בקבוק' : 'מוצק'
                  return [`${value ?? 0}`, label]
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { date?: string } | undefined
                  return p?.date ?? ''
                }}
              />
              <Bar dataKey="breast" stackId="f" fill={COLOR_BREAST} onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
              <Bar dataKey="bottle" stackId="f" fill={COLOR_BOTTLE} onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
              <Bar dataKey="solid"  stackId="f" fill={COLOR_SOLID}  onClick={(d) => handleBarClick(d as { date?: string })} style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-3 mt-2 text-[10px] text-sand-500">
          {totals.breast > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_BREAST }} />הנקה</span>}
          {totals.bottle > 0 && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_BOTTLE }} />בקבוק</span>}
          {totals.solid > 0  && <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_SOLID  }} />מוצק</span>}
        </div>
      </div>
    </div>
  )
}
