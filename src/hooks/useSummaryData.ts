import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase, DailyLogEntryWithDetails } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate } from '../utils/dateUtils'

// Phase 3 / C6: single fetch + bucket-generation hook for the Summary
// view. Each sub-tab (Sleep / Feeding / Solid / Diaper) takes the raw
// entries + bucket list and computes its own per-bucket aggregates;
// keeps this hook generic and the per-tab math inline.

export type SummaryRange = '7d' | '14d' | '30d' | '90d' | '1y'
export type Granularity = 'daily' | 'weekly'

// Days covered by each range. Used for both the fetch window and the
// "average per day" denominator on each sub-tab's BIG number.
const RANGE_DAYS: Record<SummaryRange, number> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
  '1y': 365,
}

// Granularity threshold. 7/14/30 → daily bars (max 30 bars at 480px).
// 90/1Y → weekly (~13 and ~53 bars respectively; readable with
// recharts interval thinning).
function granularityFor(range: SummaryRange): Granularity {
  return range === '90d' || range === '1y' ? 'weekly' : 'daily'
}

export type Bucket = {
  /** Stable identifier — entry_date for daily buckets, Sunday-of-week
   *  for weekly buckets. */
  key: string
  /** The bucket's start date as YYYY-MM-DD. */
  date: string
  /** Short label for the X-axis (e.g. "15/12"). */
  label: string
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

function ddmmLabel(iso: string): string {
  // Compact label for X-axis ticks. No leading zero on month so
  // dense charts (90D/1Y) don't run out of horizontal room. e.g.
  // "15/2" rather than "15/02".
  const d = new Date(iso + 'T12:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

// Walk back from `iso` to the Sunday of that week (Israeli convention).
function sundayOnOrBefore(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return formatDate(d)
}

// Build the per-bucket list spanning [from, to].
function buildBuckets(fromIso: string, toIso: string, granularity: Granularity): Bucket[] {
  const out: Bucket[] = []
  if (granularity === 'daily') {
    const fromD = new Date(fromIso + 'T12:00:00')
    const toD = new Date(toIso + 'T12:00:00')
    let cur = fromD
    while (cur <= toD) {
      const iso = formatDate(cur)
      out.push({ key: iso, date: iso, label: ddmmLabel(iso) })
      cur = addDays(cur, 1)
    }
  } else {
    // Weekly: start from the Sunday on or before `from`.
    let cur = new Date(sundayOnOrBefore(fromIso) + 'T12:00:00')
    const toD = new Date(toIso + 'T12:00:00')
    while (cur <= toD) {
      const iso = formatDate(cur)
      out.push({ key: iso, date: iso, label: ddmmLabel(iso) })
      cur = addDays(cur, 7)
    }
  }
  return out
}

// Bucket-key for an entry's date — daily = the entry_date itself,
// weekly = the Sunday of that week.
export function bucketKeyFor(entryDate: string, granularity: Granularity): string {
  return granularity === 'daily' ? entryDate : sundayOnOrBefore(entryDate)
}

type Result = {
  loading: boolean
  granularity: Granularity
  buckets: Bucket[]
  entries: DailyLogEntryWithDetails[]
  dayCount: number  // total days in the range (the "avg per day" denominator)
  from: string
  to: string
}

export function useSummaryData(range: SummaryRange, refetchKey: number): Result {
  const { user, selectedChild, profile } = useAuth()
  const [entries, setEntries] = useState<DailyLogEntryWithDetails[]>([])
  const [loading, setLoading] = useState(true)

  // Compute the range window (deterministic per `range`).
  const { from, to, granularity, dayCount } = useMemo(() => {
    const days = RANGE_DAYS[range]
    const today = formatDate(new Date())
    const fromDate = formatDate(addDays(new Date(today + 'T12:00:00'), -(days - 1)))
    return {
      from: fromDate,
      to: today,
      granularity: granularityFor(range),
      dayCount: days,
    }
  }, [range])

  const buckets = useMemo(() => buildBuckets(from, to, granularity), [from, to, granularity])

  const getFamilyUserIds = useCallback(async (): Promise<string[]> => {
    if (!user) return []
    if (!profile?.family_id) return [user.id]
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('family_id', profile.family_id)
    return data?.map(r => r.id) ?? [user.id]
  }, [user, profile?.family_id])

  const load = useCallback(async () => {
    if (!user) {
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    let query = supabase
      .from('daily_log_entries')
      .select(`*, feeding_details(*), sleep_details(*), diaper_details(*)`)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date')
    if (selectedChild) {
      query = query.eq('child_id', selectedChild.id)
    } else {
      const userIds = await getFamilyUserIds()
      query = query.in('user_id', userIds)
    }
    const { data } = await query
    setEntries((data ?? []) as DailyLogEntryWithDetails[])
    setLoading(false)
  }, [user, selectedChild, from, to, getFamilyUserIds])

  useEffect(() => { load() }, [load, refetchKey])

  return { loading, granularity, buckets, entries, dayCount, from, to }
}
