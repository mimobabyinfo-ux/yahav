// Edge Function: remind-stalled-registrations
//
// The workshop/course twin of remind-stalled-payments (community events).
//
// Brenda 27.9.26: "הרבה פעמים הן נופלות בתשלום מאיזשהי סיבה. אני רוצה
// שזה יהיה אוטומטי, ככה אני לא אצטרך לחשוב על זה בכלל ורק במקרה קיצון
// אתערב."
//
// A mother fills the registration page, a registration_leads row is saved
// as 'pending', she is sent to Morning, and she never pays. Until now
// nothing told her. This emails her ONCE, about 24 hours later, with the
// payment link.
//
// Scope, as Brenda chose: workshops and courses only. Physical products
// (workshop_type 'מוצרים משלימים', or anything bought from the in-app
// store, source 'store') are left alone.
//
// The "extreme case" she steps in on is the existing admin-home task
// "X ממתינות לתשלום מעל 48 שעות" (adminTasks.ts rule 3): a lead that got
// this email at ~24h and still has not paid shows up there at 48h.
//
// Who is NOT emailed, on purpose:
//   - she already paid under another row (same workshop, same email or
//     phone). Morning sometimes gets a different email than the form, and
//     then the webhook opens a fresh paid lead instead of closing this one.
//     Chasing a mother for money she already sent is worse than silence.
//   - an older duplicate: only her newest pending row for that workshop.
//   - the cohort she picked has started, is inactive, or is full.
//   - her discount offer has expired (the email would quote a price she
//     can no longer get). Those stay for Brenda on the admin card.
//   - leads older than 14 days (backlog, not "you just dropped out").
//
// Why email and not WhatsApp: see remind-stalled-payments and project
// memory whatsapp_24h_window. The API reports success and WhatsApp drops it.
//
// Runs hourly, but only sends 08:00-21:00 Israel time, so nobody gets it
// at 3am. reminded_at is stamped only after a real send.
//
// ?dry=1 reports who would be emailed and sends nothing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REMIND_AFTER_HOURS = 24
const MAX_AGE_DAYS = 14
const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'
const PRODUCT_TYPE = 'מוצרים משלימים'

function jerusalemParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => f.find(p => p.type === t)?.value ?? ''
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}`, hour: Number(g('hour')) }
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

function normPhone(p: string | null): string {
  const d = (p ?? '').replace(/\D/g, '')
  if (!d) return ''
  return d.startsWith('972') ? '0' + d.slice(3) : d
}

type Lead = {
  id: string; name: string | null; phone: string | null; normalized_phone: string | null
  email: string | null; selected_workshop_id: string | null; cohort_id: string | null
  offer_id: string | null; source: string | null; status: string; created_at: string
  reminded_at: string | null
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }

  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'
  const now = new Date()
  const { date: today, hm: nowHm, hour } = jerusalemParts(now)

  if (!dry && (hour < 8 || hour >= 21)) {
    return new Response(JSON.stringify({ skipped: 'quiet hours', nowHm }), { status: 200 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const oldest = new Date(now.getTime() - MAX_AGE_DAYS * 86_400_000).toISOString()
  const newest = new Date(now.getTime() - REMIND_AFTER_HOURS * 3_600_000).toISOString()

  const { data: pend, error: pErr } = await supabase
    .from('registration_leads')
    .select('id, name, phone, normalized_phone, email, selected_workshop_id, cohort_id, offer_id, source, status, created_at, reminded_at')
    .eq('status', 'pending')
    .is('reminded_at', null)
    .gte('created_at', oldest)
    .lte('created_at', newest)
    .order('created_at', { ascending: false })
  if (pErr) return new Response(JSON.stringify({ error: pErr.message }), { status: 500 })
  const candidates = (pend ?? []) as Lead[]

  const workshopIds = [...new Set(candidates.map(l => l.selected_workshop_id).filter(Boolean))] as string[]
  const cohortIds = [...new Set(candidates.map(l => l.cohort_id).filter(Boolean))] as string[]
  const offerIds = [...new Set(candidates.map(l => l.offer_id).filter(Boolean))] as string[]

  const [{ data: ws }, { data: cs }, { data: fill }, { data: offs }, { data: related }, { data: settings }] = await Promise.all([
    workshopIds.length
      ? supabase.from('workshops').select('id, title, workshop_type, price, payment_link, is_active').in('id', workshopIds)
      : Promise.resolve({ data: [] }),
    cohortIds.length
      ? supabase.from('workshop_cohorts').select('id, start_date, start_time, is_active, label').in('id', cohortIds)
      : Promise.resolve({ data: [] }),
    cohortIds.length
      ? supabase.from('v_cohort_fill').select('cohort_id, capacity, registered').in('cohort_id', cohortIds)
      : Promise.resolve({ data: [] }),
    offerIds.length
      ? supabase.from('workshop_offers').select('id, payment_link, is_active, expires_at').in('id', offerIds)
      : Promise.resolve({ data: [] }),
    // Every row for these workshops since shortly before the oldest
    // candidate: used to spot "already paid elsewhere" and "newer duplicate".
    workshopIds.length
      ? supabase.from('registration_leads')
          .select('id, email, phone, normalized_phone, selected_workshop_id, status, created_at')
          .in('selected_workshop_id', workshopIds)
          .gte('created_at', new Date(now.getTime() - (MAX_AGE_DAYS + 3) * 86_400_000).toISOString())
      : Promise.resolve({ data: [] }),
    supabase.from('global_settings').select('setting_key, setting_value').in('setting_key', ['owner_name', 'owner_whatsapp']),
  ])

  const workshops = new Map((ws ?? []).map((w: any) => [w.id, w]))
  const cohorts = new Map((cs ?? []).map((c: any) => [c.id, c]))
  const fills = new Map((fill ?? []).map((f: any) => [f.cohort_id, f]))
  const offers = new Map((offs ?? []).map((o: any) => [o.id, o]))
  const set = new Map((settings ?? []).map((s: any) => [s.setting_key, s.setting_value]))
  const ownerName = (set.get('owner_name') as string) || 'ברנדה'
  const ownerWa = String(set.get('owner_whatsapp') ?? '').replace(/\D/g, '')

  const sameHer = (a: Lead, b: any) => {
    const ea = (a.email ?? '').trim().toLowerCase(), eb = (b.email ?? '').trim().toLowerCase()
    const pa = normPhone(a.normalized_phone ?? a.phone), pb = normPhone(b.normalized_phone ?? b.phone)
    return (!!ea && ea === eb) || (!!pa && pa.length >= 9 && pa === pb)
  }

  const results: Array<{ name: string; workshop: string; result: string }> = []

  for (const l of candidates) {
    const w: any = l.selected_workshop_id ? workshops.get(l.selected_workshop_id) : null
    const label = { name: l.name ?? l.id, workshop: w?.title ?? '?' }
    const skip = (why: string) => results.push({ ...label, result: `skip: ${why}` })

    if (!w) { skip('no workshop'); continue }
    if (l.source === 'store' || w.workshop_type === PRODUCT_TYPE) { skip('product, out of scope'); continue }
    if (!w.is_active) { skip('workshop inactive'); continue }
    if (!(Number(w.price) > 0)) { skip('free'); continue }
    if (!l.email) { skip('no email'); continue }

    const mine = (related ?? []).filter((r: any) => r.selected_workshop_id === w.id && r.id !== l.id && sameHer(l, r))
    const lowerBound = new Date(new Date(l.created_at).getTime() - 2 * 86_400_000).toISOString()
    if (mine.some((r: any) => r.status === 'paid' && r.created_at >= lowerBound)) { skip('already paid under another row'); continue }
    if (mine.some((r: any) => r.status === 'pending' && r.created_at > l.created_at)) { skip('older duplicate'); continue }

    let cohortLine = ''
    if (l.cohort_id) {
      const c: any = cohorts.get(l.cohort_id)
      if (!c || !c.is_active) { skip('cohort inactive'); continue }
      const started = c.start_date < today || (c.start_date === today && (!c.start_time || c.start_time.slice(0, 5) <= nowHm))
      if (started) { skip('cohort already started'); continue }
      const f: any = fills.get(l.cohort_id)
      if (f?.capacity && Number(f.registered) >= Number(f.capacity)) { skip('cohort full'); continue }
      cohortLine = ` (המחזור שמתחיל ב-${ddmm(c.start_date)}${c.start_time ? ` בשעה ${c.start_time.slice(0, 5)}` : ''})`
    }

    let link: string | null = w.payment_link
    let showPrice = true
    if (l.offer_id) {
      const o: any = offers.get(l.offer_id)
      const expired = !o || !o.is_active || (o.expires_at && new Date(o.expires_at) < now)
      if (expired) { skip('offer expired, needs Brenda'); continue }
      link = o.payment_link ?? w.payment_link
      showPrice = false
    }
    if (!link) { skip('no payment link'); continue }

    const hi = firstName(l.name) ? `היי ${escapeHtml(firstName(l.name))},` : 'היי,'
    const waLink = ownerWa
      ? `https://wa.me/${ownerWa}?text=${encodeURIComponent(`היי ${ownerName}, התחלתי להירשם ל${w.title} ונתקעתי בתשלום`)}`
      : null

    const html = `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,sans-serif;color:#3A352E;line-height:1.8;background:#FBF8F3;padding:24px;" dir="rtl">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:28px;">
    <p style="margin:0 0 14px;font-size:16px;">${hi}</p>
    <p style="margin:0 0 14px;font-size:15px;">
      ראיתי שהתחלת להירשם ל<strong>${escapeHtml(w.title)}</strong>${escapeHtml(cohortLine)}, וההרשמה נעצרה לפני התשלום.
      זה קורה, לפעמים משהו נתקע בדרך.
    </p>
    <p style="margin:0 0 20px;font-size:15px;">אם זה עדיין רלוונטי לך, אפשר להשלים כאן:</p>
    <p style="margin:0 0 22px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#E7C78A;color:#4A3A28;font-weight:bold;font-size:15px;text-decoration:none;padding:13px 26px;border-radius:14px;">
        להשלמת ההרשמה${showPrice ? ` · ₪${Number(w.price)}` : ''}
      </a>
    </p>
    ${waLink ? `<p style="margin:0 0 14px;font-size:14px;">נתקעת או שיש לך שאלה? <a href="${escapeHtml(waLink)}" style="color:#A35C3D;">כתבי לי בוואטסאפ</a>.</p>` : ''}
    <p style="margin:0 0 14px;font-size:14px;">${escapeHtml(ownerName)}</p>
    <p style="margin:0;font-size:13px;color:#9a8a7a;">כבר שילמת? אפשר להתעלם מהמייל הזה.</p>
  </div>
</body></html>`

    if (dry) { results.push({ ...label, result: `would email ${l.email}` }); continue }
    if (!RESEND_API_KEY) { results.push({ ...label, result: 'missing RESEND_API_KEY' }); continue }

    let result = 'sent'
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: l.email.trim(),
          subject: `ההרשמה שלך ל${w.title} לא הושלמה`,
          html,
        }),
      })
      if (!res.ok) result = `failed: Resend ${res.status} ${await res.text()}`
    } catch (e) {
      result = `failed: ${String(e)}`
    }
    if (result === 'sent') {
      const { error } = await supabase
        .from('registration_leads')
        .update({ reminded_at: new Date().toISOString(), reminded_channel: 'email' })
        .eq('id', l.id)
      if (error) result = `sent, but stamp failed: ${error.message}`
    }
    results.push({ ...label, result })
  }

  const summary = { today, nowHm, dry, candidates: candidates.length, results }
  console.log('[remind-stalled-registrations]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
