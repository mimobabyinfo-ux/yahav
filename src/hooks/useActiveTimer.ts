import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Shared hook around the `active_timers` table for the dedicated action pages
// (SleepPage, BreastfeedingPage, TummyTimePage, …) and the global
// ActiveTimerBanner. Returns the currently-running timer of the given type
// (or any type, if `type` is omitted) plus helpers to start / pause /
// resume / save / delete the session.
//
// Timers are persisted server-side so closing/reopening the app keeps the
// elapsed counter running — the page just polls active_timers on mount.
//
// ── Pause/resume schema ────────────────────────────────────────────────────
// additional_data stores two extra keys that drive the segmented timer:
//   - accumulated_seconds: number    — committed time from finished segments
//   - segment_started_at:  ISO|null  — when current segment started; null = paused
// Live elapsed = accumulated_seconds + (segment_started_at ? now − segment_started_at : 0)
//
// Legacy rows (timers created by ActivityTimers.startTimer or by code before
// this PR) have NEITHER key. The helpers treat them as "fresh running session
// from row.start_time" so the page can pick up an in-flight legacy timer
// without crashing.

type AdditionalData = Record<string, unknown>

// ── Pure helpers (also exported for the banner / page components) ──────────

// Detect the per-side breastfeeding schema by the presence of any of its
// dedicated keys. BreastfeedingPage stores active_side / left_accumulated_seconds
// / right_accumulated_seconds / side_started_at. We check the union of those
// keys so a half-written row still routes correctly.
function isPerSideFeedingSchema(data: AdditionalData): boolean {
  return (
    'active_side' in data ||
    'left_accumulated_seconds' in data ||
    'right_accumulated_seconds' in data ||
    'side_started_at' in data
  )
}

export function timerIsPaused(timer: ActiveTimer): boolean {
  const data = (timer.additional_data ?? {}) as AdditionalData
  if (isPerSideFeedingSchema(data)) {
    // Breast feeding: paused when no side is active.
    return data.active_side == null
  }
  // Single-segment schema (sleep, tummy): paused iff segment_started_at is null.
  if ('segment_started_at' in data) return data.segment_started_at === null
  // Legacy: always running.
  return false
}

