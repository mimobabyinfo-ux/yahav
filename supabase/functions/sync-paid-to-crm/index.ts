// Edge Function: sync-paid-to-crm
//
// Runs hourly (pg_cron job 'sync-paid-to-crm-hourly'). Finds registration
// leads whose status became 'paid' and that were not yet synced to the CRM,
// and adds the matching payment tag to the GHL contact:
//   workshop title contains "עטופים" -> tag "שילמה עטופים"
//   workshop title contains "מגלים"  -> tag "שילמה מגלים"
// The GHL workflows ('תשלום התקבל — עטופים' / '— מגלים') then do the rest:
// remove from follow-up sequences, move the opportunity card, clean tags.
//
// Idempotency: registration_leads.crm_paid_synced_at is set per-lead ONLY
// after the tag was applied successfully. Historical paid leads were
// backfilled as synced at rollout so old customers are never re-tagged.
//
// Dry-run: call with ?dry=1 to see what WOULD happen without touching GHL
// or marking anything synced.
//
// Secrets: GHL_API_KEY, SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injected).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const TAG_ATUFIM = 'שילמה עטופים'
const TAG_MEGALIM = 'שילמה מגלים'

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

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const GHL_API_KEY = Deno.env.get('GHL_API_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE) return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  if (!GHL_API_KEY) return new Response(JSON.stringify({ error: 'missing GHL_API_KEY secret' }), { status: 500 })

  const dry = new URL(req.url).searchParams.get('dry') === '1'
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  const { data: leads, error: leadsErr } = await supabase
    .from('registration_leads')
    .select('id, name, phone, normalized_phone, email, cohort_id, selected_workshop_id, utm_content, utm_campaign')
    .eq('status', 'paid')
    .is('crm_paid_synced_at', null)
  if (leadsErr) return new Response(JSON.stringify({ error: leadsErr.message }), { status: 500 })

  const log: Array<Record<string, unknown>> = []
  let tagged = 0

  for (const lead of (leads ?? [])) {
    // Resolve workshop title: via cohort first, else the selected workshop.
    let title = ''
    if (lead.cohort_id) {
      const { data: cohort } = await supabase
        .from('workshop_cohorts').select('workshop_id').eq('id', lead.cohort_id).maybeSingle()
      if (cohort?.workshop_id) {
        const { data: w } = await supabase.from('workshops').select('title').eq('id', cohort.workshop_id).maybeSingle()
        title = w?.title ?? ''
      }
    }
    if (!title && lead.selected_workshop_id) {
      const { data: w } = await supabase.from('workshops').select('title').eq('id', lead.selected_workshop_id).maybeSingle()
      title = w?.title ?? ''
    }

    const tag = title.includes('עטופים') ? TAG_ATUFIM : title.includes('מגלים') ? TAG_MEGALIM : null
    if (!tag) {
      // Workshop type we don't automate -> mark synced so it isn't rescanned.
      if (!dry) {
        await supabase.from('registration_leads').update({ crm_paid_synced_at: new Date().toISOString() }).eq('id', lead.id)
      }
      log.push({ lead: lead.name, workshop: title || '(unknown)', skipped: 'workshop type not tracked' })
      continue
    }

    const phone = normalizePhone(lead.normalized_phone ?? lead.phone)
    if (!phone) {
      if (!dry) {
        await supabase.from('registration_leads').update({ crm_paid_synced_at: new Date().toISOString() }).eq('id', lead.id)
      }
      log.push({ lead: lead.name, skipped: 'no usable phone' })
      continue
    }

    if (dry) {
      log.push({ lead: lead.name, phone, workshop: title, would_tag: tag })
      continue
    }

    // 1. Upsert contact (dedupes by phone/email on GHL side).
    const contactBody: Record<string, unknown> = { locationId: LOCATION_ID, phone }
    if (lead.name) contactBody.name = lead.name
    if (lead.email && String(lead.email).includes('@')) contactBody.email = lead.email
    // Ad attribution (31.8.26): utm_content carries the exact ad name from the
    // marketing site through the app's register page. Surfacing it as the GHL
    // contact source finally links a PAID registration back to its ad.
    if (lead.utm_content) contactBody.source = String(lead.utm_content).slice(0, 200)
    const cRes = await ghl('/contacts/upsert', 'POST', GHL_API_KEY, contactBody)
    const contactId = cRes.data?.contact?.id
    if (!cRes.ok || !contactId) {
      log.push({ lead: lead.name, step: 'contact upsert', error: cRes.error ?? 'no contact id' })
      continue // left unsynced -> retried next run
    }

    // 2. Add the payment tag -> triggers the GHL 'תשלום התקבל' workflow.
    const tRes = await ghl(`/contacts/${contactId}/tags`, 'POST', GHL_API_KEY, { tags: [tag] })
    if (!tRes.ok) {
      log.push({ lead: lead.name, step: 'add tag', error: tRes.error })
      continue // left unsynced -> retried next run
    }

    const { error: updErr } = await supabase
      .from('registration_leads')
      .update({ crm_paid_synced_at: new Date().toISOString() })
      .eq('id', lead.id)
    if (updErr) {
      log.push({ lead: lead.name, warning: `tagged but mark-synced failed: ${updErr.message}` })
      continue
    }
    tagged++
    log.push({ lead: lead.name, tag, status: 'tagged' })
  }

  const summary = { dry, pending: (leads ?? []).length, tagged, log }
  console.log('[sync-paid-to-crm]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
