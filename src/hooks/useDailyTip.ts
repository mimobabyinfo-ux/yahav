import { useState, useEffect, useCallback } from 'react'
import { supabase, DailyTip } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, getBabyAge } from '../utils/dateUtils'
import { pregnancyWeek } from '../utils/pregnancyWeek'
import { djb2 } from '../utils/hashString'

// Picks one daily tip for the current user, matched to either the
// selected child's age (mom mode) or the current pregnancy week
// (pregnancy mode). Selection is deterministic per day per user/child,
// so the tip doesn't reshuffle on every navigation back to the dashboard.
//
// Selection seed:
//   mom mode       → `${today_iso}-${selectedChild.id}`
//   pregnancy mode → `${today_iso}-${user.id}`
// djb2(seed) mod matches.length → stable index.

export type DailyTipResult = {
  loading: boolean
  tip: DailyTip | null
  /** Header chip text, e.g. "יגדי בן 2 חודשים" or "שבוע 24". Empty if mode
   *  unresolved (no child / no due_date). */
  label: string
}

function babyAgeDays(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / 86400000)
}

function labelForMom(name: string | null, gender: 'boy' | 'girl' | 'other' | null, dob: string): string {
  const age = getBabyAge(dob)
  const subject = name ?? 'התינוק/ת'
  // Hebrew gendering: בן / בת. 'other' or null → omit the gendered word.
  const linker = gender === 'boy' ? 'בן' : gender === 'girl' ? 'בת' : null
  return linker ? `${subject} ${linker} ${age}` : `${subject} · ${age}`
}

function labelForPregnancy(week: number): string {
  return `שבוע ${week}`
}

export function useDailyTip(): DailyTipResult {
  const { user, profile, selectedChild } = useAuth()
  const [result, setResult] = useState<DailyTipResult>({ loading: true, tip: null, label: '' })

  const load = useCallback(async () => {
    if (!user || !profile) {
      setResult({ loading: false, tip: null, label: '' })
      return
    }

    const today = formatDate(new Date())

    // ── Mom mode ──────────────────────────────────────────────────────
    if (profile.user_mode === 'mom') {
      if (!selectedChild?.dob) {
        setResult({ loading: false, tip: null, label: '' })
        return
      }
      const ageDays = babyAgeDays(selectedChild.dob)
      const { data } = await supabase
        .from('daily_tips')
        .select('*')
        .eq('is_active', true)
        .eq('tip_for', 'mom')
        .lte('age_range_start_days', ageDays)
        .gte('age_range_end_days', ageDays)
        .order('id') // stable order for the hash → index mapping
      const matches = (data ?? []) as DailyTip[]
      if (matches.length === 0) {
        setResult({ loading: false, tip: null, label: '' })
        return
      }
      const seed = `${today}-${selectedChild.id}`
      const idx = djb2(seed) % matches.length
      setResult({
        loading: false,
        tip: matches[idx],
        label: labelForMom(selectedChild.name, selectedChild.gender, selectedChild.dob),
      })
      return
    }

    // ── Pregnancy mode ────────────────────────────────────────────────
    if (profile.user_mode === 'pregnant') {
      if (!profile.due_date) {
        setResult({ loading: false, tip: null, label: '' })
        return
      }
      const week = pregnancyWeek(profile.due_date)
      const { data } = await supabase
        .from('daily_tips')
        .select('*')
        .eq('is_active', true)
        .eq('tip_for', 'pregnancy')
        .lte('pregnancy_week_start', week)
        .gte('pregnancy_week_end', week)
        .order('id')
      const matches = (data ?? []) as DailyTip[]
      if (matches.length === 0) {
        setResult({ loading: false, tip: null, label: '' })
        return
      }
      const seed = `${today}-${user.id}`
      const idx = djb2(seed) % matches.length
      setResult({
        loading: false,
        tip: matches[idx],
        label: labelForPregnancy(week),
      })
      return
    }

    // No mode set (shouldn't happen post-onboarding) → no tip.
    setResult({ loading: false, tip: null, label: '' })
  }, [user, profile, selectedChild])

  useEffect(() => { load() }, [load])

  return result
}
