import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

// Stable session ID for this browser tab
const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`

export type EventType =
  | 'page_view'
  | 'button_click'
  | 'video_start'
  | 'video_end'
  | 'coupon_copy'
  | 'session_end'
  | 'workshop_open'
  | 'next_workshop_modal_open'
  | 'next_workshop_payment_click'
  | 'next_workshop_question_click'
  | 'perk_view'
  | 'perk_copy_code'
  | 'perk_visit_link'
  // Digital course: which lesson she opened, and which she marked done.
  | 'lesson_open'
  | 'lesson_complete'
  // Community tutorials: which app-explainer clip she opened.
  | 'tutorial_open'

export type EventData = Record<string, string | number | boolean | null>

export function useTracker() {
  const { user } = useAuth()

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

  // There used to be a session_end write here, on beforeunload, via a
  // SYNCHRONOUS XMLHttpRequest — the browser blocked on it every time she
  // closed the tab or switched away. And it authenticated with the anon
  // key rather than her token, so RLS rejected it: the app was freezing on
  // a request that recorded nothing. Removed rather than repaired; a
  // session_end row is not worth a stalled unload, and session length can
  // be derived from the page events we already write.

  return { track }
}
