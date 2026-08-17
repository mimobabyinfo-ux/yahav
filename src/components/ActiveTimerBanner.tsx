import { useEffect, useState, useCallback } from 'react'
import { Pause } from 'lucide-react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatSeconds, timerElapsedSeconds, timerIsPaused, timersForChild } from '../hooks/useActiveTimer'
import type { Page } from '../App'

// Surfaces any running timer no matter which page the user is on.
// Tapping it goes back to that timer's page to stop / save / adjust.
//
// Yahav 11.8.26: this used to be a full-width bar pinned to the top, in
// a blue-to-terracotta gradient that is in no brand palette. It covered
// the top of every screen and looked like an error state. It is now a
// small floating pill in the bottom corner, out of the way of content,
// in the brand's moss green.
//
// It no longer reserves layout space either: --banner-height stays 0, so
// pages don't pad for something that now floats above them.

type Props = {
  onNavigate: (page: Page) => void
  /** Bumps when a timer is stopped elsewhere, so we refetch. */
  refetchKey?: number
}

// Map timer_type → dedicated page. All three Phase-2 timer types are wired.
const PAGE_FOR_TIMER: Record<string, Page | undefined> = {
  sleep: 'log-sleep',
  tummy_time: 'log-tummy',
  feeding: 'log-feeding-breast',
}

const META: Record<string, { emoji: string; label: string }> = {
  sleep: { emoji: '😴', label: 'שינה' },
  feeding: { emoji: '🍼', label: 'האכלה' },
  tummy_time: { emoji: '🤸🏼', label: 'זמן בטן' },
}

export default function ActiveTimerBanner({ onNavigate, refetchKey = 0 }: Props) {
  const { user, selectedChild } = useAuth()
  const [timers, setTimers] = useState<ActiveTimer[]>([])
  const [tick, setTick] = useState(0)

  // Scoped to the BABY, not to the phone. Brenda 17.8.26 asked that a
  // family member opening the share link see the same journal she does,
  // timers included; a timer she started belongs to her account, so
  // filtering by user_id showed the partner an empty bar while a sleep
  // was running. RLS keeps this inside the family (see the
  // active_timers_family_* policies).
  const load = useCallback(async () => {
    if (!user) {
      setTimers([])
      return
    }
    const { data } = await supabase
      .from('active_timers')
      .select('*')
      .order('start_time', { ascending: true })
    setTimers(timersForChild(data, selectedChild?.id))
  }, [user, selectedChild])

  useEffect(() => { load() }, [load, refetchKey])

  // Re-render once a second to update the elapsed display.
  useEffect(() => {
    if (timers.length === 0) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [timers.length])

  // Nothing is pinned to the top any more, so no page needs to pad for
  // it. Kept (at 0) because layouts still read the variable.
  useEffect(() => {
    document.documentElement.style.setProperty('--banner-height', '0px')
  }, [timers.length])

  if (timers.length === 0) return null

  void tick

  return (
    <div
      className="fixed z-[80] flex flex-col items-end"
      style={{
        // Clear of the bottom nav and the iPhone home indicator, on the
        // inline-end side so it never sits over the start of a heading.
        insetInlineEnd: 12,
        bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
        gap: 8,
      }}
      dir="rtl"
    >
      {timers.map(t => {
        const meta = META[t.timer_type] ?? { emoji: '⏱️', label: t.timer_type }
        const targetPage = PAGE_FOR_TIMER[t.timer_type]
        const clickable = targetPage !== undefined
        const paused = timerIsPaused(t)
        return (
          <button
            key={t.id}
            onClick={() => { if (targetPage) onNavigate(targetPage) }}
            disabled={!clickable}
            title={paused ? `${meta.label} בהפסקה` : `${meta.label} פעיל`}
            className="flex items-center transition-all hover:brightness-95 active:scale-95"
            style={{
              gap: 7,
              padding: '7px 12px 7px 10px',
              borderRadius: 9999,
              background: paused ? '#8A8A7A' : '#818267',
              color: '#FFFFFF',
              boxShadow: '0 4px 14px rgba(0,0,0,.18)',
              cursor: clickable ? 'pointer' : 'default',
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>{meta.emoji}</span>
            <span className="font-mono font-bold tabular-nums" style={{ fontSize: 13, lineHeight: 1 }}>
              {formatSeconds(timerElapsedSeconds(t))}
            </span>
            {paused && <Pause className="w-3 h-3 fill-current" />}
            {!paused && (
              // A quiet pulse says "still running" without a second colour.
              <span
                style={{
                  width: 6, height: 6, borderRadius: 9999,
                  background: '#FFFFFF', opacity: .9,
                  animation: 'mimoPulse 1.6s ease-in-out infinite',
                }}
              />
            )}
          </button>
        )
      })}
      <style>{`@keyframes mimoPulse { 0%,100% { opacity:.9 } 50% { opacity:.25 } }`}</style>
    </div>
  )
}
