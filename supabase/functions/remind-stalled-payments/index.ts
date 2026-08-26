// Edge Function: remind-stalled-payments
//
// Runs daily (pg_cron). Two jobs, in this order:
//
//   1. Remind. A mother who tapped "אני מגיעה!" on a paid event, got the
//      Morning payment page, and never came back is left as a 'pending'
//      row: not registered, not cancelled, seat already returned to the
//      pool. Nobody tells her. On 26.8.26 there were six of them, sitting
//      untouched for up to eight days. This emails each one once, a day
//      after she stalled, with the payment link.
//
//   2. Retire. Once the event has happened, a still-pending row is dead:
//      she never paid and never came. Cancelling it is bookkeeping, so the
//      list stays a list of live leads instead of growing forever.
//
// Why email and not WhatsApp. The GHL API happily returns 200 for a
// WhatsApp message that WhatsApp then refuses, and it refuses everything
// sent outside 24 hours of HER last inbound message. Registering in the
// app is not a WhatsApp message, so by definition the window is shut for
// every mother this function targets: an automated WhatsApp here would
// report success and deliver nothing. See project memory:
// whatsapp_24h_window. WhatsApp stays manual, from Yahav's own phone, via
// the admin card.
//
// Idempotency is reminded_at on the registration row. The admin card
// stamps the same column, so a mother Yahav already messaged by hand is
// skipped here rather than nagged twice through two channels.
//
// Nothing is cancelled while it can still turn into a paying seat. An
// earlier draft retired a row four days after the reminder; that would
// have quietly killed five warm leads on 30.8 whose events run to 15.9,
// and it would have bought nothing: a pending row stops holding a seat
// the moment its ten-minute hold expires, so there is no seat to free.
//
// Secrets: RESEND_API_KEY, plus the platform-injected SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REMIND_AFTER_HOURS = 24
const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://mimo-baby.co.il'

function todayInJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}.${Number(m)}`
}

function firstName(full: string | null): string {
  if (!full) return ''
  return full.trim().split(/\s+/)[0] || full
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type EventRow = {
  id: string
  title: string
  event_date: string
  start_time: string | null
  location: string | null
  price: number
  payment_link: string | null
  payment_link_pair: string | null
  capacity: number | null
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }

  // ?dry=1 reports exactly who would be written to, and sends nothing.
  const dry = new URL(req.url).searchParams.get('dry') === '1'

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const today = todayInJerusalem()
  const now = Date.now()

  // Events worth chasing: still ahead of us, still on, and priced.
  const { data: evs, error: evErr } = await supabase
    .from('community_events')
    .select('id, title, event_date, start_time, location, price, payment_link, payment_link_pair, capacity')
    .eq('is_active', true)
    .gte('event_date', today)
    .gt('price', 0)
  if (evErr) return new Response(JSON.stringify({ error: evErr.message }), { status: 500 })

  const events = new Map<string, EventRow>()
  for (const e of (evs ?? []) as EventRow[]) events.set(e.id, e)

  const eventIds = [...events.keys()]
  const rows = eventIds.length === 0 ? [] : await (async () => {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('id, user_id, event_id, guest_names, created_at, reminded_at, payment_claimed_at')
      .in('event_id', eventIds)
      .eq('status', 'pending')
      .eq('paid', false)
    if (error) throw new Error(error.message)
    return (data ?? []) as Array<{
      id: string; user_id: string; event_id: string
      guest_names: string[] | null
      created_at: string; reminded_at: string | null; payment_claimed_at: string | null
    }>
  })()

  // She told us she paid and is waiting for Brenda to confirm. Chasing her
  // for money she already sent is the one message worse than silence.
  const live = rows.filter(r => !r.payment_claimed_at)

  const toRemind = live.filter(r =>
    !r.reminded_at && now - new Date(r.created_at).getTime() >= REMIND_AFTER_HOURS * 3_600_000)

  // Who they are.
  const ids = [...new Set(toRemind.map(r => r.user_id))]
  const profiles = new Map<string, { name: string | null; email: string | null }>()
  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from('user_profiles')
      .select('id, mother_name, email')
      .in('id', ids)
    for (const p of (profs ?? []) as Array<{ id: string; mother_name: string | null; email: string | null }>) {
      profiles.set(p.id, { name: p.mother_name, email: p.email })
    }
  }

  // 1 · Remind.
  const reminded: Array<{ name: string; event: string; result: string }> = []

  for (const r of toRemind) {
    const ev = events.get(r.event_id)!
    const who = profiles.get(r.user_id)
    const label = `${who?.name ?? r.user_id} · ${ev.title}`

    if (!who?.email) {
      reminded.push({ name: who?.name ?? r.user_id, event: ev.title, result: 'no email on file' })
      continue
    }
    if (!RESEND_API_KEY) {
      reminded.push({ name: who.name ?? r.user_id, event: ev.title, result: 'missing RESEND_API_KEY' })
      continue
    }

    const seats = (r.guest_names?.length ?? 0) + 1
    const link = (seats === 2 && ev.payment_link_pair) ? ev.payment_link_pair : ev.payment_link
    // No link means there is nothing for her to do. Sending "go pay" with
    // nowhere to pay is how an app teaches people to ignore its mail.
    if (!link) {
      reminded.push({ name: who.name ?? r.user_id, event: ev.title, result: 'event has no payment link' })
      continue
    }

    const hi = firstName(who.name) ? `היי ${escapeHtml(firstName(who.name))},` : 'היי,'
    const when = `${ddmm(ev.event_date)}${ev.start_time ? ` בשעה ${ev.start_time.slice(0, 5)}` : ''}`
    const where = ev.location ? ` ב${escapeHtml(ev.location)}` : ''

    const html = `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,sans-serif;color:#3A352E;line-height:1.8;background:#FBF8F3;padding:24px;" dir="rtl">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:28px;">
    <p style="margin:0 0 14px;font-size:16px;">${hi}</p>
    <p style="margin:0 0 14px;font-size:15px;">
      התחלת להירשם ל<strong>${escapeHtml(ev.title)}</strong> ב-${when}${where}, וההרשמה נעצרה לפני התשלום.
    </p>
    <p style="margin:0 0 20px;font-size:15px;">
      שמירת המקום הזמנית פגה, אבל עדיין אפשר להשלים ולתפוס מקום:
    </p>
    <p style="margin:0 0 22px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#E7C78A;color:#4A3A28;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:14px;">
        להשלמת התשלום · ₪${ev.price}
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#9a8a7a;">
      כבר שילמת? אפשר להתעלם מהמייל הזה. אפשר גם לראות את כל האירועים
      <a href="${escapeHtml(APP_URL)}" style="color:#A35C3D;">באפליקציה</a>.
    </p>
  </div>
</body></html>`

    if (dry) {
      reminded.push({ name: who.name ?? r.user_id, event: ev.title, result: `would email ${who.email}` })
      continue
    }

    let result = 'sent'
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: who.email,
          subject: `ההרשמה שלך ל${ev.title} לא הושלמה`,
          html,
        }),
      })
      if (!res.ok) result = `failed: Resend ${res.status} ${await res.text()}`
    } catch (e) {
      result = `failed: ${String(e)}`
    }

    // Stamped only on a real send, so a Resend outage means she is tried
    // again tomorrow instead of being marked handled and forgotten.
    if (result === 'sent') {
      const { error } = await supabase
        .from('event_registrations')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', r.id)
      if (error) result = `sent, but stamp failed: ${error.message}`
    }
    reminded.push({ name: who.name ?? r.user_id, event: ev.title, result })
    console.log('[remind-stalled-payments] remind', label, result)
  }

  // 2 · Retire: the event is behind us, so nothing is being given up.
  const retired: Array<{ id: string; event: string }> = []
  const { data: past } = await supabase
    .from('event_registrations')
    .select('id, community_events!inner(title, event_date)')
    .eq('status', 'pending')
    .eq('paid', false)
    .lt('community_events.event_date', today)
  for (const r of (past ?? []) as Array<{ id: string; community_events: { title: string } | null }>) {
    retired.push({ id: r.id, event: r.community_events?.title ?? '?' })
    if (dry) continue
    await supabase.from('event_registrations').update({ status: 'cancelled' }).eq('id', r.id)
  }

  const summary = {
    today,
    dry,
    events: events.size,
    pending_rows: rows.length,
    reminded,
    retired,
  }
  console.log('[remind-stalled-payments]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
