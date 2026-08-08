// Edge Function: sync-crm-leads
//
// Runs hourly (pg_cron job 'sync-crm-leads-hourly'). Pulls the GHL
// (MoreThan CRM) opportunity board into `crm_opportunities` so the
// admin תובנות tab can show close rate, days-to-close, the pipeline
// and lost reasons WITHOUT anyone re-typing them into the app.
//
// Direction note: the other three sync-*-to-crm functions push app
// events INTO the CRM. This one is the only reader — the CRM owns the
// lead lifecycle (leads arrive there from Facebook forms and landing
// pages), the app owns registrations and payments.
//
// Lost reasons: GHL returns only `lostReasonId` on an opportunity and
// does not expose the labels in the public API. Every id seen is
// registered in `crm_lost_reasons` with a NULL label, to be named once
// by hand (or by a later endpoint). Until an id is labelled the view
// falls back to the CRM stage name, so the chart is never empty and
// never invents a reason.
//
// Dry-run: ?dry=1 fetches and reports without writing.
//
// Secrets: GHL_API_KEY, SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const PAGE_LIMIT = 100
const MAX_PAGES = 40 // 4,000 opportunities — far above current scale

// Mirror of the app's normalize_il_phone so a CRM contact can be
// matched to a registration later (0XXXXXXXXX).
function normalizeIl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 12 && digits.startsWith('972')) return '0' + digits.slice(3)
  if (digits.length === 11 && digits.startsWith('972')) return '0' + digits.slice(3)
  return digits
}

async function ghl(path: string, apiKey: string): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const res = await fetch(`${GHL_BASE}${path}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Version': GHL_VERSION,
        'Accept': 'application/json',
      },
    })
    const text = await res.text()
    let data: any = null
    try { data = text ? JSON.parse(text) : null } catch { /* non-JSON */ }
    if (!res.ok) return { ok: false, status: res.status, error: text?.slice(0, 300) }
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

  // 1. Pipelines → stage id/name lookup, so the app never has to hold
  //    a copy of Yahav's stage names.
  const pipeRes = await ghl(`/opportunities/pipelines?locationId=${LOCATION_ID}`, GHL_API_KEY)
  if (!pipeRes.ok) {
    return new Response(JSON.stringify({ error: 'pipelines fetch failed', detail: pipeRes.error }), { status: 502 })
  }
  const stageName = new Map<string, string>()
  const pipelineName = new Map<string, string>()
  for (const p of (pipeRes.data?.pipelines ?? [])) {
    pipelineName.set(p.id, p.name)
    for (const s of (p.stages ?? [])) stageName.set(s.id, s.name)
  }

  // 2. Every opportunity, paginated.
  const rows: Record<string, unknown>[] = []
  const lostReasonIds = new Set<string>()
  let url: string | null = `/opportunities/search?location_id=${LOCATION_ID}&limit=${PAGE_LIMIT}`
  let pages = 0
  while (url && pages < MAX_PAGES) {
    const res = await ghl(url, GHL_API_KEY)
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'opportunities fetch failed', page: pages, detail: res.error }), { status: 502 })
    }
    const opps = res.data?.opportunities ?? []
    for (const o of opps) {
      if (o.lostReasonId) lostReasonIds.add(String(o.lostReasonId))
      const phone = o.contact?.phone ?? null
      rows.push({
        id: o.id,
        contact_id: o.contactId ?? o.contact?.id ?? null,
        contact_phone: phone,
        normalized_phone: normalizeIl(phone),
        name: o.name ?? null,
        pipeline_id: o.pipelineId ?? null,
        pipeline_name: pipelineName.get(o.pipelineId) ?? null,
        stage_id: o.pipelineStageId ?? null,
        stage_name: stageName.get(o.pipelineStageId) ?? null,
        status: o.status ?? null,
        lost_reason_id: o.lostReasonId ?? null,
        source: o.source ?? null,
        monetary_value: o.monetaryValue ?? null,
        crm_created_at: o.createdAt ?? null,
        last_status_change_at: o.lastStatusChangeAt ?? null,
        last_stage_change_at: o.lastStageChangeAt ?? null,
        synced_at: new Date().toISOString(),
      })
    }
    pages++
    const next = res.data?.meta?.nextPageUrl
    // nextPageUrl is absolute; keep only the path+query for ghl().
    url = next ? next.replace(GHL_BASE, '') : null
    if (opps.length === 0) break
  }

  if (dry) {
    return new Response(JSON.stringify({
      dry: true, pages, fetched: rows.length,
      lostReasonIds: Array.from(lostReasonIds),
      sample: rows.slice(0, 3),
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  // 3. Upsert in chunks. Opportunities deleted in GHL are pruned by
  //    the stale-row sweep below, keyed on synced_at.
  const runAt = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map(r => ({ ...r, synced_at: runAt }))
    const { error } = await supabase.from('crm_opportunities').upsert(chunk, { onConflict: 'id' })
    if (error) {
      return new Response(JSON.stringify({ error: 'upsert failed', detail: error.message, at: i }), { status: 500 })
    }
  }

  // Rows we didn't see this run no longer exist in the CRM.
  let pruned = 0
  if (rows.length > 0) {
    const { data: gone } = await supabase
      .from('crm_opportunities')
      .delete()
      .lt('synced_at', runAt)
      .select('id')
    pruned = gone?.length ?? 0
  }

  // 4. Register any unseen lost-reason id so it can be labelled.
  if (lostReasonIds.size > 0) {
    await supabase
      .from('crm_lost_reasons')
      .upsert(Array.from(lostReasonIds).map(id => ({ id })), { onConflict: 'id', ignoreDuplicates: true })
  }

  const summary = { pages, synced: rows.length, pruned, lostReasonIds: Array.from(lostReasonIds) }
  console.log('[sync-crm-leads]', JSON.stringify(summary))
  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
