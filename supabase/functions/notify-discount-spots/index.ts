// Edge Function: notify-discount-spots
//
// Runs daily (pg_cron). Finds active cohorts starting in exactly
// LOOKAHEAD_DAYS days (Asia/Jerusalem). For each one with free spots,
// emails Brenda an alert with the cohort, spots left, and (best effort)
// the list of More Than contacts tagged as waiting for a discount —
// so she can decide whom to offer a discounted spot.
//
// No idempotency table needed: a cohort matches start_date == today+3
// on exactly one day, and the whole run is a read-only report.
//
// Secrets: RESEND_API_KEY, GHL_API_KEY (optional, for the waiting list),
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY auto-injected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const LOOKAHEAD_DAYS = 3
const ALERT_TO = 'mimobaby.info@gmail.com'
const FROM_ADDRESS = 'מימו <noreply@mimo-baby.co.il>'
const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const DISCOUNT_TAG = 'ממתינה להנחה'

function todayInJerusalem(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86400000)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

function ddmm(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${parseInt(d, 10)}.${parseInt(m, 10)}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Best-effort: contacts tagged 'ממתינה להנחה' in More Than (GHL).
// Any failure returns null — the alert email still goes out without it.
async function fetchDiscountWaitlist(apiKey: string): Promise<Array<{ name: string; phone: string }> | null> {
  try {
    const res = await fetch(`${GHL_BASE}/contacts/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': GHL_VERSION,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        locationId: LOCATION_ID,
        pageLimit: 50,
        filters: [{ field: 'tags', operator: 'eq', value: DISCOUNT_TAG }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const contacts = data?.contacts
    if (!Array.isArray(contacts)) return null
    return contacts.map((c: any) => ({
      name: [c.firstNameRaw ?? c.firstName, c.lastNameRaw ?? c.lastName].filter(Boolean).join(' ') || c.contactName || '—',
      phone: c.phone ?? '—',
    }))
  } catch {
    return null
  }
}

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const GHL_API_KEY = Deno.env.get('GHL_API_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing RESEND_API_KEY' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const today = todayInJerusalem()
  const targetDate = addDays(today, LOOKAHEAD_DAYS)

  const { data: cohorts, error } = await supabase
    .from('workshop_cohorts')
    .select('id, workshop_id, start_date, start_time, capacity')
    .eq('is_active', true)
    .eq('start_date', targetDate)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const openings: Array<{ title: string; date: string; time: string; spots: number }> = []

  for (const c of cohorts ?? []) {
    const { data: w } = await supabase
      .from('workshops')
      .select('title, stock_quantity')
      .eq('id', c.workshop_id)
      .maybeSingle()
    const cap = c.capacity ?? w?.stock_quantity ?? null
    if (cap == null) continue
    const { count } = await supabase
      .from('registration_leads')
      .select('id', { count: 'exact', head: true })
      .eq('cohort_id', c.id)
    const spots = cap - (count ?? 0)
    if (spots > 0) {
      openings.push({
        title: w?.title ?? 'סדנה',
        date: ddmm(c.start_date),
        time: c.start_time ? c.start_time.slice(0, 5) : '',
        spots,
      })
    }
  }

  if (openings.length === 0) {
    const summary = { today, target_date: targetDate, openings: 0, email: 'not needed' }
    console.log('[notify-discount-spots]', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const waitlist = GHL_API_KEY ? await fetchDiscountWaitlist(GHL_API_KEY) : null

  const rows = openings.map(o =>
    `<li style="margin:0 0 8px;"><strong>${escapeHtml(o.title)}</strong> — ${o.date}${o.time ? ' בשעה ' + o.time : ''} · <strong>${o.spots}</strong> מקומות פנויים</li>`
  ).join('')

  const waitlistHtml = waitlist === null
    ? `<p style="font-size:13px;color:#9a8a7a;">לא הצלחתי לשלוף את רשימת "${DISCOUNT_TAG}" ממור דן — בדקי את התגית שם ישירות.</p>`
    : waitlist.length === 0
      ? `<p style="font-size:13px;color:#9a8a7a;">אין כרגע אף אחת עם התגית "${DISCOUNT_TAG}" במור דן.</p>`
      : `<p style="margin:0 0 6px;font-weight:700;">ממתינות להנחה:</p><ul>${waitlist.map(wl => `<li>${escapeHtml(wl.name)} · ${escapeHtml(wl.phone)}</li>`).join('')}</ul>`

  const html = `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Arial,sans-serif;color:#3A352E;line-height:1.7;" dir="rtl">
    <h2 style="color:#A35C3D;">יש מקומות פנויים במחזור שמתחיל בעוד ${LOOKAHEAD_DAYS} ימים 🤍</h2>
    <ul>${rows}</ul>
    ${waitlistHtml}
    <p style="font-size:13px;color:#9a8a7a;">אם מתאים — זה הזמן להציע מקום בהנחה למי שהמחיר עצר אותה.</p>
  </body></html>`

  let emailStatus = 'sent'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: ALERT_TO,
        subject: `מקומות פנויים במחזור שמתחיל בעוד ${LOOKAHEAD_DAYS} ימים`,
        html,
      }),
    })
    if (!res.ok) emailStatus = `failed: Resend ${res.status} ${await res.text()}`
  } catch (e) {
    emailStatus = `failed: ${String(e)}`
  }

  const summary = { today, target_date: targetDate, openings, waitlist_count: waitlist?.length ?? null, email: emailStatus }
  console.log('[notify-discount-spots]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
