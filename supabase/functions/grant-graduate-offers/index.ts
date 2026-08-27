// Edge Function: grant-graduate-offers
//
// Runs daily (pg_cron, 18:00 Jerusalem). Two steps, in order:
//
//   1. grant_graduate_offers(3) — every mother whose cohort's last meeting
//      was today (three days back, so a missed run catches up) is minted
//      her own discount link: a clone of the template offer, max_uses = 1,
//      valid for a week from the last meeting. Brenda 27.8.26: the week is
//      deliberate, "כדיי לעודד להירשם ישר".
//
//   2. Push — a mother who turned notifications on hears about it on her
//      phone. Everyone else meets it in the app: the store shows the
//      discounted price and the home screen shows the news once.
//
// Idempotent twice over: the grant step skips a mother who already has a
// grant for this pair of workshops, and the push step is filtered by
// push_notification_log (kind 'graduate_offer', ref_id = grant id), so
// running the job again sends nothing.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONTACT = 'mailto:mimobaby.info@gmail.com'

// Must match src/utils/webPush.ts, or subscriptions made by the app are
// unreadable here.
const FALLBACK_PUBLIC_KEY = 'BCBpBpEnxebSm2byEJl4vaJVMkPBCgOyXlUZQ_UtXfczlN99F-WgOcbXE8MaVDJzJH_ecr4u_kqAmMMHx5dsQ9g'

type Target = {
  grant_id: string
  user_id: string
  workshop_title: string
  discount_type: 'percent' | 'fixed'
  discount_value: number
  endpoint: string
  p256dh: string
  auth: string
}

function discountText(t: Target): string {
  return t.discount_type === 'percent'
    ? `${Number(t.discount_value)}% הנחה`
    : `מחיר מיוחד ₪${Number(t.discount_value)}`
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? FALLBACK_PUBLIC_KEY
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  // Allow a manual backfill: POST {"days_back": 400}. The default keeps
  // the daily run cheap.
  let daysBack = 3
  try {
    const body = await req.json()
    if (typeof body?.days_back === 'number') daysBack = body.days_back
  } catch { /* cron sends no body */ }

  const { data: granted, error: grantError } = await supabase
    .rpc('grant_graduate_offers', { p_days_back: daysBack })
  if (grantError) {
    console.error('[grant-graduate-offers] grant failed', grantError.message)
    return new Response(JSON.stringify({ error: grantError.message }), { status: 500 })
  }

  // Push is best effort. A missing VAPID key must not undo the grants.
  if (!VAPID_PRIVATE) {
    const summary = { granted, sent: 0, note: 'no VAPID_PRIVATE_KEY, push skipped' }
    console.log('[grant-graduate-offers]', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)

  const { data, error } = await supabase.rpc('push_targets_for_graduate_offers')
  if (error) {
    console.error('[grant-graduate-offers] targets failed', error.message)
    return new Response(JSON.stringify({ granted, error: error.message }), { status: 500 })
  }

  const targets = (data ?? []) as Target[]
  let sent = 0
  let gone = 0
  const failures: string[] = []

  for (const t of targets) {
    const payload = JSON.stringify({
      title: '🤎 הפתעה קטנה לסיום',
      body: `${discountText(t)} על ${t.workshop_title}, שבוע בלבד`,
      url: '/',
      tag: `graduate-offer-${t.grant_id}`,
    })

    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        payload,
      )
      sent++
      await supabase.from('push_notification_log').insert({
        user_id: t.user_id, kind: 'graduate_offer', ref_id: t.grant_id,
      })
      await supabase.rpc('mark_graduate_offer_pushed', { p_grant_id: t.grant_id })
      await supabase.from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('endpoint', t.endpoint)
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        gone++
        await supabase.from('push_subscriptions')
          .update({ failed_at: new Date().toISOString() })
          .eq('endpoint', t.endpoint)
      } else {
        failures.push(`${status ?? '?'} ${String(e).slice(0, 120)}`)
      }
    }
  }

  const summary = { granted, targets: targets.length, sent, gone, failures }
  console.log('[grant-graduate-offers]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
