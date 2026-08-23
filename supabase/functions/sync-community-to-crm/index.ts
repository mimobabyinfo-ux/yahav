// Edge Function: sync-community-to-crm
//
// Runs hourly (pg_cron job 'sync-community-to-crm-hourly'). Two sweeps:
//
// 1. EVENT REGISTRANTS — event_registrations with status registered/attended
//    and crm_synced_at NULL. Upserts the mom as a GHL contact (dedupe by
//    phone/email on GHL's side) and applies tags:
//      'אירוע-קהילה'            — the conversion-measurement tag: later we
//                                 count how many carriers became paying
//                                 workshop customers.
//      'אירוע - <event title>'  — which event she registered to.
//
// 2. NEW APP USERS — user_profiles with crm_synced_at NULL, excluding
//    admins, family-guests (family_role set) and internal guest accounts
//    (@mimo.internal). Upserts + tag 'אפליקציה' so Brenda can see in
//    More Than who has the app.
//    NOTE: all user_profiles existing at rollout (2.8.26) were backfilled
//    as synced WITHOUT touching GHL — many were test accounts. Only
//    signups after rollout flow to the CRM.
//
// Idempotency: crm_synced_at is set per-row ONLY after tagging succeeded;
// failures stay NULL and retry next run. Rows with no usable phone AND no
// email are marked synced+skipped so they aren't rescanned forever.
//
// Dry-run: call with ?dry=1 — reports what WOULD happen, touches nothing.
//
// Secrets: GHL_API_KEY, SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injected).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const TAG_EVENT = 'אירוע-קהילה'
const TAG_APP = 'אפליקציה'

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('972')) return '+' + digits
  if (digits.startsWith('0') && digits.length >= 9) return '+972' + digits.slice(1)
  if (digits.length === 9) return '+972' + digits
  return null
}

async function ghl(path: string, method: string, apiKey: string, body?: unknown): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const res = await fetch(`${GHL_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': GHL_VERSION,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
    if (!res.ok) return { ok: false, status: res.status, error: text?.slice(0, 500) }
    return { ok: true, status: res.status, data }
  } catch (e) {
    return { ok: false, status: 0, error: String(e) }
  }
}

// Upsert a contact and apply tags. Returns true when the tags were applied.
async function upsertAndTag(
  apiKey: string,
  person: { name: string | null; phone: string | null; email: string | null },
  tags: string[],
  log: Array<Record<string, unknown>>,
  label: string,
): Promise<boolean> {
  const phone = normalizePhone(person.phone)
  const email = person.email && person.email.includes('@') ? person.email.trim().toLowerCase() : null
  if (!phone && !email) {
    log.push({ who: label, skipped: 'no phone and no email' })
    return false
  }
  const body: Record<string, unknown> = { locationId: LOCATION_ID }
  if (phone) body.phone = phone
  if (email) body.email = email
  if (person.name) body.name = person.name
  const cRes = await ghl('/contacts/upsert', 'POST', apiKey, body)
  const contactId = cRes.data?.contact?.id
  if (!cRes.ok || !contactId) {
    log.push({ who: label, step: 'contact upsert', error: cRes.error ?? 'no contact id' })
    return false
  }
  const tRes = await ghl(`/contacts/${contactId}/tags`, 'POST', apiKey, { tags })
  if (!tRes.ok) {
    log.push({ who: label, step: 'add tags', error: tRes.error })
    return false
  }
  log.push({ who: label, tags, status: 'tagged' })
  return true
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const GHL_API_KEY = Deno.env.get('GHL_API_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  if (!GHL_API_KEY) return new Response(JSON.stringify({ error: 'missing GHL_API_KEY secret' }), { status: 500 })

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const log: Array<Record<string, unknown>> = []
  let eventTagged = 0
  let usersTagged = 0

  // ── Sweep 1: event registrations ─────────────────────────────────────
  const { data: regs, error: regsErr } = await supabase
    .from('event_registrations')
    .select('id, user_id, status, community_events(title), user_profiles(mother_name, phone_number, email)')
    .in('status', ['registered', 'attended'])
    .is('crm_synced_at', null)
  if (regsErr) return new Response(JSON.stringify({ error: regsErr.message }), { status: 500 })

  for (const reg of (regs ?? []) as any[]) {
    const p = reg.user_profiles
    const title: string = reg.community_events?.title ?? ''
    const tags = title ? [TAG_EVENT, `אירוע - ${title}`] : [TAG_EVENT]
    const label = `reg:${p?.mother_name ?? reg.user_id}`

    const phone = normalizePhone(p?.phone_number)
    const email = p?.email && String(p.email).includes('@') && !String(p.email).endsWith('@mimo.internal') ? p.email : null
    if (!phone && !email) {
      if (!dry) await supabase.from('event_registrations').update({ crm_synced_at: new Date().toISOString() }).eq('id', reg.id)
      log.push({ who: label, skipped: 'no phone and no usable email' })
      continue
    }

    if (dry) { log.push({ who: label, would_tag: tags }); continue }

    const ok = await upsertAndTag(GHL_API_KEY, { name: p?.mother_name ?? null, phone: p?.phone_number ?? null, email }, tags, log, label)
    if (!ok) continue // stays unsynced -> retried next run
    await supabase.from('event_registrations').update({ crm_synced_at: new Date().toISOString() }).eq('id', reg.id)
    eventTagged++
  }

  // ── Sweep 2: new app users (moms only — no admins, guests, internal accounts) ──
  const { data: users, error: usersErr } = await supabase
    .from('user_profiles')
    .select('id, mother_name, phone_number, email, is_admin, family_role')
    .is('crm_synced_at', null)
  if (usersErr) return new Response(JSON.stringify({ error: usersErr.message }), { status: 500 })

  for (const u of (users ?? []) as any[]) {
    const label = `user:${u.mother_name ?? u.email}`
    const internal = typeof u.email === 'string' && u.email.endsWith('@mimo.internal')
    if (u.is_admin || u.family_role || internal) {
      if (!dry) await supabase.from('user_profiles').update({ crm_synced_at: new Date().toISOString() }).eq('id', u.id)
      log.push({ who: label, skipped: u.is_admin ? 'admin' : u.family_role ? 'family guest' : 'internal guest account' })
      continue
    }
    const phone = normalizePhone(u.phone_number)
    const email = u.email && String(u.email).includes('@') ? u.email : null
    if (!phone && !email) {
      if (!dry) await supabase.from('user_profiles').update({ crm_synced_at: new Date().toISOString() }).eq('id', u.id)
      log.push({ who: label, skipped: 'no phone and no email' })
      continue
    }

    if (dry) { log.push({ who: label, would_tag: [TAG_APP] }); continue }

    const ok = await upsertAndTag(GHL_API_KEY, { name: u.mother_name ?? null, phone: u.phone_number ?? null, email: u.email ?? null }, [TAG_APP], log, label)
    if (!ok) continue
    await supabase.from('user_profiles').update({ crm_synced_at: new Date().toISOString() }).eq('id', u.id)
    usersTagged++
  }

  const summary = { dry, pending_regs: (regs ?? []).length, pending_users: (users ?? []).length, eventTagged, usersTagged, log }
  console.log('[sync-community-to-crm]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
