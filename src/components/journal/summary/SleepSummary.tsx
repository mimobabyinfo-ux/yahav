import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { DailyLogEntryWithDetails, SleepDetail } from '../../../lib/supabase'
import { formatDuration } from '../../../utils/dateUtils'
import { sleepTypeFromStartTime } from '../../../utils/sleepTypeFromTime'
import { ENTRY_COLORS } from '../../DailyTimeline'
import type { Bucket, Granularity } from '../../../hooks/useSummaryData'
import { bucketKeyFor } from '../../../hooks/useSummaryData'

// Sleep tab: total daily-average + nap/night sub-stats + stacked bar chart
// of nap (60% opacity) + night (full opacity) per bucket. Tap a bar →
// navigate to that day in DayView (for weekly buckets, navigate to the
// week's Sunday).

type Props = {
  entries: DailyLogEntryWithDetails[]
  buckets: Bucket[]
  granularity: Granularity
  dayCount: number
  rangeLabel: string                       // for the empty-state message
  onNavigateToDay?: (iso: string) => void
}

const SLEEP_COLOR = ENTRY_COLORS.sleep.dot

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

export default function SleepSummary({ entries, buckets, granularity, dayCount, rangeLabel, onNavigateToDay }: Props) {
  // Aggregate per-bucket nap/night minutes.
  const data = useMemo(() => {
    const map = new Map<string, { date: string; napMins: number; nightMins: number; label: string }>()
    for (const b of buckets) {
      map.set(b.key, { date: b.date, label: b.label, napMins: 0, nightMins: 0 })
    }
    for (const e of entries) {
      if (e.entry_type !== 'sleep') continue
      const key = bucketKeyFor(e.entry_date, granularity)
      const slot = map.get(key)
      if (!slot) continue
      const sd = firstOf<SleepDetail>(e.sleep_details as SleepDetail | SleepDetail[] | null)
      const mins = sd?.duration_minutes ?? 0
      if (mins <= 0) continue
      const kind = resolveSleepKind(e, sd)
      if (kind === 'night') slot.nightMins += mins
      else slot.napMins += mins
    }
    // Convert minutes → hours-as-decimals for the chart Y axis.
    return buckets.map(b => {
      const s = map.get(b.key)!
      return {
        label: b.label,
        date: b.date,
        nap: parseFloat((s.napMins / 60).toFixed(2)),
        night: parseFloat((s.nightMins / 60).toFixed(2)),
        napMins: s.napMins,
        nightMins: s.nightMins,
      }
    })
  }, [entries, buckets, granularity])

  const totals = useMemo(() => {
    const napMins = data.reduce((acc, d) => acc + d.napMins, 0)
    const nightMins = data.reduce((acc, d) => acc + d.nightMins, 0)
    return { napMins, nightMins, total: napMins + nightMins }
  }, [data])

  const noData = totals.total === 0

  if (noData) {
    return (
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-8 text-center space-y-2">
        <div className="text-4xl">😴</div>
        <p className="text-sm font-semibold text-sand-700">אין נתוני שינה ב{rangeLabel}</p>
        <p className="text-xs text-sand-400">החיתוך משתנה מיד אחרי שמירת רשומת שינה</p>
      </div>
    )
  }

  const avgDailyMins = totals.total / dayCount
  const avgNapMins = totals.napMins / dayCount
  const avgNightMins = totals.nightMins / dayCount

  function handleBarClick(payload: { date?: string } | undefined) {
    if (payload?.date && onNavigateToDay) onNavigateToDay(payload.date)
  }

  return (
    <div className="space-y-4">
      {/* BIG number + sub-stats */}
      <div className="bg-[#F5F1EB] rounded-3xl shadow-sm p-5">
        <p className="text-xs font-semibold text-sand-500 mb-1">ממוצע יומי</p>
        <p className="text-2xl font-bold text-sand-800 leading-none">{formatDuration(Math.round(avgDailyMins))}</p>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sand-600">
          <span>שנת לילה: <strong>{formatDuration(Math.round(avgNightMins))}</strong></span>
          <span className="text-sand-300">·</span>
          <span>שנת יום: <strong>{formatDuration(Math.round(avgNapMins))}</strong></span>
        </div>
      </div>

      {/* Stacked bar chart */}
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
                tickFormatter={v => `${v}h`}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ fontSize: 11, border: '1px solid #E5E0D2', borderRadius: 8, direction: 'rtl' }}
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : 0
                  const label = name === 'night' ? 'שנת לילה' : 'שנת יום'
                  return [formatDuration(Math.round(v * 60)), label]
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as { date?: string } | undefined
                  return p?.date ?? ''
                }}
              />
              <Bar
                dataKey="night"
                stackId="sleep"
                fill={SLEEP_COLOR}
                fillOpacity={1}
                onClick={(d) => handleBarClick(d as { date?: string })}
                style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }}
              />
              <Bar
                dataKey="nap"
                stackId="sleep"
                fill={SLEEP_COLOR}
                fillOpacity={0.55}
                onClick={(d) => handleBarClick(d as { date?: string })}
                style={{ cursor: onNavigateToDay ? 'pointer' : 'default' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Legend below the chart */}
        <div className="flex justify-center gap-4 mt-2 text-[10px] text-sand-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: SLEEP_COLOR }} />
            שנת לילה
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: SLEEP_COLOR, opacity: 0.55 }} />
            שנת יום
          </span>
        </div>
      </div>
    </div>
  )
}
