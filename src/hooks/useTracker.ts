import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Stable session ID for this browser tab
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`

type EventType =
  | 'page_view'
  | 'button_click'
  | 'video_start'
  | 'video_end'
  | 'coupon_copy'
  | 'session_end'

type EventData = Record<string, string | number | boolean | null>

export function useTracker() {
  const { user } = useAuth()
  const sessionStart = useRef(Date.now())

  const track = useCallback(
    async (event_type: EventType, event_data?: EventData) => {
      if (!user) return
      // Fire-and-forget — don't await in hot paths
      supabase.from('user_activities').insert({
        user_id: user.id,
        session_id: SESSION_ID,
        event_type,
        event_data: event_data ?? null,
      }).then(() => {
        // Also update last_active on the profile (debounced by ignoring errors)
        supabase.from('user_profiles')
          .update({ last_active: new Date().toISOString() })
          .eq('id', user.id)
      })
    },
    [user]
  )

  // Track session end on tab close / unmount
  useEffect(() => {
    if (!user) return
    const handleUnload = () => {
      const duration_s = Math.round((Date.now() - sessionStart.current) / 1000)
      // Use sendBeacon for reliable delivery on page close
      const payload = JSON.stringify({
        user_id: user.id,
        session_id: SESSION_ID,
        event_type: 'session_end',
        event_data: { duration_s },
      })
      if (typeof navigator.sendBeacon === 'function') {
        // sendBeacon to Supabase REST requires auth header — fall back to sync XHR
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_activities`
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url, false) // synchronous
        xhr.setRequestHeader('Content-Type', 'application/json')
        xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
        xhr.setRequestHeader('Authorization', `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`)
        try { xhr.send(payload) } catch { /* best-effort */ }
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [user])

  return { track }
}
