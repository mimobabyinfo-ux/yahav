// Edge Function: crm-lead-action
//
// Called from the admin "לידים" screen to record the outcome of a call and
// write it straight into GHL:
//   no_answer    -> no-answer counter +1 (max 3); ליד חדש moves to אין מענה
//   callback     -> follow-up date (+ optional stage)
//   registered   -> main: ליד נסגר (won) · followup: נרשמה למגלים (won)
//   not_relevant -> main: לא נסגר (lost) · followup: לא רלוונטי (lost)
//   stage        -> move to target_stage_id
//   note         -> note only
//   create_lead  -> new opportunity (ליד חדש) for a contact that wrote us and has none
// Every action also adds a dated note "<actor> - <what happened>" to the contact,
// optionally completes the lead's open tasks, is logged in crm_lead_actions and
// refreshes the lead's row in crm_leads.
//
// Auth: caller must be a Mimo admin (is_admin() with the caller's JWT).
// Secrets: GHL_API_KEY, SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (injected).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GHL_BASE = 'https://services.leadconnectorhq.com'
const LOCATION_ID = 'zcdg19h82AGIAbya6T0r'
const MAIN = 'rj5CZnV4zw0sOaiaA670'
const ST = {
  main_new: 'aba91039-5ea0-4a93-9d1e-b38efa2695d2',
  main_no_answer: 'bdf56a06-8930-4097-b791-55a462010239',
  main_won: '3cec50bf-faea-4b26-b3a5-7ad00f87f555',
  main_lost: 'd2e83e1d-c12f-45c0-823e-da2afd1132cb',
  fu_registered: 'd808f8cb-64e2-4d7c-942c-b9948aca4068',
  fu_lost: 'bbeac603-7990-4eeb-95e1-dc512a01047b',
}
const CF_NO_ANSWER = 'aPUQYoxlqLCVRzZ6uuaU'
const CF_FOLLOW_UP = 'hZjLFoO8BPcdElLqfibT'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function ghl(path: string, method: string, key: string, body?: unknown, version = '2021-07-28') {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Version: version, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { /* */ }
  return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : text.slice(0, 400) }
}

