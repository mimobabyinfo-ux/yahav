import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, type Workshop, type WorkshopCohort, type CommunityEvent, type HomeAnnouncement } from '../../lib/supabase'
import { deriveAdminTasks, applyDismissals, type AdminTask, type ManualTask, type TaskLead, type LinkedFormDef, type LinkedSubmission, type PaymentClaim } from './adminTasks'
import { deriveMegalimCandidates, type MegalimCandidatesResult, type ProfileDob } from './megalimCandidates'

// One shared fetch for the admin home screen + sidebar badges — called
// once at App level when admin mode is on, passed down so AdminHome and
// AdminSidebar never double-fetch (handoff §3: the task rules feed both).

function todayIsrael(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

export type CapacityRow = {
  kind: 'cohort' | 'event'
  id: string
  title: string
  date: string           // YYYY-MM-DD
  time: string | null    // HH:MM
  count: number
  capacity: number | null
}

export type AdminOverview = {
  loading: boolean
  /** Derived tasks AFTER persisted dismissals were applied. */
  tasks: AdminTask[]
  /** Open manual tasks (admin_tasks table, phase 2). */
  manualTasks: ManualTask[]
  counters: { pendingPayment: number; monthRevenue: number; activeRegistrations: number }
  /** Mothers who said they paid outside the app, awaiting confirmation.
   *  Drives the אירועים badge — Brenda 17.8.26: "I want it to pop up as a
   *  1 and then I'll go in." */
  paymentClaimCount: number
  capacity: CapacityRow[]
  /** עטופים graduates whose baby just reached the מגלים age window. */
  megalim: MegalimCandidatesResult
  announcements: HomeAnnouncement[]
  storeProducts: Workshop[]        // active store products sorted by display_order
  upcomingEvents: CommunityEvent[]
  eventsMissingVendor: CommunityEvent[]
  recentPartnerLeads: number       // last 7 days (partner_leads has no handled flag yet)
  reload: () => void
}

export function useAdminOverview(enabled: boolean): AdminOverview {
  const [loading, setLoading] = useState(true)
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [checkinEventIds, setCheckinEventIds] = useState<Set<string>>(new Set())
  const [leads, setLeads] = useState<TaskLead[]>([])
  const [leadCohortIds, setLeadCohortIds] = useState<Map<string, string | null>>(new Map())
  const [eventRegCounts, setEventRegCounts] = useState<Map<string, number>>(new Map())
  const [formDefs, setFormDefs] = useState<Map<string, LinkedFormDef>>(new Map())
  const [formSubs, setFormSubs] = useState<LinkedSubmission[]>([])
  const [announcements, setAnnouncements] = useState<HomeAnnouncement[]>([])
  const [profileDobs, setProfileDobs] = useState<ProfileDob[]>([])
  const [recentPartnerLeads, setRecentPartnerLeads] = useState(0)
  // Phase 2: manual tasks + dismissal timestamps (task_key → dismissed_at).
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([])
  const [dismissals, setDismissals] = useState<Map<string, string>>(new Map())
  // Declared Bit/transfer payments awaiting Brenda's confirmation.
  const [paymentClaims, setPaymentClaims] = useState<PaymentClaim[]>([])

  const load = useCallback(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const [ws, cs, evs, toks, lds, evRegs, claims, anns, pls, mts, dms, dobs] = await Promise.all([
      supabase.from('workshops').select('*').order('display_order'),
      supabase.from('workshop_cohorts').select('*').order('start_date'),
      supabase.from('community_events').select('*').order('event_date'),
      supabase.from('event_checkin_tokens').select('event_id'),
      supabase.from('registration_leads').select('id, name, phone, email, status, created_at, selected_workshop_id, cohort_id'),
      supabase.from('event_registrations').select('event_id, status'),
      supabase.from('event_registrations')
        .select('event_id, payment_claimed_at, community_events(title), user_profiles(mother_name)')
        .not('payment_claimed_at', 'is', null)
        .eq('paid', false),
      supabase.from('home_announcements').select('*').order('display_order'),
      supabase.from('partner_leads').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('admin_tasks').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('admin_task_dismissals').select('*'),
      // Second source for a baby's age, behind the questionnaire: app
      // users who filled their profile.
      supabase.from('user_profiles').select('normalized_phone, baby_name, baby_dob').not('baby_dob', 'is', null),
    ])
    const wsList = (ws.data ?? []) as Workshop[]
    setWorkshops(wsList)
    setCohorts((cs.data ?? []) as WorkshopCohort[])
    setEvents((evs.data ?? []) as CommunityEvent[])
    setCheckinEventIds(new Set(((toks.data ?? []) as { event_id: string }[]).map(t => t.event_id)))
    const leadRows = (lds.data ?? []) as (TaskLead & { cohort_id: string | null })[]
    setLeads(leadRows)
    setLeadCohortIds(new Map(leadRows.map(l => [l.id, l.cohort_id])))
    const evCount = new Map<string, number>()
    for (const r of (evRegs.data ?? []) as { event_id: string; status: string }[]) {
      if (r.status === 'registered' || r.status === 'attended') {
        evCount.set(r.event_id, (evCount.get(r.event_id) ?? 0) + 1)
      }
    }
    setEventRegCounts(evCount)
    setPaymentClaims(((claims.data ?? []) as unknown as {
      event_id: string; payment_claimed_at: string
      community_events: { title: string } | null
      user_profiles: { mother_name: string | null } | null
    }[]).map(c => ({
      event_id: c.event_id,
      event_title: c.community_events?.title ?? 'אירוע',
      mother_name: c.user_profiles?.mother_name ?? null,
      claimed_at: c.payment_claimed_at,
    })))
    setAnnouncements((anns.data ?? []) as HomeAnnouncement[])
    setProfileDobs((dobs.data ?? []) as ProfileDob[])
    setRecentPartnerLeads(pls.count ?? 0)
    setManualTasks((mts.data ?? []) as ManualTask[])
    setDismissals(new Map(((dms.data ?? []) as { task_key: string; dismissed_at: string }[]).map(d => [d.task_key, d.dismissed_at])))

    // Linked-form defs + submissions for the questionnaire-gap rule.
    const linkedFormIds = Array.from(new Set(wsList.map(x => x.linked_form_id).filter((x): x is string => !!x)))
    if (linkedFormIds.length === 0) {
      setFormDefs(new Map())
      setFormSubs([])
    } else {
      const [formsRes, subsRes] = await Promise.all([
        supabase.from('forms').select('*').in('id', linkedFormIds),
        supabase.from('form_submissions').select('id, form_id, responses_json, created_at, user_profiles(mother_name, email)').in('form_id', linkedFormIds),
      ])
      setFormDefs(new Map(((formsRes.data ?? []) as LinkedFormDef[]).map(f => [f.id, f])))
      setFormSubs((subsRes.data ?? []) as unknown as LinkedSubmission[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])

  const tasks = useMemo(() => {
    if (loading) return []
    const derived = deriveAdminTasks({
      workshops,
      cohorts,
      events,
      checkinEventIds,
      leads,
      linkedFormDefs: formDefs,
      linkedSubmissions: formSubs,
      paymentClaims,
      today: todayIsrael(),
      nowMs: Date.now(),
    })
    // Persisted "טופל": hidden until the source row changes again.
    return applyDismissals(derived, dismissals)
  }, [loading, workshops, cohorts, events, checkinEventIds, leads, formDefs, formSubs, dismissals])

  const counters = useMemo(() => {
    const today = todayIsrael()
    const monthStart = today.slice(0, 8) + '01'
    const pendingPayment = leads.filter(l => l.status === 'pending').length
    // ESTIMATE by product price — registration_leads stores no amount
    // (handoff §7.1). The UI labels it "לפי מחיר המוצר".
    const wById = new Map(workshops.map(w => [w.id, w]))
    let monthRevenue = 0
    for (const l of leads) {
      if (l.status !== 'paid' || l.created_at.slice(0, 10) < monthStart) continue
      monthRevenue += l.selected_workshop_id ? (wById.get(l.selected_workshop_id)?.price ?? 0) : 0
    }
    const activeRegistrations = leads.filter(l => l.status === 'pending' || l.status === 'paid').length
    return { pendingPayment, monthRevenue, activeRegistrations }
  }, [leads, workshops])

  const capacity = useMemo<CapacityRow[]>(() => {
    const today = todayIsrael()
    const wById = new Map(workshops.map(w => [w.id, w]))
    // Reg count per cohort — ALL leads regardless of status, the same
    // definition the public RPC and RegistrationsTab use.
    const byCohort = new Map<string, number>()
    for (const [, cid] of leadCohortIds) {
      if (cid) byCohort.set(cid, (byCohort.get(cid) ?? 0) + 1)
    }
    const rows: CapacityRow[] = []
    for (const c of cohorts) {
      if (!c.is_active || c.start_date < today) continue
      const w = wById.get(c.workshop_id)
      rows.push({
        kind: 'cohort',
        id: c.id,
        title: w?.title ?? 'מחזור',
        date: c.start_date,
        time: c.start_time ? c.start_time.slice(0, 5) : null,
        count: byCohort.get(c.id) ?? 0,
        // effectiveCapacity: cohort override ?? workshop per-cohort max.
        capacity: c.capacity ?? w?.stock_quantity ?? null,
      })
    }
    for (const ev of events) {
      if (!ev.is_active || ev.event_date < today) continue
      rows.push({
        kind: 'event',
        id: ev.id,
        title: `${ev.emoji ? `${ev.emoji} ` : ''}${ev.title}`,
        date: ev.event_date,
        time: ev.start_time ? ev.start_time.slice(0, 5) : null,
        count: eventRegCounts.get(ev.id) ?? 0,
        capacity: ev.capacity,
      })
    }
    return rows.sort((a, b) => a.date === b.date ? (a.time ?? '').localeCompare(b.time ?? '') : a.date.localeCompare(b.date))
  }, [cohorts, events, workshops, leadCohortIds, eventRegCounts])

  // מועמדות למגלים — age-based, unlike the CRM's fixed +14d follow-up.
  const megalim = useMemo<MegalimCandidatesResult>(() => {
    if (loading) {
      return { candidates: [], unknownDobCount: 0, targetTitle: null, fromMonths: 2.5, toMonths: 6 }
    }
    return deriveMegalimCandidates({
      workshops,
      cohorts,
      leads: leads.map(l => ({ ...l, cohort_id: leadCohortIds.get(l.id) ?? null })),
      formDefs,
      submissions: formSubs,
      profiles: profileDobs,
      today: todayIsrael(),
    })
  }, [loading, workshops, cohorts, leads, leadCohortIds, formDefs, formSubs, profileDobs])

  const storeProducts = useMemo(
    () => workshops.filter(w => w.is_active && w.workshop_type != null),
    [workshops],
  )

  const upcomingEvents = useMemo(() => {
    const today = todayIsrael()
    return events.filter(ev => ev.event_date >= today)
  }, [events])

  const eventsMissingVendor = useMemo(
    () => upcomingEvents.filter(ev => ev.is_active && !ev.vendor_id && !ev.vendor_name),
    [upcomingEvents],
  )

  return { loading, tasks, manualTasks, counters, paymentClaimCount: paymentClaims.length, capacity, megalim, announcements, storeProducts, upcomingEvents, eventsMissingVendor, recentPartnerLeads, reload: load }
}
