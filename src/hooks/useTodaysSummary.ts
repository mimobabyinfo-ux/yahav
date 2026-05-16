import { useState, useEffect, useCallback } from 'react'
import { supabase, FeedingDetail, SleepDetail, DiaperDetail } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate } from '../utils/dateUtils'

// One-shot aggregate of today's entries for the dashboard's "Today's Journal"
// panel. Fires a single embedded-join query against daily_log_entries,
// then reduces it client-side into the 4-row shape the panel renders.
//
// Re-runs on:
//  - mount
//  - refetchKey bump (parent passes this — typically wired to the same
//    counter that drives useLastEntry for the quick-add bar)
//  - window focus (so navigating away and back picks up new entries)

export type TodaysSummary = {
  loading: boolean
  feeding: {
    count: number
    last: Date | null
    breast: { count: number; totalSeconds: number } | null
    bottle: { count: number; totalMl: number } | null
    solid: { count: number } | null
  }
  sleep: { count: number; totalMinutes: number; last: Date | null }
  diaper: {
    count: number
    last: Date | null
    wet: number
    dirty: number
    both: number
    dry: number
  }
  tummy: { count: number; last: Date | null }
  hasAny: boolean
}

function emptySummary(loading: boolean): TodaysSummary {
  return {
    loading,
    feeding: { count: 0, last: null, breast: null, bottle: null, solid: null },
    sleep: { count: 0, totalMinutes: 0, last: null },
    diaper: { count: 0, last: null, wet: 0, dirty: 0, both: 0, dry: 0 },
    tummy: { count: 0, last: null },
    hasAny: false,
  }
}

// Combine entry_date (YYYY-MM-DD) + entry_time (HH:MM[:SS]) into a Date.
// Same parse pattern as useLastEntry.
function parseEntryDateTime(date: string, time: string): Date | null {
  const t = time && time.length === 5 ? `${time}:00` : time
  const dt = new Date(`${date}T${t}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export function useTodaysSummary(refetchKey: number = 0): TodaysSummary {
  const { user, selectedChild } = useAuth()
  const [summary, setSummary] = useState<TodaysSummary>(() => emptySummary(true))

  const load = useCallback(async () => {
    if (!user || !selectedChild) {
      setSummary(emptySummary(false))
      return
    }

    const today = formatDate(new Date())
    const { data } = await supabase
      .from('daily_log_entries')
      .select('id, entry_type, entry_time, entry_date, feeding_details(*), sleep_details(*), diaper_details(*)')
      .eq('child_id', selectedChild.id)
      .eq('entry_date', today)

    // PostgREST embeds return detail tables as arrays even when there's
    // a 1:1 FK (no unique constraint is enforced at the FK level). The
    // existing JournalPage uses `select('*')` which lets TypeScript stay
    // permissive; our selective column list is stricter, so we declare
    // a local row shape and unwrap the arrays manually below.
    type Row = {
      id: string
      entry_type: string
      entry_time: string
      entry_date: string
      feeding_details: FeedingDetail[] | FeedingDetail | null
      sleep_details: SleepDetail[] | SleepDetail | null
      diaper_details: DiaperDetail[] | DiaperDetail | null
    }
    const firstOf = <T,>(v: T[] | T | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const rows = (data ?? []) as unknown as Row[]
    const next = emptySummary(false)
    next.hasAny = rows.length > 0

    for (const row of rows) {
      const when = parseEntryDateTime(row.entry_date, row.entry_time)

      if (row.entry_type === 'feeding') {
        next.feeding.count++
        if (when && (!next.feeding.last || when > next.feeding.last)) {
          next.feeding.last = when
        }
        const det = firstOf(row.feeding_details)
        if (det) {
          if (det.feeding_type === 'breast') {
            // Prefer the per-side seconds when present (Phase 2 schema).
            // Fall back to duration_minutes for legacy breast entries that
            // pre-date migration 20260524.
            const perSide =
              (det.left_duration_seconds ?? 0) + (det.right_duration_seconds ?? 0)
            const seconds = perSide > 0
              ? perSide
              : det.duration_minutes != null
                ? Math.round(det.duration_minutes * 60)
                : 0
            next.feeding.breast = {
              count: (next.feeding.breast?.count ?? 0) + 1,
              totalSeconds: (next.feeding.breast?.totalSeconds ?? 0) + seconds,
            }
          } else if (det.feeding_type === 'bottle') {
            next.feeding.bottle = {
              count: (next.feeding.bottle?.count ?? 0) + 1,
              totalMl: (next.feeding.bottle?.totalMl ?? 0) + (det.amount_ml ?? 0),
            }
          } else if (det.feeding_type === 'solid') {
            next.feeding.solid = { count: (next.feeding.solid?.count ?? 0) + 1 }
          }
        }
      } else if (row.entry_type === 'sleep') {
        next.sleep.count++
        if (when && (!next.sleep.last || when > next.sleep.last)) {
          next.sleep.last = when
        }
        const det = firstOf(row.sleep_details)
        if (det?.duration_minutes != null) {
          next.sleep.totalMinutes += det.duration_minutes
        }
      } else if (row.entry_type === 'diaper') {
        next.diaper.count++
        if (when && (!next.diaper.last || when > next.diaper.last)) {
          next.diaper.last = when
        }
        const t = firstOf(row.diaper_details)?.diaper_type
        if (t === 'wet') next.diaper.wet++
        else if (t === 'dirty') next.diaper.dirty++
        else if (t === 'both') next.diaper.both++
        else if (t === 'dry') next.diaper.dry++
      } else if (row.entry_type === 'tummy_time') {
        next.tummy.count++
        if (when && (!next.tummy.last || when > next.tummy.last)) {
          next.tummy.last = when
        }
      }
    }

    setSummary(next)
  }, [user, selectedChild])

  useEffect(() => { load() }, [load, refetchKey])

  // Re-fetch when the tab regains focus — a "navigate away and back"
  // surfaces freshly-saved entries without manual refresh.
  useEffect(() => {
    function onFocus() { load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  return summary
}