function cfValue(o: any, id: string): any {
  const f = (o?.customFields ?? []).find((c: any) => c.id === id)
  if (!f) return null
  return f.fieldValue ?? f.fieldValueString ?? f.fieldValueDate ?? f.value ?? null
}
function toDate(v: any): string | null {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const URL_ = Deno.env.get('SUPABASE_URL')!
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const KEY = Deno.env.get('GHL_API_KEY')
  if (!KEY) return json({ ok: false, error: 'missing GHL_API_KEY' }, 500)

  // --- auth: admin only
  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } })
  const { data: isAdmin } = await userClient.rpc('is_admin')
  if (!isAdmin) return json({ ok: false, error: 'not admin' }, 403)
  const { data: userData } = await userClient.auth.getUser()
  const sb = createClient(URL_, SERVICE)

  const p = await req.json().catch(() => ({}))
  const action: string = p.action
  const actor: string = (p.actor ?? '').trim()
  const noteText: string = (p.note ?? '').trim()
  const steps: Record<string, unknown> = {}
  let ok = true

  // --- create_lead: contact wrote us but has no opportunity
  if (action === 'create_lead') {
    const r = await ghl('/opportunities/', 'POST', KEY, {
      pipelineId: MAIN, locationId: LOCATION_ID, pipelineStageId: ST.main_new, status: 'open',
      contactId: p.contact_id, name: `${p.lead_name ?? 'ליד'} | ווטסאפ`,
    })
    steps.create = { ok: r.ok, status: r.status, error: r.error }
    ok = r.ok
    if (r.ok && noteText) {
      const n = await ghl(`/contacts/${p.contact_id}/notes`, 'POST', KEY, { body: `${actor ? actor + ' - ' : ''}${noteText}` })
      steps.note = { ok: n.ok, error: n.error }
    }
    if (r.ok) await sb.from('crm_inbound').delete().eq('contact_id', p.contact_id)
    await sb.from('crm_lead_actions').insert({ opp_id: r.data?.opportunity?.id ?? null, contact_id: p.contact_id, lead_name: p.lead_name, action, note: noteText || null, actor, source: p.source ?? 'screen', created_by: userData?.user?.id ?? null, crm_ok: ok, crm_result: steps })
    return json({ ok, steps })
  }

  // --- everything else acts on an existing opportunity
  const oppId: string = p.opp_id
  if (!oppId) return json({ ok: false, error: 'opp_id required' }, 400)
  const cur = await ghl(`/opportunities/${oppId}`, 'GET', KEY)
  if (!cur.ok) return json({ ok: false, error: 'opportunity not found: ' + cur.error }, 404)
  const opp = cur.data?.opportunity ?? cur.data
  const contactId = opp.contactId ?? p.contact_id
  const isMain = opp.pipelineId === MAIN

  const update: Record<string, unknown> = {}
  const customFields: Array<Record<string, unknown>> = []
  let label = ''

  if (action === 'no_answer') {
    const prev = String(cfValue(opp, CF_NO_ANSWER) ?? '')
    const n = Math.min(3, (parseInt(prev.replace(/\D/g, '')) || 0) + 1)
    customFields.push({ id: CF_NO_ANSWER, field_value: `אין מענה ${n}` })
    if (isMain && opp.pipelineStageId === ST.main_new) update.pipelineStageId = ST.main_no_answer
    label = `לא ענתה (ניסיון ${n})`
  } else if (action === 'callback') {
    if (!p.callback_date) return json({ ok: false, error: 'callback_date required' }, 400)
    customFields.push({ id: CF_FOLLOW_UP, field_value: p.callback_date })
    if (p.target_stage_id) update.pipelineStageId = p.target_stage_id
    label = `לחזור ב-${ddmm(p.callback_date)}`
  } else if (action === 'registered') {
    update.pipelineStageId = isMain ? ST.main_won : ST.fu_registered
    update.status = 'won'
    label = 'נרשמה'
  } else if (action === 'not_relevant') {
    update.pipelineStageId = isMain ? ST.main_lost : ST.fu_lost
    update.status = 'lost'
    label = 'לא רלוונטי'
  } else if (action === 'stage') {
    if (!p.target_stage_id) return json({ ok: false, error: 'target_stage_id required' }, 400)
    update.pipelineStageId = p.target_stage_id
    label = 'עודכן שלב'
  } else if (action === 'note') {
    label = 'הערה'
  } else {
    return json({ ok: false, error: 'unknown action' }, 400)
  }

  // 1. opportunity update
  if (Object.keys(update).length || customFields.length) {
    const body: Record<string, unknown> = { ...update }
    if (update.pipelineStageId) body.pipelineId = opp.pipelineId
    if (customFields.length) body.customFields = customFields
    let r = await ghl(`/opportunities/${oppId}`, 'PUT', KEY, body)
    if (!r.ok && customFields.length) {
      // Some GHL versions want fieldValue instead of field_value.
      body.customFields = customFields.map(c => ({ id: c.id, fieldValue: c.field_value }))
      r = await ghl(`/opportunities/${oppId}`, 'PUT', KEY, body)
    }
    steps.opportunity = { ok: r.ok, status: r.status, error: r.error }
    if (!r.ok) ok = false
  }

  // 2. note on the contact
  const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' })
  const noteBody = `${actor ? actor + ' - ' : ''}${label}${noteText ? '\n' + noteText : ''}`
  if (contactId && (action !== 'note' || noteText)) {
    const n = await ghl(`/contacts/${contactId}/notes`, 'POST', KEY, { body: noteBody })
    steps.note = { ok: n.ok, status: n.status, error: n.error }
    if (!n.ok) ok = false
  }

  // 3. complete open tasks the user chose to close
  const taskIds: string[] = Array.isArray(p.complete_task_ids) ? p.complete_task_ids : []
  if (contactId && taskIds.length) {
    const res: unknown[] = []
    for (const tid of taskIds) {
      const t = await ghl(`/contacts/${contactId}/tasks/${tid}/completed`, 'PUT', KEY, { completed: true })
      res.push({ id: tid, ok: t.ok, error: t.error })
      if (!t.ok) ok = false
    }
    steps.tasks = res
  }

  // 4. read back and refresh the lead row
  const after = await ghl(`/opportunities/${oppId}`, 'GET', KEY)
  const o2 = after.data?.opportunity ?? after.data ?? {}
  const { data: row } = await sb.from('crm_leads').select('notes, open_tasks').eq('opp_id', oppId).maybeSingle()
  const notes = [{ date: new Date().toISOString().slice(0, 10), body: noteBody }, ...((row?.notes as any[]) ?? [])].slice(0, 8)
  const openTasks = ((row?.open_tasks as any[]) ?? []).filter(t => !taskIds.includes(t.id))
  const pipes = await ghl(`/opportunities/pipelines?locationId=${LOCATION_ID}`, 'GET', KEY)
  let stageName: string | null = null
  for (const pl of pipes.data?.pipelines ?? []) for (const s of pl.stages ?? []) if (s.id === o2.pipelineStageId) stageName = s.name
  await sb.from('crm_leads').update({
    stage_id: o2.pipelineStageId, stage_name: stageName, status: o2.status,
    is_open: o2.status === 'open',
    no_answer: cfValue(o2, CF_NO_ANSWER), follow_up_date: toDate(cfValue(o2, CF_FOLLOW_UP)),
    notes: (action !== 'note' || noteText) ? notes : row?.notes, open_tasks: openTasks,
    last_action_at: new Date().toISOString(), last_action_label: `${label}${actor ? ' · ' + actor : ''} · ${today}`,
  }).eq('opp_id', oppId)

  steps.readback = { stage: stageName, status: o2.status, no_answer: cfValue(o2, CF_NO_ANSWER), follow_up: toDate(cfValue(o2, CF_FOLLOW_UP)) }
  await sb.from('crm_lead_actions').insert({
    opp_id: oppId, contact_id: contactId, lead_name: opp.name, action, note: noteText || null,
    callback_date: p.callback_date ?? null, target_stage_id: p.target_stage_id ?? null, actor,
    source: p.source ?? 'screen', created_by: userData?.user?.id ?? null, crm_ok: ok, crm_result: steps,
  })
  return json({ ok, label, steps })
})
