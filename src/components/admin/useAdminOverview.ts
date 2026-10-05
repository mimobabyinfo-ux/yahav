import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, type Workshop, type WorkshopCohort, type CommunityEvent, type HomeAnnouncement } from '../../lib/supabase'
import { deriveAdminTasks, applyDismissals, buildFilledIndex, isFormFilled, type AdminTask, type ManualTask, type TaskLead, type LinkedFormDef, type LinkedSubmission, type PaymentClaim, type UnmatchedPayment, type OpenBalance } from './adminTasks'
import { offerPrice, type RegistrationOffer } from './customerLookup'
import { computeBalance } from './payments'
import { deriveMegalimCandidates, type MegalimCandidatesResult, type ProfileDob } from './megalimCandidates'

// One shared fetch for the admin home screen + sidebar badges — called
// once at App level when admin mode is on, passed down so AdminHome and
// AdminSidebar never double-fetch (handoff §3: the task rules feed both).

function todayIsrael(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

/** The Israeli calendar day a timestamp falls on (YYYY-MM-DD). A payment
 *  at 01:00 on the 1st is this month's money, not last month's. */
function israelDay(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })
}

/** Morning retries a delivery it thinks failed, and every delivery is
 *  logged. Counting the retries would inflate the month. Two rows are the
 *  same payment when the same payer paid the same amount for the same
 *  thing within a few minutes — a mother genuinely buying the same product
 *  twice in that window does not happen, and if it ever did, one seat is
 *  the safer error than two payments that never existed. */
function dedupePayments(rows: MorningPayment[]): MorningPayment[] {
  const WINDOW_MS = 15 * 60 * 1000
  const kept: MorningPayment[] = []
  const seen = new Map<string, number>()   // key → last kept timestamp
  // Oldest first so the FIRST delivery is the one kept.
  for (const r of [...rows].sort((a, b) => a.received_at.localeCompare(b.received_at))) {
    const who = (r.payer_email ?? r.payer_name ?? '').toLowerCase().trim()
    const key = `${who}|${r.total}|${r.description ?? ''}`
    const t = new Date(r.received_at).getTime()
    const prev = seen.get(key)
    if (prev != null && t - prev < WINDOW_MS) continue
    seen.set(key, t)
    kept.push(r)
  }
  return kept.reverse()   // newest first, the order the UI reads in
}

/** 6.10.26 "נרשמו לאחרונה": one line per new registration with everything
 *  Yahav used to piece together from the Morning / Grow emails. */
export type RecentRegistration = {
  id: string
  name: string
  phone: string
  email: string
  created_at: string
  status: 'pending' | 'paid' | 'handled'
  workshopTitle: string | null
  cohort: { start_date: string; start_time: string | null } | null
  /** Product has cohorts but she is not placed in one. */
  needsCohort: boolean
  /** null = the product has no opening questionnaire. */
  formFilled: boolean | null
  /** Recorded payments only (see payments.ts); null = no rows. */
  balanceLeft: number | null
  paidSum: number
}

export type CapacityRow = {
  kind: 'cohort' | 'event'
  id: string
  title: string
  date: string           // YYYY-MM-DD
  time: string | null    // HH:MM
  count: number
  capacity: number | null
  /** Cohort rows: the registrations in it, so a tap opens exactly them. */
  leadIds?: string[]
}

/** One payment Morning actually charged, as it reached our webhook.
 *  This is the money — not a product price, not an estimate. */
export type MorningPayment = {
  id: string
  received_at: string
  description: string | null
  total: number
  payer_name: string | null
  payer_email: string | null
  outcome: string | null
  detail: string | null
}

export type AdminOverview = {
  loading: boolean
  /** Derived tasks AFTER persisted dismissals were applied. */
  tasks: AdminTask[]
  /** Open manual tasks (admin_tasks table, phase 2). */
  manualTasks: ManualTask[]
  counters: { pendingPayment: number; monthRevenue: number; activeRegistrations: number }
  /** Every payment Morning reported this calendar month, newest first —
   *  what the הכנסות tile adds up, so the number can be opened and read
   *  line by line instead of trusted. */
  monthPayments: MorningPayment[]
  /** Mothers who said they paid outside the app, awaiting confirmation.
   *  Drives the אירועים badge — Brenda 17.8.26: "I want it to pop up as a
   *  1 and then I'll go in." */
  paymentClaimCount: number
  capacity: CapacityRow[]
  /** Registrations from the last 14 days, newest first. */
  recentRegistrations: RecentRegistration[]
  /** עטופים graduates whose baby just reached the מגלים age window. */
  megalim: MegalimCandidatesResult
  announcements: HomeAnnouncement[]
  storeProducts: Workshop[]        // active store products sorted by display_order
  upcomingEvents: CommunityEvent[]
  eventsMissingVendor: CommunityEvent[]
  recentPartnerLeads: number       // last 7 days (partner_leads has no handled flag yet)
  reload: () => void
}

