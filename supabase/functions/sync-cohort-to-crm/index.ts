// Edge Function: sync-cohort-to-crm
//
// Runs daily (pg_cron, see cron job 'sync-cohort-to-crm-daily'). Finds
// workshop cohorts that ENDED and pushes every PAID registrant into the
// GoHighLevel follow-up pipeline ("סדנאות המשך"):
//   - עטופים cohort  -> stage "סיימה עטופים"  (GHL workflow then waits 14d
//                        and sends the מגלים WhatsApp follow-up)
//   - מגלים cohort   -> stage "סיימה מגלים"   (graduate bank, no automation yet)
//   - anything else  -> skipped (marked synced so it isn't rescanned)
//
// Idempotency contract (cohort-level, same as send-cohort-surveys):
//   workshop_cohorts.crm_synced_at is set ONLY after every registrant of
//   the cohort was pushed successfully. A mid-run failure leaves it NULL
//   so the whole cohort is retried on the next daily run.
//
// Guard: cohorts that ended more than MAX_AGE_DAYS ago are marked synced
// WITHOUT creating cards (avoids spamming old graduates on first rollout).
//
// Secrets:
//   GHL_API_KEY               — GoHighLevel Private Integration token
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const PIPELINE_ID = 'dKfel0KnRVcLL9b6MxKT' // סדנאות המשך
const STAGE_FINISHED_ATUFIM = '1fd2b172-bb7e-4a1f-b0a0-cd7243699708' // סיימה עטופים
const STAGE_FINISHED_MEGALIM = '329b295e-32e3-43b1-94fd-a0e113bd8510' // סיימה מגלים

const MAX_AGE_DAYS = 21 // ended longer ago than this -> skip (no cards)
const SYNCED_STATUSES = ['paid'] // registration_leads.status values that count as participants

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

// Normalize Israeli phone numbers to E.164 (+972...). Returns null if unusable.
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  if (digits.startsWith('972')) return '+' + digits
  if (digits.startsWith('0') && digits.length >= 9) return '+972' + digits.slice(1)
  if (digits.length === 9) return '+972' + digits // missing leading 0
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

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const GHL_API_KEY = Deno.env.get('GHL_API_KEY')

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return new Response(JSON.stringify({ error: 'missing Supabase env' }), { status: 500 })
  }
  if (!GHL_API_KEY) {
    return new Response(JSON.stringify({ error: 'missing GHL_API_KEY secret' }), { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const today = todayInJerusalem()

  // Cohorts that ended (end_date < today), active, not yet synced.
  const { data: cohorts, error: cohortErr } = await supabase
    .from('workshop_cohorts')
    .select('id, workshop_id, end_date, label')
    .eq('is_active', true)
    .is('crm_synced_at', null)
    .not('end_date', 'is', null)

  if (cohortErr) {
    return new Response(JSON.stringify({ error: cohortErr.message }), { status: 500 })
  }

  const ended = (cohorts ?? []).filter(c => c.end_date && c.end_date < today)

  const log: Array<Record<string, unknown>> = []
  let cohortsSynced = 0
  let cardsCreated = 0

  for (const cohort of ended) {
    const { data: workshop } = await supabase
      .from('workshops')
      .select('id, title')
      .eq('id', cohort.workshop_id)
      .maybeSingle()

    const title = workshop?.title ?? ''
    let stageId: string | null = null
    let stageName = ''
    if (title.includes('עטופים')) { stageId = STAGE_FINISHED_ATUFIM; stageName = 'סיימה עטופים' }
    else if (title.includes('מגלים')) { stageId = STAGE_FINISHED_MEGALIM; stageName = 'סיימה מגלים' }

    // Not a workshop we track, or too old -> mark synced without cards.
    const tooOld = addDays(cohort.end_date as string, MAX_AGE_DAYS) < today
    if (!stageId || tooOld) {
      await supabase.from('workshop_cohorts')
        .update({ crm_synced_at: new Date().toISOString() })
        .eq('id', cohort.id)
      log.push({ cohort_id: cohort.id, workshop: title, skipped: tooOld ? 'ended too long ago' : 'workshop type not tracked' })
      continue
    }

    const { data: leads, error: leadsErr } = await supabase
      .from('registration_leads')
      .select('id, name, phone, normalized_phone, email, status')
      .eq('cohort_id', cohort.id)
      .in('status', SYNCED_STATUSES)
    if (leadsErr) {
      log.push({ cohort_id: cohort.id, error: `leads query: ${leadsErr.message}` })
      continue
    }

    let allOk = true
    let createdForCohort = 0

    for (const lead of (leads ?? [])) {
      const phone = normalizePhone(lead.normalized_phone ?? lead.phone)
      if (!phone) {
        // No usable phone -> can't WhatsApp her anyway; log and continue (not a failure).
        log.push({ cohort_id: cohort.id, lead: lead.name, skipped: 'no usable phone' })
        continue
      }

      // 1. Upsert contact (dedupes by phone/email on GHL side).
      const contactBody: Record<string, unknown> = {
        locationId: LOCATION_ID,
        name: lead.name ?? undefined,
        phone,
      }
      if (lead.email && String(lead.email).includes('@')) contactBody.email = lead.email
      const cRes = await ghl('/contacts/upsert', 'POST', GHL_API_KEY, contactBody)
      const contactId = cRes.data?.contact?.id
      if (!cRes.ok || !contactId) {
        allOk = false
        log.push({ cohort_id: cohort.id, lead: lead.name, step: 'contact upsert', error: cRes.error ?? 'no contact id' })
        continue
      }

      // 2. Create opportunity in the follow-up stage.
      const oRes = await ghl('/opportunities/', 'POST', GHL_API_KEY, {
        locationId: LOCATION_ID,
        pipelineId: PIPELINE_ID,
        pipelineStageId: stageId,
        contactId,
        name: lead.name || phone,
        status: 'open',
      })
      if (!oRes.ok) {
        allOk = false
        log.push({ cohort_id: cohort.id, lead: lead.name, step: 'opportunity create', error: oRes.error })
        continue
      }
      createdForCohort++
      cardsCreated++
      log.push({ cohort_id: cohort.id, lead: lead.name, status: `card created in "${stageName}"` })
    }

    if (allOk) {
      const { error: updErr } = await supabase
        .from('workshop_cohorts')
        .update({ crm_synced_at: new Date().toISOString() })
        .eq('id', cohort.id)
      if (updErr) {
        log.push({ cohort_id: cohort.id, error: `mark synced failed: ${updErr.message}` })
      } else {
        cohortsSynced++
        log.push({ cohort_id: cohort.id, workshop: title, status: 'cohort_synced', cards: createdForCohort })
      }
    } else {
      log.push({ cohort_id: cohort.id, workshop: title, status: 'left_unsynced_for_retry', cards: createdForCohort })
    }
  }

  const summary = {
    today_jerusalem: today,
    cohorts_ended_pending: ended.length,
    cohorts_synced: cohortsSynced,
    cards_created: cardsCreated,
    log,
  }
  console.log('[sync-cohort-to-crm]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