export function timerElapsedSeconds(timer: ActiveTimer): number {
  const data = (timer.additional_data ?? {}) as AdditionalData

  // Per-side breastfeeding schema → total = L_acc + R_acc + active segment delta.
  if (isPerSideFeedingSchema(data)) {
    const left = typeof data.left_accumulated_seconds === 'number' ? data.left_accumulated_seconds : 0
    const right = typeof data.right_accumulated_seconds === 'number' ? data.right_accumulated_seconds : 0
    const segStr = data.side_started_at
    const activeSide = data.active_side
    if (typeof segStr !== 'string' || activeSide == null) {
      return Math.max(0, Math.floor(left + right))
    }
    const segMs = new Date(segStr).getTime()
    if (Number.isNaN(segMs)) return Math.max(0, Math.floor(left + right))
    return Math.max(0, Math.floor(left + right + (Date.now() - segMs) / 1000))
  }

  const hasNewSchema = 'segment_started_at' in data || 'accumulated_seconds' in data

  if (!hasNewSchema) {
    // Legacy timer — count from row.start_time, no paused state.
    return Math.max(0, Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000))
  }

  const acc = typeof data.accumulated_seconds === 'number' ? data.accumulated_seconds : 0
  const segStr = data.segment_started_at
  if (typeof segStr !== 'string') return Math.max(0, Math.floor(acc))
  const segMs = new Date(segStr).getTime()
  if (Number.isNaN(segMs)) return Math.max(0, Math.floor(acc))
  return Math.max(0, Math.floor(acc + (Date.now() - segMs) / 1000))
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useActiveTimer(type?: string) {
  const { user } = useAuth()
  const [timer, setTimer] = useState<ActiveTimer | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)
  const tickRef = useRef<number | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setTimer(null)
      setLoading(false)
      return
    }
    let q = supabase
      .from('active_timers')
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: false })
      .limit(1)
    if (type) q = q.eq('timer_type', type)
    const { data } = await q
    setTimer(data?.[0] ?? null)
    setLoading(false)
  }, [user, type])

  useEffect(() => { load() }, [load])

  // Tick once per second while a timer is loaded. We tick even when paused
  // (the helpers return a stable value) — cheaper than re-syncing intervals
  // on every pause/resume.
  useEffect(() => {
    if (!timer) {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      return
    }
    tickRef.current = window.setInterval(() => setTick(t => t + 1), 1000)
    return () => {
      if (tickRef.current !== null) clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [timer])

  const start = useCallback(async (
    timerType: string,
    additionalData?: AdditionalData,
  ): Promise<ActiveTimer | null> => {
    if (!user) return null
    const merged: AdditionalData = {
      ...(additionalData ?? {}),
      accumulated_seconds: 0,
      segment_started_at: new Date().toISOString(),
    }
    const { data } = await supabase
      .from('active_timers')
      .insert({
        user_id: user.id,
        timer_type: timerType,
        start_time: new Date().toISOString(),
        additional_data: merged,
      })
      .select()
      .single()
    if (data) setTimer(data)
    return data
  }, [user])

  // Commit the current segment to accumulated_seconds and clear segment_started_at.
  // No-op if already paused.
  const pause = useCallback(async (): Promise<void> => {
    if (!timer) return
    const data = (timer.additional_data ?? {}) as AdditionalData
    const hasNewSchema = 'segment_started_at' in data
    // Already paused — nothing to do.
    if (hasNewSchema && data.segment_started_at === null) return

    // Legacy rows (created by ActivityTimers.startTimer or by code from
    // before this PR) don't carry segment_started_at. Treat them as a fresh
    // running session that began at row.start_time, so pause still works.
    const segMs = hasNewSchema && typeof data.segment_started_at === 'string'
      ? new Date(data.segment_started_at).getTime()
      : new Date(timer.start_time).getTime()
    const acc = typeof data.accumulated_seconds === 'number' ? data.accumulated_seconds : 0
    const addedSecs = Math.max(0, (Date.now() - segMs) / 1000)
    const merged: AdditionalData = {
      ...data,
      accumulated_seconds: acc + addedSecs,
      segment_started_at: null,
    }
    await supabase.from('active_timers').update({ additional_data: merged }).eq('id', timer.id)
    setTimer({ ...timer, additional_data: merged })
  }, [timer])

  // Set segment_started_at = now. No-op if already running.
  const resume = useCallback(async (): Promise<void> => {
    if (!timer) return
    const data = (timer.additional_data ?? {}) as AdditionalData
    // Already running — nothing to do.
    if (typeof data.segment_started_at === 'string') return
    const merged: AdditionalData = {
      ...data,
      // Preserve accumulated_seconds; default to 0 for half-migrated rows.
      accumulated_seconds: typeof data.accumulated_seconds === 'number' ? data.accumulated_seconds : 0,
      segment_started_at: new Date().toISOString(),
    }
    await supabase.from('active_timers').update({ additional_data: merged }).eq('id', timer.id)
    setTimer({ ...timer, additional_data: merged })
  }, [timer])

  const update = useCallback(async (id: string, additionalData: AdditionalData) => {
    await supabase
      .from('active_timers')
      .update({ additional_data: additionalData })
      .eq('id', id)
    setTimer(t => (t && t.id === id ? { ...t, additional_data: additionalData } : t))
  }, [])

  const remove = useCallback(async (id: string) => {
    await supabase.from('active_timers').delete().eq('id', id)
    setTimer(t => (t && t.id === id ? null : t))
  }, [])

  const elapsedSeconds = (): number => (timer ? timerElapsedSeconds(timer) : 0)
  const paused = timer ? timerIsPaused(timer) : false

  return {
    timer,
    loading,
    paused,
    start,
    pause,
    resume,
    update,
    remove,
    reload: load,
    elapsedSeconds,
  }
}

// Format seconds → "MM:SS" or "HH:MM:SS"
export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`
  return `${pad(m)}:${pad(sec)}`
}