type OverviewLead = TaskLead & {
  cohort_id: string | null
  user_id: string | null
  price_due: number | null
  workshop_offers: RegistrationOffer | null
}

export function useAdminOverview(enabled: boolean): AdminOverview {
  const [loading, setLoading] = useState(true)
  const [workshops, setWorkshops] = useState<Workshop[]>([])
  const [cohorts, setCohorts] = useState<WorkshopCohort[]>([])
  const [events, setEvents] = useState<CommunityEvent[]>([])
  const [checkinEventIds, setCheckinEventIds] = useState<Set<string>>(new Set())
  const [leads, setLeads] = useState<OverviewLead[]>([])
  const [leadPayments, setLeadPayments] = useState<Map<string, { amount: number }[]>>(new Map())
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
  const [eventWaiting, setEventWaiting] = useState<Map<string, number>>(new Map())
  const [eventSeatsTaken, setEventSeatsTaken] = useState<Map<string, number>>(new Map())
  const [unmatchedPayments, setUnmatchedPayments] = useState<UnmatchedPayment[]>([])
  const [payments, setPayments] = useState<MorningPayment[]>([])

  const load = useCallback(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const [ws, cs, evs, toks, lds, evRegs, claims, anns, pls, mts, dms, dobs, wls, hooks, pays, lps] = await Promise.all([
      supabase.from('workshops').select('*').order('display_order'),
      supabase.from('workshop_cohorts').select('*').order('start_date'),
      supabase.from('community_events').select('*').order('event_date'),
      supabase.from('event_checkin_tokens').select('event_id'),
      supabase.from('registration_leads').select('id, name, phone, email, status, created_at, selected_workshop_id, cohort_id, user_id, price_due, workshop_offers:offer_id(id, workshop_id, label, discount_type, discount_value)'),
      // guest_names too: the room fills by SEATS, not by rows. The home
      // screen used to count rows while the Events tab counted seats, so
      // the same event showed two different numbers.
      supabase.from('event_registrations').select('event_id, status, guest_names'),
      supabase.from('event_registrations')
        .select('event_id, payment_claimed_at, community_events(title), user_profiles(mother_name)')
        .not('payment_claimed_at', 'is', null)
        .eq('paid', false),
      supabase.from('home_announcements').select('*').order('display_order'),
      supabase.from('partner_leads').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('admin_tasks').select('*').eq('status', 'open').order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('admin_task_dismissals').select('*'),
      // Second source for a baby's age, behind the questionnaire: app
      // users who filled their profile.
      supabase.from('user_profiles').select('normalized_phone, baby_name, baby_dob').not('baby_dob', 'is', null),
      supabase.from('event_waitlist').select('event_id').eq('status', 'waiting'),
      // Money that arrived and could not be given a seat. The webhook has
      // logged every delivery since 17.8; nothing read it until now, so a
      // payment could land with no registration and no signal at all.
      supabase.from('morning_webhook_log')
        .select('id, received_at, payer_name, payer_email, payer_phone, description, total, detail, outcome')
        .neq('outcome', 'digital_course')
        .gte('received_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('received_at', { ascending: false })
        .limit(50),
      // THE MONEY. Every delivery Morning made, with the amount it
      // actually charged — the discount, the pair price, the ₪1 test.
      // 90 days so this month and the two before it can be read.
      supabase.from('morning_webhook_log')
        .select('id, received_at, description, total, payer_name, payer_email, outcome, detail')
        .gte('received_at', new Date(Date.now() - 90 * 86400000).toISOString())
        .order('received_at', { ascending: false })
        .limit(500),
      // 6.10.26: recorded payments per registration (partial / cash).
      supabase.from('lead_payments').select('lead_id, amount'),
    ])
    const wsList = (ws.data ?? []) as Workshop[]
    setWorkshops(wsList)
    setCohorts((cs.data ?? []) as WorkshopCohort[])
    setEvents((evs.data ?? []) as CommunityEvent[])
    setCheckinEventIds(new Set(((toks.data ?? []) as { event_id: string }[]).map(t => t.event_id)))
    const leadRows = (lds.data ?? []) as unknown as OverviewLead[]
    setLeads(leadRows)
    const pm = new Map<string, { amount: number }[]>()
    for (const r of (lps.data ?? []) as { lead_id: string; amount: number }[]) {
      const list = pm.get(r.lead_id) ?? []
      list.push({ amount: Number(r.amount) })
      pm.set(r.lead_id, list)
    }
    setLeadPayments(pm)
    setLeadCohortIds(new Map(leadRows.map(l => [l.id, l.cohort_id])))
    // Two different questions, so two different counts.
    //  · taken  — how full the room is NOW. Must agree with the server's
    //    event_seats_taken (registered + attended), or the "מלא" task
    //    fires at a different moment than the app actually stops taking
    //    registrations.
    //  · signed — how many signed up, ever. Includes no_show, because a
    //    woman who registered and did not turn up still registered. The
    //    nightly auto-noshow job flips whole past events to no_show, and
    //    counting only the first set made every event the vendor forgot to
    //    check in read as "nobody signed up".
    const evCount = new Map<string, number>()
    const evSigned = new Map<string, number>()
    for (const r of (evRegs.data ?? []) as { event_id: string; status: string; guest_names: string[] | null }[]) {
      const seats = 1 + (r.guest_names?.length ?? 0)
      if (r.status === 'registered' || r.status === 'attended') {
        evCount.set(r.event_id, (evCount.get(r.event_id) ?? 0) + seats)
      }
      if (r.status === 'registered' || r.status === 'attended' || r.status === 'no_show') {
        evSigned.set(r.event_id, (evSigned.get(r.event_id) ?? 0) + seats)
      }
    }
    setEventRegCounts(evSigned)
    setEventSeatsTaken(evCount)
    const wlCount = new Map<string, number>()
    for (const w of (wls.data ?? []) as { event_id: string }[]) {
      wlCount.set(w.event_id, (wlCount.get(w.event_id) ?? 0) + 1)
    }
    setEventWaiting(wlCount)
    setPayments(dedupePayments((pays.data ?? []) as MorningPayment[]))
    setUnmatchedPayments(((hooks.data ?? []) as (UnmatchedPayment & { outcome: string | null })[]).filter(h => {
      // 6.10.26: attached by hand, or closed as not-a-registration.
      if (h.outcome === 'manual_match' || h.outcome === 'dismissed') return false
      const d = h.detail ?? ''
      // Only deliveries where nobody got a seat. price_mismatch is
      // appended to CONFIRMED rows too — the seat was assigned, the amount
      // just looked odd — so matching on it flagged successful payments as
      // lost ones. A confirmed or already-handled delivery is not a task.
      if (d.startsWith('confirmed') || d.startsWith('created') || d.startsWith('already')) return false
      return d.includes('no_seat_match') || d.includes('ambiguous') ||
             d.includes('no_account_for_payer') || d.includes('no_matching_lead')
    }))
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
      // The forms an answer may come from: each product's form, plus the
      // form it accepts instead (counts_as_filled_by).
      const formsRes = await supabase.from('forms').select('*').in('id', linkedFormIds)
      const defs = (formsRes.data ?? []) as LinkedFormDef[]
      const allIds = Array.from(new Set([...linkedFormIds, ...defs.map(f => f.counts_as_filled_by).filter((x): x is string => !!x)]))
      const extra = allIds.filter(id => !defs.some(d => d.id === id))
      const [extraRes, subsRes] = await Promise.all([
        extra.length ? supabase.from('forms').select('*').in('id', extra) : Promise.resolve({ data: [] as LinkedFormDef[] }),
        supabase.from('form_submissions').select('id, form_id, user_id, responses_json, created_at, user_profiles(mother_name, email)').in('form_id', allIds),
      ])
      setFormDefs(new Map([...defs, ...((extraRes.data ?? []) as LinkedFormDef[])].map(f => [f.id, f])))
      setFormSubs((subsRes.data ?? []) as unknown as LinkedSubmission[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (enabled) load()
  }, [enabled, load])

  // What each registration should cost: the agreed price, else the offer
  // price, else the product price.
  const dueOf = useCallback((l: OverviewLead): number | null => {
    if (l.price_due != null) return Number(l.price_due)
    const w = workshops.find(x => x.id === l.selected_workshop_id)
    const list = w?.price ?? null
    if (l.workshop_offers && w && l.workshop_offers.workshop_id === w.id) {
      const d = offerPrice(l.workshop_offers, list)
      if (d != null) return d
    }
    return list
  }, [workshops])

  const openBalances = useMemo<OpenBalance[]>(() => {
    const out: OpenBalance[] = []
    for (const l of leads) {
      const rows = leadPayments.get(l.id)
      if (!rows || l.status === 'pending') continue
      const b = computeBalance(rows, dueOf(l))
      if (b.left != null && b.left > 0) {
        out.push({ leadId: l.id, name: l.name, left: b.left, workshopTitle: workshops.find(w => w.id === l.selected_workshop_id)?.title ?? null })
      }
    }
    return out
  }, [leads, leadPayments, dueOf, workshops])

  const recentRegistrations = useMemo<RecentRegistration[]>(() => {
    if (loading) return []
    const since = Date.now() - 14 * 86400000
    const wById = new Map(workshops.map(w => [w.id, w]))
    const cById = new Map(cohorts.map(c => [c.id, c]))
    const withCohorts = new Set(cohorts.map(c => c.workshop_id))
    const filled = buildFilledIndex(formDefs, formSubs)
    return leads
      .filter(l => new Date(l.created_at).getTime() >= since)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(l => {
        const w = l.selected_workshop_id ? wById.get(l.selected_workshop_id) : undefined
        const c = l.cohort_id ? cById.get(l.cohort_id) : undefined
        const rows = leadPayments.get(l.id) ?? []
        const b = computeBalance(rows, dueOf(l))
        return {
          id: l.id, name: l.name, phone: l.phone, email: l.email, created_at: l.created_at,
          status: l.status,
          workshopTitle: w?.title ?? null,
          cohort: c ? { start_date: c.start_date, start_time: c.start_time } : null,
          needsCohort: !c && !!w && withCohorts.has(w.id),
          formFilled: w?.linked_form_id && formDefs.has(w.linked_form_id) ? isFormFilled(w.linked_form_id, l, formDefs, filled) : null,
          balanceLeft: b.left,
          paidSum: b.paid,
        }
      })
  }, [loading, leads, workshops, cohorts, formDefs, formSubs, leadPayments, dueOf])

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
      eventSeats: new Map(events.map(e => [e.id, {
        taken: eventSeatsTaken.get(e.id) ?? 0,
        capacity: e.capacity ?? null,
      }])),
      eventWaiting,
      unmatchedPayments,
      openBalances,
      today: todayIsrael(),
      nowMs: Date.now(),
    })
    // Persisted "טופל": hidden until the source row changes again.
    return applyDismissals(derived, dismissals)
  }, [loading, workshops, cohorts, events, checkinEventIds, leads, formDefs, formSubs, dismissals, paymentClaims, eventSeatsTaken, eventWaiting, unmatchedPayments, openBalances])

  // Everything Morning charged since the 1st of this month, Israel time.
  const monthPayments = useMemo<MorningPayment[]>(() => {
    const monthStart = todayIsrael().slice(0, 8) + '01'
    return payments.filter(p => israelDay(p.received_at) >= monthStart)
  }, [payments])

  const counters = useMemo(() => {
    const pendingPayment = leads.filter(l => l.status === 'pending').length
    // THE MONEY, not an estimate. This used to add up product LIST prices
    // for every lead marked paid, so a ₪800 workshop sold at 10% off still
    // counted ₪800 and two of them read ₪1,600 instead of ₪1,440 (Brenda
    // 1.9.26). Morning tells us what it actually charged; that is the only
    // number worth showing. Nothing before 17.8.26 — the webhook log
    // starts there, and an invented figure for August would be the same
    // mistake in a different direction.
    const monthRevenue = monthPayments.reduce((sum, p) => sum + Number(p.total ?? 0), 0)
    const activeRegistrations = leads.filter(l => l.status === 'pending' || l.status === 'paid').length
    return { pendingPayment, monthRevenue, activeRegistrations }
  }, [leads, monthPayments])

  const capacity = useMemo<CapacityRow[]>(() => {
    const today = todayIsrael()
    const wById = new Map(workshops.map(w => [w.id, w]))
    // Reg count per cohort — ALL leads regardless of status, the same
    // definition the public RPC and RegistrationsTab use.
    const byCohort = new Map<string, number>()
    const idsByCohort = new Map<string, string[]>()
    for (const [lid, cid] of leadCohortIds) {
      if (!cid) continue
      byCohort.set(cid, (byCohort.get(cid) ?? 0) + 1)
      const list = idsByCohort.get(cid) ?? []
      list.push(lid)
      idsByCohort.set(cid, list)
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
        leadIds: idsByCohort.get(c.id) ?? [],
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
    const r = deriveMegalimCandidates({
      workshops,
      cohorts,
      leads: leads.map(l => ({ ...l, cohort_id: leadCohortIds.get(l.id) ?? null })),
      formDefs,
      submissions: formSubs,
      profiles: profileDobs,
      today: todayIsrael(),
    })
    // Brenda 14.9.26: "אופציה לרשום לא רלוונטי ושיעלם". Persisted in
    // admin_task_dismissals under `megalim:<lead id>`, same table as the
    // task טופל, so it survives a refresh and any device. Undo deletes it.
    return { ...r, candidates: r.candidates.filter(c => !dismissals.has(`megalim:${c.leadId}`)) }
  }, [loading, workshops, cohorts, leads, leadCohortIds, formDefs, formSubs, profileDobs, dismissals])

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

  return { loading, tasks, manualTasks, counters, monthPayments, paymentClaimCount: paymentClaims.length, capacity, recentRegistrations, megalim, announcements, storeProducts, upcomingEvents, eventsMissingVendor, recentPartnerLeads, reload: load }
}
