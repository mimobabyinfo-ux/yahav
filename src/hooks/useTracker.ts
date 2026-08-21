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
  // Brenda 21.8.26: "אני רוצה לדעת מה האמהות עשו באפליקציה". Until now the
  // only thing ever written was page_view, so the admin could see that a
  // mother reached קהילה and nothing about what she did once she was
  // there. These are the moments that actually answer the question —
  // deliberately few, and each one a decision she made, not a screen she
  // passed through.
  | 'event_open'          // opened a community event card
  | 'event_register'      // registered for one
  | 'community_tab'       // אירועים / ההזמנות שלי / חברות
  | 'member_open'         // opened another mother's profile
  | 'product_open'        // opened a product sheet in the store
  | 'product_pay_click'   // went out to pay / to the registration page
  | 'gift_card_open'      // opened the gift card sheet
  | 'perk_open'           // opened a partner perk

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
      })
      // last_active is NOT written from here any more. This update ran on
      // every event and failed silently for every mother — 0 of 57
      // profiles ever got a value. It is now a trigger on user_activities
      // (migration last_active_from_activity_trigger), which cannot fail
      // quietly and costs the client nothing.
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
