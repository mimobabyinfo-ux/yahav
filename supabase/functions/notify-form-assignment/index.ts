// notify-form-assignment
//
// A form was just assigned to a mother (form_assignments INSERT, whatever
// did it: the opening-form trigger after payment, the end-of-cohort survey
// job, or Brenda's "שייך טופס למשתמשות" modal). Tell her, once, by web
// push. Brenda 7.9.26: "האם היא תקבל התראה, במידה והיא פתחה את ההתראות?"
//
// Reaches only mothers who turned reminders on (push_subscriptions with
// no failed_at); on iPhone that also means the app is on the home
// screen. Everyone else simply finds the task on the home screen.
//
// Called by the DB trigger form_assignments_notify with { assignment_id }.
// verify_jwt is off, like the other trigger-called functions; the body
// carries nothing but an id and the response carries counts only.
//
// Idempotent: push_notification_log (user, 'form_assignment', assignment)
// is written after the first successful send and checked before sending.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONTACT = 'mailto:mimobaby.info@gmail.com'
const FALLBACK_PUBLIC_KEY = 'BCBpBpEnxebSm2byEJl4vaJVMkPBCgOyXlUZQ_UtXfczlN99F-WgOcbXE8MaVDJzJH_ecr4u_kqAmMMHx5dsQ9g'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? FALLBACK_PUBLIC_KEY
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: 'missing Supabase env' }, 500)
  if (!VAPID_PRIVATE) return json({ error: 'missing VAPID_PRIVATE_KEY' }, 500)

  let assignmentId = ''
  try {
    const body = await req.json()
    assignmentId = String(body?.assignment_id ?? '')
  } catch { /* fall through */ }
  if (!UUID.test(assignmentId)) return json({ ok: false, reason: 'bad_assignment_id' }, 400)

  webpush.setVapidDetails(CONTACT, VAPID_PUBLIC, VAPID_PRIVATE)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: a, error: aErr } = await admin
    .from('form_assignments')
    .select('id, user_id, form_id, title, completed_at, forms(title)')
    .eq('id', assignmentId)
    .maybeSingle()
  if (aErr) return json({ ok: false, reason: aErr.message }, 500)
  if (!a) return json({ ok: false, reason: 'assignment_not_found' }, 404)
  if (a.completed_at) return json({ ok: true, sent: 0, reason: 'already_completed' })

  const { data: already } = await admin
    .from('push_notification_log')
    .select('id')
    .eq('user_id', a.user_id)
    .eq('kind', 'form_assignment')
    .eq('ref_id', a.id)
    .limit(1)
  if (already && already.length > 0) return json({ ok: true, sent: 0, reason: 'already_notified' })

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', a.user_id)
    .is('failed_at', null)
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, reason: 'no_subscription' })

  // Survey or opening form? A form that some product uses as its
  // end-of-workshop survey gets the "how was it" wording.
  const { data: asSurvey } = await admin
    .from('workshops')
    .select('id')
    .eq('feedback_form_id', a.form_id)
    .limit(1)
  const isSurvey = !!(asSurvey && asSurvey.length > 0)
  const formTitle = (a as { forms?: { title?: string } | null }).forms?.title ?? a.title ?? 'שאלון'

  const payload = JSON.stringify(isSurvey
    ? { title: 'איך היה? 🤎', body: 'נשמח למשוב קצר על הסדנה. זה מחכה לך במסך הבית.', url: '/', tag: `form-${a.id}` }
    : { title: 'מחכה לך שאלון קצר 🤎', body: `${formTitle}. כמה דקות, וזה עוזר לנו להתאים לך את הליווי.`, url: '/', tag: `form-${a.id}` })

  let sent = 0
  let gone = 0
  const failures: string[] = []
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      sent++
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
  if (sent > 0) {
    await admin.from('push_notification_log').insert({ user_id: a.user_id, kind: 'form_assignment', ref_id: a.id })
  }
  const summary = { ok: true, sent, gone, failures, survey: isSurvey }
  console.log('[notify-form-assignment]', JSON.stringify(summary))
  return json(summary)
})
