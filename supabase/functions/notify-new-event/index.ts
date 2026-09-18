// notify-new-event
//
// A community event just became visible (inserted active, or a draft
// switched on) with a future date. Push "מפגש חדש בקהילה" to every mother
// who turned notifications on. Yahav 18.9.26: "האירועים החדשים שיצאו
// אתמול אני רוצה שיקפיץ להם הודעה", and to ALL mothers, not only the
// ones already active in the community.
//
// Called by the DB trigger community_events_notify_new with { event_id }.
// verify_jwt is off like the other trigger-called functions; the body is
// an id and the response is counts.
//
// Idempotent per (user, event) via push_notification_log kind 'new_event':
// flipping the same event off and on again does not push twice. Admins
// are skipped (Brenda and Yahav do not need a push about their own event).
// The mother-facing text says only what and when; the tap opens the
// community tab.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONTACT = 'mailto:mimobaby.info@gmail.com'
const FALLBACK_PUBLIC_KEY = 'BCBpBpEnxebSm2byEJl4vaJVMkPBCgOyXlUZQ_UtXfczlN99F-WgOcbXE8MaVDJzJH_ecr4u_kqAmMMHx5dsQ9g'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function whenLabel(date: string, time: string | null): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `יום ${day} ${d}.${m}${time ? ` בשעה ${time.slice(0, 5)}` : ''}`
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? FALLBACK_PUBLIC_KEY
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'missing Supabase env' }, 500)
  if (!VAPID_PRIVATE) return json({ error: 'missing VAPID_PRIVATE_KEY' }, 500)

  let eventId = ''
  try {
    const body = await req.json()
    eventId = String(body?.event_id ?? '')
  } catch { /* fall through */ }
  if (!UUID.test(eventId)) return json({ ok: false, reason: 'bad_event_id' }, 400)

  webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: ev, error: evErr } = await admin
    .from('community_events')
    .select('id, title, emoji, event_date, start_time, location, price, is_active')
    .eq('id', eventId)
    .maybeSingle()
  if (evErr) return json({ ok: false, reason: evErr.message }, 500)
  if (!ev) return json({ ok: false, reason: 'event_not_found' }, 404)
  if (!ev.is_active) return json({ ok: true, sent: 0, reason: 'inactive' })

  // Everyone subscribed, minus admins, minus anyone already told about
  // this event.
  const [{ data: subs }, { data: admins }, { data: done }] = await Promise.all([
    admin.from('push_subscriptions').select('user_id, endpoint, p256dh, auth').is('failed_at', null),
    admin.from('user_profiles').select('id').eq('is_admin', true),
    admin.from('push_notification_log').select('user_id').eq('kind', 'new_event').eq('ref_id', ev.id),
  ])
  const skip = new Set<string>([
    ...((admins ?? []) as { id: string }[]).map(a => a.id),
    ...((done ?? []) as { user_id: string }[]).map(d => d.user_id),
  ])
  const targets = ((subs ?? []) as { user_id: string; endpoint: string; p256dh: string; auth: string }[])
    .filter(s => !skip.has(s.user_id))
  if (targets.length === 0) return json({ ok: true, sent: 0, reason: 'nobody_to_notify' })

  const price = Number(ev.price ?? 0)
  const payload = JSON.stringify({
    title: `${ev.emoji ? ev.emoji + ' ' : ''}מפגש חדש בקהילה: ${ev.title}`,
    body: `${whenLabel(ev.event_date, ev.start_time)}${ev.location ? ` · ${ev.location}` : ''}${price > 0 ? ` · ₪${price}` : ' · חינם'}. המקומות מוגבלים, שווה להירשם.`,
    url: '/?tab=community',
    tag: `event-${ev.id}`,
  })

  let sent = 0
  let gone = 0
  const failures: string[] = []
  const notified = new Set<string>()
  for (const s of targets) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      sent++
      notified.add(s.user_id)
      await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('endpoint', s.endpoint)
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        gone++
        await admin.from('push_subscriptions').update({ failed_at: new Date().toISOString() }).eq('endpoint', s.endpoint)
      } else {
        failures.push(`${status ?? '?'} ${String(e).slice(0, 120)}`)
      }
    }
  }
  if (notified.size > 0) {
    await admin.from('push_notification_log').insert(
      [...notified].map(user_id => ({ user_id, kind: 'new_event', ref_id: ev.id })),
    )
  }
  const summary = { ok: true, event: ev.title, sent, gone, failures }
  console.log('[notify-new-event]', JSON.stringify(summary))
  return json(summary)
})
