// Edge Function: crm-leads-sync
//
// Mirrors every OPEN opportunity of the two GHL pipelines into public.crm_leads
// (the admin "לידים" screen reads only from there), plus contacts whose last
// message was inbound and who have no open opportunity (never a lead, or wrote again
// after being closed) into public.crm_inbound.
// Runs every 5 minutes (pg_cron job 'crm-leads-sync-5min') and on demand from
// the screen's refresh button.
//
// Never writes to GHL. Brief_* columns (Claude's round cards) and last_action_*
// are left untouched by the upsert.
//
// Secrets: GHL_API_KEY, SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (injected).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const PIPELINES: Record<string, 'main' | 'followup'> = {
  rj5CZnV4zw0sOaiaA670: 'main',
  dKfel0KnRVcLL9b6MxKT: 'followup',
}
const CF_NO_ANSWER = 'aPUQYoxlqLCVRzZ6uuaU'
const CF_FOLLOW_UP = 'hZjLFoO8BPcdElLqfibT'
const CF_PRODUCT = 'ob8OoI1EWDWQSqTmFBRp'
// Internal / test contacts that must never show up as leads.
const IGNORE_PHONES = new Set(['+972545243363', '+972559904274', '+972506560837'])

async function ghlGet(path: string, key: string, version = '2021-07-28') {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Version: version, Accept: 'application/json' },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GHL ${res.status} ${path}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

function localPhone(p?: string | null): string | null {
  if (!p) return null
  let d = p.replace(/[^\d]/g, '')
  if (d.startsWith('972')) d = '0' + d.slice(3)
  return d.length >= 9 ? d : null
}

function cfValue(o: any, id: string): any {
  const f = (o.customFields ?? []).find((c: any) => c.id === id)
  if (!f) return null
  return f.fieldValue ?? f.fieldValueString ?? f.fieldValueDate ?? f.fieldValueArray ?? f.value ?? null
}

