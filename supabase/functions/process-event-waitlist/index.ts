// Edge Function: process-event-waitlist
//
// Runs every 10 minutes (pg_cron). Two jobs, in this order:
//
//   1. Close offers whose hour ran out. That woman is out of the queue
//      for this event; she had her turn.
//   2. For every event that now has a free seat and someone waiting,
//      give the seat to the first in line for one hour and tell her.
//
// The hour is enforced in event_seats_taken, not here: while an offer
// is live the event reads as full to everyone else, so nobody can take
// the seat out from under her.
//
// Ten minutes of latency between a cancellation and the notification is
// the deliberate trade. A trigger would fire instantly but would have
// to reach outside the database to send a push, and that is the kind of
// coupling that breaks quietly at 2am.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONTACT = 'mailto:mimobaby.info@gmail.com'
const FALLBACK_PUBLIC_KEY = 'BCBpBpEnxebSm2byEJl4vaJVMkPBCgOyXlUZQ_UtXfczlN99F-WgOcbXE8MaVDJzJH_ecr4u_kqAmMMHx5dsQ9g'

type Due = {
  waitlist_id: string
  user_id: string
  event_id: string
  event_title: string
  event_emoji: string | null
  event_date: string
  endpoint: string | null
  p256dh: string | null
  auth: string | null
}

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? FALLBACK_PUBLIC_KEY
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: expired, error: expErr } = await supabase.rpc('expire_waitlist_offers')
  if (expErr) {
    return new Response(JSON.stringify({ error: expErr.message }), { status: 500 })
  }

  const { data, error } = await supabase.rpc('waitlist_offers_due')
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const rows = (data ?? []) as Due[]

  // One offer per waitlist row, even when she has three devices.
  const byWaitlist = new Map<string, Due[]>()
  for (const r of rows) {
    const list = byWaitlist.get(r.waitlist_id) ?? []
    list.push(r)
    byWaitlist.set(r.waitlist_id, list)
  }

  const canPush = !!VAPID_PRIVATE
  if (canPush) webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE!)

  let offered = 0
  let pushed = 0
  let silent = 0
  const failures: string[] = []

  for (const [waitlistId, group] of byWaitlist) {
    const first = group[0]

    const { error: offerErr } = await supabase.rpc('open_waitlist_offer', { p_waitlist_id: waitlistId })
    if (offerErr) { failures.push(`offer ${waitlistId}: ${offerErr.message}`); continue }
    offered++

    const subs = group.filter(g => g.endpoint && g.p256dh && g.auth)
    if (subs.length === 0 || !canPush) {
      // She has no notifications on. The seat is still hers for the
      // hour; she will see it if she opens the app. Counted so Brenda
      // can see how often this happens.
      silent++
      continue
    }

    const payload = JSON.stringify({
      title: `התפנה מקום! ${first.event_emoji ?? '🤎'} ${first.event_title}`,
      body: 'המקום שמור לך לשעה הקרובה. משלימות תשלום ואת בפנים',
      url: '/?tab=community&sub=events',
      tag: `waitlist-${first.event_id}`,
    })

    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint!, keys: { p256dh: s.p256dh!, auth: s.auth! } },
          payload,
        )
        pushed++
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions')
            .update({ failed_at: new Date().toISOString() })
            .eq('endpoint', s.endpoint!)
        } else {
          failures.push(`${status ?? '?'} ${String(e).slice(0, 120)}`)
        }
      }
    }
  }

  const summary = { expired: expired ?? 0, offered, pushed, silent, failures }
  console.log('[process-event-waitlist]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
