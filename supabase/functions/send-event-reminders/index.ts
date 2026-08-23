// Edge Function: send-event-reminders
//
// Runs daily (pg_cron, 06:00 Jerusalem). Finds every community event
// happening TOMORROW, and pushes a reminder to each registered mother
// who turned notifications on.
//
// Why tomorrow and not "18 hours before": a mother plans her day the
// evening before or the morning of. An exact-hours countdown means the
// job has to run every hour and still lands at 03:00 for some events.
//
// Idempotent through push_notification_log: a (user, 'event_reminder',
// event) row is written the moment a push succeeds, and
// push_targets_for_tomorrow filters those out. Running the job twice
// sends nothing the second time.
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONTACT = 'mailto:mimobaby.info@gmail.com'

// Public key also lives in src/utils/webPush.ts. They must match, or
// every subscription made by the app is unreadable here.
const FALLBACK_PUBLIC_KEY = 'BCBpBpEnxebSm2byEJl4vaJVMkPBCgOyXlUZQ_UtXfczlN99F-WgOcbXE8MaVDJzJH_ecr4u_kqAmMMHx5dsQ9g'

type Target = {
  user_id: string
  event_id: string
  event_title: string
  event_emoji: string | null
  event_date: string
  start_time: string | null
  location: string | null
  endpoint: string
  p256dh: string
  auth: string
}

function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null
}

function bodyFor(t: Target): string {
  const time = hhmm(t.start_time)
  const parts = ['מחר']
  if (time) parts.push(`בשעה ${time}`)
  if (t.location) parts.push(`· ${t.location}`)
  return parts.join(' ')
}

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? FALLBACK_PUBLIC_KEY
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }
  if (!VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'missing VAPID_PRIVATE_KEY' }), { status: 500 })
  }

  webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data, error } = await supabase.rpc('push_targets_for_tomorrow')
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const targets = (data ?? []) as Target[]
  let sent = 0
  let gone = 0
  const failures: string[] = []

  for (const t of targets) {
    const payload = JSON.stringify({
      title: `${t.event_emoji ?? '🤎'} ${t.event_title}`,
      body: bodyFor(t),
      url: '/?tab=community&sub=bookings',
      tag: `event-${t.event_id}`,
    })

    try {
      await webpush.sendNotification(
        { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
        payload,
      )
      sent++
      await supabase.from('push_notification_log').insert({
        user_id: t.user_id,
        kind: 'event_reminder',
        ref_id: t.event_id,
      })
      await supabase.from('push_subscriptions')
        .update({ last_used_at: new Date().toISOString() })
        .eq('endpoint', t.endpoint)
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      // 404/410 mean the browser threw the subscription away (app
      // uninstalled, permission revoked). Mark it dead so we stop
      // trying, rather than failing forever on a ghost.
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

  const summary = { targets: targets.length, sent, gone, failures }
  console.log('[send-event-reminders]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