function toDate(v: any): string | null {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

async function fetchPipeline(pipelineId: string, key: string) {
  const out: any[] = []
  let url = `/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${pipelineId}&status=open&limit=100&getNotes=true&getTasks=true`
  for (let i = 0; i < 10; i++) {
    const data = await ghlGet(url, key)
    const opps = data.opportunities ?? []
    out.push(...opps)
    const meta = data.meta ?? {}
    if (opps.length < 100 || !meta.startAfterId) break
    url = `/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${pipelineId}&status=open&limit=100&getNotes=true&getTasks=true&startAfter=${meta.startAfter}&startAfterId=${meta.startAfterId}`
  }
  return out
}

const DECLINE = /לא רלוונטי|לא מתאפשר|לא תודה|לא מעוניינ|לא מתאים|פחות מתאים|לצערי/
const INQUIRY = /\?|פרטים|מתי|מחזור|להירשם|הרשמה|מחיר|עולה|כמה|מעוניינת|אשמח|רוצה|סדנ/
function looksLikeInquiry(text: string): boolean {
  return !DECLINE.test(text) && INQUIRY.test(text)
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  // The admin screen's refresh button calls this from the browser, so it needs CORS.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const KEY = Deno.env.get('GHL_API_KEY')
  if (!KEY) return new Response(JSON.stringify({ error: 'missing GHL_API_KEY' }), { status: 500, headers: cors })
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE)
  const started = new Date().toISOString()

  try {
    // 1. Pipelines -> stage names
    const pipes = await ghlGet(`/opportunities/pipelines?locationId=${LOCATION_ID}`, KEY)
    const stageName: Record<string, string> = {}
    for (const p of pipes.pipelines ?? []) for (const s of p.stages ?? []) stageName[s.id] = s.name

    // 2. Open opportunities
    const opps: any[] = []
    for (const pid of Object.keys(PIPELINES)) opps.push(...(await fetchPipeline(pid, KEY)))

    // 3. Recent inbound conversations (last message from the mother)
    const conv = await ghlGet(`/conversations/search?locationId=${LOCATION_ID}&lastMessageDirection=inbound&sortBy=last_message_date&sort=desc&limit=100`, KEY, '2021-04-15')
    const inboundByContact: Record<string, any> = {}
    for (const c of conv.conversations ?? []) {
      if (!c.contactId || inboundByContact[c.contactId]) continue
      if (!['TYPE_WHATSAPP', 'TYPE_SMS', 'TYPE_INSTAGRAM', 'TYPE_FACEBOOK', 'TYPE_EMAIL'].includes(c.lastMessageType)) continue
      inboundByContact[c.contactId] = c
    }

    // 4. Mimo app purchases, matched by phone
    const phones = [...new Set(opps.map(o => localPhone(o.contact?.phone)).filter(Boolean))] as string[]
    const appByPhone: Record<string, { summary: string[]; paidFuture: boolean }> = {}
    if (phones.length) {
      const { data: regs } = await sb.from('registration_leads')
        .select('normalized_phone, status, created_at, selected_workshop_id, cohort_id')
        .in('normalized_phone', phones)
        .in('status', ['paid', 'pending'])
      const wsIds = [...new Set((regs ?? []).map((r: any) => r.selected_workshop_id).filter(Boolean))]
      const coIds = [...new Set((regs ?? []).map((r: any) => r.cohort_id).filter(Boolean))]
      const { data: wss } = wsIds.length ? await sb.from('workshops').select('id, title').in('id', wsIds) : { data: [] }
      const { data: cos } = coIds.length ? await sb.from('workshop_cohorts').select('id, start_date').in('id', coIds) : { data: [] }
      const wsTitle = Object.fromEntries((wss ?? []).map((w: any) => [w.id, w.title]))
      const coDate = Object.fromEntries((cos ?? []).map((c: any) => [c.id, c.start_date]))
      const today = new Date().toISOString().slice(0, 10)
      for (const r of (regs ?? []) as any[]) {
        const e = (appByPhone[r.normalized_phone] ??= { summary: [], paidFuture: false })
        const title = String(wsTitle[r.selected_workshop_id] ?? '').replace('ליווי התפתחותי - ', '')
        const sd = (r.cohort_id ? coDate[r.cohort_id] : undefined) as string | undefined
        const when = sd ? ` ${sd.slice(8, 10)}/${sd.slice(5, 7)}` : ''
        e.summary.push(`${r.status === 'paid' ? 'שילמה' : 'התחילה הרשמה'}: ${title}${when}`)
        if (r.status === 'paid' && sd && sd >= today) e.paidFuture = true
      }
    }

    // 5. Build rows
    const openContactIds = new Set<string>()
    const rows = opps.map((o: any) => {
      const phone = o.contact?.phone ?? null
      const pl = localPhone(phone)
      if (o.contactId) openContactIds.add(o.contactId)
      const notes = ((o.notes?.notes ?? o.notes ?? []) as any[])
        .filter(n => n?.createdBy?.source !== 'WORKFLOW_NEW' && (n.bodyText || n.body))
        .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)))
        .slice(0, 8)
        .map(n => ({ date: String(n.dateAdded), body: String(n.bodyText || n.body).slice(0, 1200) }))
      const tasksRaw = Array.isArray(o.tasks) ? o.tasks : (o.tasks?.tasks ?? [])
      const openTasks = tasksRaw.filter((t: any) => !t.completed)
        .map((t: any) => ({ id: t.id ?? t._id, title: t.title, due: t.dueDate }))
      const inbound = o.contactId ? inboundByContact[o.contactId] : null
      const app = pl ? appByPhone[pl] : undefined
      const product = cfValue(o, CF_PRODUCT)
      return {
        opp_id: o.id,
        contact_id: o.contactId,
        pipeline: PIPELINES[o.pipelineId] ?? 'main',
        pipeline_id: o.pipelineId,
        stage_id: o.pipelineStageId,
        stage_name: stageName[o.pipelineStageId] ?? null,
        status: o.status,
        name: o.contact?.name ?? o.name,
        phone,
        phone_local: pl,
        email: o.contact?.email ?? null,
        tags: o.contact?.tags ?? [],
        source: o.source ?? null,
        products: Array.isArray(product) ? product : product ? [String(product)] : [],
        no_answer: cfValue(o, CF_NO_ANSWER),
        follow_up_date: toDate(cfValue(o, CF_FOLLOW_UP)),
        crm_created_at: o.createdAt,
        stage_changed_at: o.lastStageChangeAt ?? null,
        crm_updated_at: o.updatedAt,
        notes,
        open_tasks: openTasks,
        last_inbound_at: inbound ? new Date(inbound.lastMessageDate).toISOString() : null,
        last_inbound_text: inbound ? String(inbound.lastMessageBody ?? '').slice(0, 500) : null,
        app_summary: app ? app.summary.join(' · ') : null,
        app_paid_future: app?.paidFuture ?? false,
        synced_at: started,
        is_open: true,
      }
    }).filter(r => !IGNORE_PHONES.has(r.phone ?? ''))

    if (rows.length) {
      const { error } = await sb.from('crm_leads').upsert(rows, { onConflict: 'opp_id' })
      if (error) throw new Error('upsert crm_leads: ' + error.message)
    }
    // Opportunities that are no longer open (won/lost/moved out) disappear from the queue.
    await sb.from('crm_leads').update({ is_open: false }).lt('synced_at', started).eq('is_open', true)

    // 6. Inbound from contacts with no open opportunity (last 7 days)
    const weekAgo = Date.now() - 7 * 86400000
    const inboundCandidates = Object.values(inboundByContact)
      .filter((c: any) => !openContactIds.has(c.contactId) && c.lastMessageDate >= weekAgo)
      .filter((c: any) => !IGNORE_PHONES.has(c.phone ?? '') && !!c.phone)
      // Customers chatting after they paid, and Instagram DMs (mostly other businesses and
      // the comment-to-DM flow), are not leads.
      .filter((c: any) => !(c.tags ?? []).some((t: string) => t.startsWith('שילמה')))
      .filter((c: any) => ['TYPE_WHATSAPP', 'TYPE_SMS', 'TYPE_FACEBOOK'].includes(c.lastMessageType))
      // Only messages that read like an inquiry. Yahav 23.9.26 asked why Hadar Menda ("טסים
      // לחול, כרגע לא רלוונטי") showed up. Declines and small talk ("תודה", "פייס") are out.
      // This is a keyword heuristic, not understanding: the lead rounds still read everything.
      .filter((c: any) => looksLikeInquiry(String(c.lastMessageBody ?? '')))
    // Yahav 23.9.26: "Eden Danon עברה ללא נסגר, למה היא מעניינת אותי?" but also "ודנית
    // איפה היא?" (closed as לא נסגר, then asked when the next cohort opens). Rule:
    //   no opportunity at all                              -> show (new inquiry)
    //   only closed opportunities, she wrote AFTER closing -> show (came back)
    //   closed after her last message                      -> hide (already handled)
    // The conversation payload's opportunities list is not reliable, so ask GHL.
    const neverLead: any[] = []
    for (const c of inboundCandidates) {
      try {
        const r = await ghlGet(`/opportunities/search?location_id=${LOCATION_ID}&contact_id=${c.contactId}&status=all&limit=20`, KEY)
        const list = (r.opportunities ?? []) as any[]
        if (list.some(o => o.status === 'open')) continue
        if (list.length === 0) { neverLead.push({ ...c, _closedStage: null, _closedAt: null }); continue }
        const last = list
          .map(o => ({ at: [o.lastStatusChangeAt, o.lastStageChangeAt, o.createdAt].filter(Boolean).sort().pop(), stage: stageName[o.pipelineStageId] ?? o.status }))
          .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0]
        if (c.lastMessageDate > new Date(last.at).getTime()) neverLead.push({ ...c, _closedStage: last.stage, _closedAt: last.at })
      } catch { /* skip on error, next run retries */ }
    }
    const inboundRows = neverLead
      .map((c: any) => ({
        contact_id: c.contactId,
        name: c.fullName ?? c.contactName,
        phone: c.phone ?? null,
        phone_local: localPhone(c.phone),
        last_message_at: new Date(c.lastMessageDate).toISOString(),
        last_message_text: String(c.lastMessageBody ?? '').slice(0, 500),
        channel: c.lastMessageType,
        has_open_opp: false,
        closed_stage: c._closedStage,
        closed_at: c._closedAt,
        synced_at: started,
      }))
    if (inboundRows.length) {
      const { error } = await sb.from('crm_inbound').upsert(inboundRows, { onConflict: 'contact_id' })
      if (error) throw new Error('upsert crm_inbound: ' + error.message)
    }
    // Contacts that now have an open opp, or answered by us (no longer last-inbound), drop out.
    await sb.from('crm_inbound').delete().lt('synced_at', started)

    const summary = { ok: true, open_leads: rows.length, inbound_without_opp: inboundRows.length }
    return new Response(JSON.stringify(summary), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[crm-leads-sync]', String(e))
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
