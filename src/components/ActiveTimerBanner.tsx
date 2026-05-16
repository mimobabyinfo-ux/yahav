import { useEffect, useState, useCallback } from 'react'
import { Square } from 'lucide-react'
import { supabase, ActiveTimer } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatElapsed } from '../utils/dateUtils'
import type { Page } from '../App'

// App-level banner that surfaces any running timer no matter which page
// the user is on. Tapping it navigates back to that timer's dedicated
// action page so the user can stop / save / adjust.
//
// Renders nothing when no timers are running. When at least one is, it
// pins to the top and sets a `--banner-height` CSS variable on the
// document root so layouts (BottomNav-aware pages, action pages) can
// adjust their top padding.

type Props = {
  onNavigate: (page: Page) => void
  /** Bumps when a timer is stopped elsewhere, so we refetch. */
  refetchKey?: number
}

const BANNER_HEIGHT_PX = 36

// Map timer_type → dedicated page (only sleep is wired in Phase 2 step 1;
// the rest will route here as each page lands).
const PAGE_FOR_TIMER: Record<string, Page | undefined> = {
  sleep: 'log-sleep',
}

const META: Record<string, { emoji: string; label: string }> = {
  sleep: { emoji: '😴', label: 'שינה' },
  feeding: { emoji: '🍼', label: 'האכלה' },
  tummy_time: { emoji: '🐣', label: 'זמן בטן' },
}

export default function ActiveTimerBanner({ onNavigate, refetchKey = 0 }: Props) {
  const { user } = useAuth()
  const [timers, setTimers] = useState<ActiveTimer[]>([])
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    if (!user) {
      setTimers([])
      return
    }
    const { data } = await supabase
      .from('active_timers')
      .select('*')
      .eq('user_id', user.id)
      .order('start_time', { ascending: true })
    setTimers(data ?? [])
  }, [user])

  useEffect(() => { load() }, [load, refetchKey])

  // Re-render once a second to update the elapsed display.
  useEffect(() => {
    if (timers.length === 0) return
    const i = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [timers.length])

  // Refresh the banner state when the tab regains focus (e.g. user
  // closes/reopens the app — their timer should still be there).
  useEffect(() => {
    function onFocus() { load() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // Expose banner height to the rest of the layout via CSS variable.
  useEffect(() => {
    if (timers.length > 0) {
      document.documentElement.style.setProperty('--banner-height', `${BANNER_HEIGHT_PX}px`)
    } else {
      document.documentElement.style.removeProperty('--banner-height')
    }
    return () => {
      document.documentElement.style.removeProperty('--banner-height')
    }
  }, [timers.length])

  if (timers.length === 0) return null

  // For Phase 2 step 1, we show one banner row per running timer. Each is
  // tappable to navigate to its page. Force a re-render reference via tick
  // for the elapsed display (eslint won't complain since we use it).
  void tick

  return (
    <div className="fixed top-0 right-0 left-0 z-[80] max-w-[480px] mx-auto" dir="rtl">
      {timers.map(t => {
        const meta = META[t.timer_type] ?? { emoji: '⏱️', label: t.timer_type }
        const targetPage = PAGE_FOR_TIMER[t.timer_type]
        const clickable = targetPage !== undefined
        return (
          <button
            key={t.id}
            onClick={() => { if (targetPage) onNavigate(targetPage) }}
            disabled={!clickable}
            className="w-full flex items-center justify-between gap-3 px-4 text-white"
            style={{
              height: BANNER_HEIGHT_PX,
              background: 'linear-gradient(135deg, #5C7CB8, #A35C3D)',
              cursor: clickable ? 'pointer' : 'default',
            }}
          >
            <span className="flex items-center gap-2 text-xs font-semibold">
              <span className="text-base leading-none">{meta.emoji}</span>
              <span>{meta.label} פעיל</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-mono font-bold tabular-nums">
              <Square className="w-2.5 h-2.5 fill-current" />
              {formatElapsed(t.start_time)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
