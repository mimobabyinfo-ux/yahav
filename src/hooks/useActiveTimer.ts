import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Shared hook around the `active_timers` table for the dedicated action pages
// (SleepPage, BreastfeedingPage, TummyTimePage, …) and the global
// ActiveTimerBanner. Returns the currently-running timer of the given type
// (or any type, if `type` is omitted) plus helpers to start / stop / update.
//
// Timers are persisted server-side so closing/reopening the app keeps the
// elapsed counter running — the page just polls active_timers on mount.

type AdditionalData = Record<string, unknown>

export function useActiveTimer(type?: string) {
  const { user } = useAuth()
  const [timer, setTimer] = useState<ActiveTimer | null>(null)
  const [loading, setLoading] = useState(true)
  // Used for the live elapsed display. We tick a counter once per second
  // and let consumers derive elapsed seconds from timer.start_time.
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

  // Tick once per second only when a timer is running, so the page can
  // re-render an MM:SS display via elapsedSeconds().
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
    const { data } = await supabase
      .from('active_timers')
      .insert({
        user_id: user.id,
        timer_type: timerType,
        start_time: new Date().toISOString(),
        additional_data: additionalData ?? null,
      })
      .select()
      .single()
    if (data) setTimer(data)
    return data
  }, [user])

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

  // Seconds since the timer's start_time. 0 if no timer.
  const elapsedSeconds = (): number => {
    if (!timer) return 0
    return Math.max(0, Math.floor((Date.now() - new Date(timer.start_time).getTime()) / 1000))
  }

  return { timer, loading, start, update, remove, reload: load, elapsedSeconds }
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
