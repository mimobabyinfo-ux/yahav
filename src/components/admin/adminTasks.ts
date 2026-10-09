import type { Workshop, WorkshopCohort, CommunityEvent } from '../../lib/supabase'
import { resolveSubmitter } from './formSubmissionResolver'
import { normalizeIlPhone } from './customerLookup'

// ─── Admin "דורש תשומת לב" — derived task engine ─────────────────────────────
// Pure derivation, no fetching and no storage: every task is computed
// from data the caller already holds, so the same rules can feed the
// home screen AND the sidebar badges (design handoff §3.2). Phase 1 —
// no persistence: dismissals + manual tasks arrive with the
// admin_tasks / admin_task_dismissals migration in phase 2.
//
// Each task carries a STABLE key ('rule:<object id>') so phase 2 can
// key dismissals by it without reshaping this module.

export type AdminTaskSection = 'registrations' | 'forms' | 'workshops' | 'events' | 'partners'

/** A mother who says she paid outside the app, awaiting confirmation. */
export type PaymentClaim = {
  event_id: string
  event_title: string
  mother_name: string | null
  claimed_at: string
}

/** A Morning payment that arrived and could not be given a seat. The
 *  webhook logs every delivery; until now nothing in the app read that
 *  table, so money could land with no registration and total silence. */
export type UnmatchedPayment = {
  id: string
  received_at: string
  payer_name: string | null
  payer_email: string | null
  payer_phone?: string | null
  description?: string | null
  total: number | null
  detail: string | null
  /** 'unmatched' (a workshop/course payment) or 'community_event'. */
  outcome?: string | null
}

/** 6.10.26: a registration with recorded payments that do not yet cover
 *  the agreed price (partial / cash still owed). */
export type OpenBalance = {
  leadId: string
  name: string
  left: number
  workshopTitle: string | null
}

export type AdminTask = {
  key: string
  title: string          // one line — carries the number and the object
  facts: string[]        // short grey facts beside the title
  severity: 'high' | 'mid'
  section: AdminTaskSection
  actionLabel: string
  /** When the task's SOURCE row last changed (ISO). A dismissed task
   *  resurfaces when this is newer than dismissed_at (handoff §3.5). */
  sourceUpdatedAt: string | null
  /** Phase 3: object id the destination should open (workshop/event/form). */
  targetId?: string
  /** Which screen of that object. Brenda 17.8.26: the payment-claim task
   *  dropped her in the event's EDIT form, which has no confirm button
   *  anywhere on it. 'registrants' opens the list where the decision
   *  actually lives. Defaults to 'edit', the old behaviour. */
  targetView?: 'edit' | 'registrants'
  /** Phase 3: exact lead ids the destination should filter+pre-select. */
  targetLeadIds?: string[]
  /** 6.10.26: an unmatched Morning payment — the home opens the
   *  "למי שייך התשלום?" modal instead of navigating. */
  payment?: UnmatchedPayment
}

// Minimal lead shape the rules need (subset of RegistrationsTab's
// RegistrationLead — kept structural so both sides stay compatible).
export type TaskLead = {
  id: string
  name: string
  phone: string
  email: string
  status: 'pending' | 'paid' | 'handled'
  created_at: string
  selected_workshop_id: string | null
  cohort_id: string | null
  /** The app account linked to the registration, when there is one. */
  user_id?: string | null
}

export type LinkedFormDef = {
  id: string
  title: string
  fields_json: { id: string; type: string; label: string; role?: 'name' | 'phone' | 'email' | 'none' }[]
  public_link_enabled: boolean
  /** 23.9.26: an answer to THIS form counts as filling this one too (the
   *  מגלים form names the עטופים form). */
  counts_as_filled_by?: string | null
}

export type LinkedSubmission = {
  form_id: string
  user_id?: string | null
  responses_json: Record<string, unknown>
  user_profiles?: { mother_name: string | null; email: string | null } | null
}

export type AdminTaskInput = {
  workshops: Workshop[]
  cohorts: Pick<WorkshopCohort, 'id' | 'workshop_id' | 'is_active' | 'start_date' | 'start_time'>[]
  events: Pick<CommunityEvent, 'id' | 'title' | 'event_date' | 'is_active' | 'price' | 'payment_link' | 'vendor_id' | 'vendor_name' | 'updated_at'>[]
  checkinEventIds: Set<string>
  leads: TaskLead[]
  linkedFormDefs: Map<string, LinkedFormDef>
  linkedSubmissions: LinkedSubmission[]
  /** Brenda 17.8.26: "if she marks it, it should pop a notification in the
   *  admin". A declared Bit/transfer payment is money waiting on a decision
   *  only she can make, so it belongs on the home screen, not buried in an
   *  event's registrant list. */
  paymentClaims: PaymentClaim[]
  /** Brenda 18.8.26: "the main thing in the app is community
   *  registration." Nothing here ever told her how a registration was
   *  actually going — not that an event was nearly empty two days out,
   *  not that it had filled, not that women were waiting. Seats, not
   *  rows: a mother bringing a friend takes two. */
  eventSeats: Map<string, { taken: number; capacity: number | null }>
  /** Event id → how many mothers are waiting on it. */
  eventWaiting: Map<string, number>
  /** Morning payments the webhook could not attach to anyone. */
  unmatchedPayments: UnmatchedPayment[]
  /** Registrations whose recorded payments do not cover the agreed price. */
  openBalances?: OpenBalance[]
  /** Israel-calendar today as YYYY-MM-DD (passed in for testability). */
  today: string
  /** Epoch ms "now" (passed in for testability). */
  nowMs: number
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

/** Has this cohort's first meeting already happened? Mirrors
 *  RegistrationsTab.isCohortPast — same-day counts as past only once
 *  start_time has passed (NULL time = not yet). */
export function cohortStarted(
  c: { start_date: string; start_time: string | null },
  today: string,
  nowMs: number,
): boolean {
  if (c.start_date < today) return true
  if (c.start_date > today) return false
  if (!c.start_time) return false
  const nowHm = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(nowMs))
  return nowHm >= c.start_time.slice(0, 5)
}

/** The status the ADMIN sees. A paid registration whose cohort has
 *  already started reads as מומש — the workshop happened. This is the
 *  same derivation RegistrationsTab uses; both screens must agree or
 *  the home count and the page count drift apart. */
export function effectiveLeadStatus(
  lead: TaskLead,
  cohortById: Map<string, { start_date: string; start_time: string | null }>,
  today: string,
  nowMs: number,
): 'pending' | 'paid' | 'handled' {
  if (lead.status !== 'paid' || !lead.cohort_id) return lead.status
  const c = cohortById.get(lead.cohort_id)
  if (!c) return lead.status
  return cohortStarted(c, today, nowMs) ? 'handled' : 'paid'
}

// Same identity resolution the RegistrationsTab gap report uses
// (extracted, not rewritten — handoff §3.2): a submission counts for a
// form if its resolved phone/email matches the lead's.
export function buildFilledIndex(defs: Map<string, LinkedFormDef>, subs: LinkedSubmission[]): Set<string> {
  const idx = new Set<string>()
  for (const sub of subs) {
    const form = defs.get(sub.form_id)
    if (!form) continue
    const r = resolveSubmitter(
      { fields_json: form.fields_json },
      { responses_json: sub.responses_json, user_profiles: sub.user_profiles ?? null },
    )
    const phone = normalizeIlPhone(r.phone)
    const emailL = r.email?.toLowerCase().trim()
    if (phone) idx.add(`${sub.form_id}|p|${phone}`)
    if (emailL) idx.add(`${sub.form_id}|e|${emailL}`)
    if (sub.user_id) idx.add(`${sub.form_id}|u|${sub.user_id}`)
  }
  return idx
}

/** Did this registration's mother fill the product's opening form?
 *  One answer for every screen (6.10.26). She counts as filled when her
 *  phone, email or app account matches an answer to the form, OR to the
 *  form it accepts instead (counts_as_filled_by: an עטופים graduate
 *  joining מגלים). Tal Marom showed "missing" because only the first was
 *  checked, and her מגלים phone had two digits swapped. */
export function isFormFilled(
  formId: string,
  lead: { phone: string | null; email: string | null; user_id?: string | null },
  defs: Map<string, { counts_as_filled_by?: string | null }>,
  filled: Set<string>,
): boolean {
  const phone = normalizeIlPhone(lead.phone ?? '')
  const emailL = lead.email?.toLowerCase().trim()
  const ids = [formId]
  const prior = defs.get(formId)?.counts_as_filled_by
  if (prior) ids.push(prior)
  return ids.some(id =>
    (!!phone && filled.has(`${id}|p|${phone}`)) ||
    (!!emailL && filled.has(`${id}|e|${emailL}`)) ||
    (!!lead.user_id && filled.has(`${id}|u|${lead.user_id}`)))
}

export function deriveAdminTasks(input: AdminTaskInput): AdminTask[] {
  const { workshops, cohorts, events, checkinEventIds, leads, linkedFormDefs, linkedSubmissions, paymentClaims, eventSeats, eventWaiting, unmatchedPayments, openBalances = [], today, nowMs } = input
  const tasks: AdminTask[] = []

  const workshopIdsWithCohorts = new Set(cohorts.map(c => c.workshop_id))

  // 0 · Declared payments. Highest thing on the list on purpose: a seat is
  //     being held on her word, and only Brenda can turn it into a fact.
  if (paymentClaims.length > 0) {
    const byEvent = new Map<string, PaymentClaim[]>()
    for (const c of paymentClaims) {
      const list = byEvent.get(c.event_id) ?? []
      list.push(c)
      byEvent.set(c.event_id, list)
    }
    for (const [eventId, list] of byEvent) {
      const names = list.map(c => c.mother_name).filter(Boolean) as string[]
      tasks.push({
        key: `payment_claim:${eventId}:${list.length}`,
        title: list.length === 1
          ? `${names[0] ?? 'אמא'} אומרת ששילמה על "${list[0].event_title}"`
          : `${list.length} אמהות אומרות ששילמו על "${list[0].event_title}"`,
        facts: ['ביט או העברה', 'ממתין לאישור שלך'],
        severity: 'high',
        section: 'events',
        actionLabel: 'לאישור התשלום',
        sourceUpdatedAt: list.map(c => c.claimed_at).sort().slice(-1)[0] ?? null,
        targetId: eventId,
        targetView: 'registrants',
      })
    }
  }

  // 1 · Active paid product without a payment link — nobody can buy it.
  for (const w of workshops) {
    if (w.is_active && (w.price ?? 0) > 0 && !w.payment_link) {
      tasks.push({
        key: `missing_payment_link:${w.id}`,
        title: `"${w.title}" פעיל בתשלום בלי קישור תשלום`,
        facts: [`₪${w.price}`, 'אי אפשר לשלם'],
        severity: 'high',
        section: 'workshops',
        actionLabel: 'למוצר',
        sourceUpdatedAt: w.updated_at ?? null,
        targetId: w.id,
      })
    }
  }

  // 2 · Active paid event without a payment link.
  for (const ev of events) {
    if (ev.is_active && ev.price > 0 && !ev.payment_link && ev.event_date >= today) {
      tasks.push({
        key: `event_missing_payment_link:${ev.id}`,
        title: `"${ev.title}" בתשלום בלי קישור תשלום`,
        facts: [ddmm(ev.event_date), `₪${ev.price}`],
        severity: 'high',
        section: 'events',
        actionLabel: 'לאירוע',
        sourceUpdatedAt: ev.updated_at ?? null,
        targetId: ev.id,
      })
    }
  }

  // 3 · (removed 27.9.26) "X ממתינות לתשלום מעל 48 שעות" used to live here.
  //     Unpaid registrations now get an automatic email at ~24h
  //     (remind-stalled-registrations) and, if still unpaid at 48h, a card
  //     in the לידים screen with the reason on it (v_stalled_registrations).
  //     Yahav: "בסוף זה ליד", so it belongs with the leads, not the home.

  // 4 · Opening questionnaire not filled — one line per linked form.
  //
  // Counted over EFFECTIVE status, exactly like the registrations
  // page's "מחכה לך" inbox: only a paid registration whose cohort
  // hasn't started yet is still worth chasing. Before this, the home
  // screen counted by raw status and showed 9 where the page showed 7
  // — the two extra had already sat through the workshop.
  const cohortDates = new Map(cohorts.map(c => [c.id, c]))
  const filledIndex = buildFilledIndex(linkedFormDefs, linkedSubmissions)
  const unfilledByForm = new Map<string, { title: string; count: number; latest: string | null; leadIds: string[]; firstStart: string }>()
  // Yahav 2.10.26: "why does this interest me now? the new workshops are
  // only on 14/10, 15/10, 19/10". A missing questionnaire only needs her
  // in the last days before the first meeting, so it waits until the
  // cohort starts within a week (6.10.26: was 3 days, which left the home
  // silent while 7 of 8 in a cohort 8 days out had not answered).
  // Before that the registrations page still shows who has not filled it.
  // 9.10.26 (Yahav): one day, not seven. The WhatsApp group opens two days
  // before the first meeting and the mothers get a reminder there, so the
  // admin only needs to hear about it the day before.
  const formWindowEnd = addDays(today, 1)
  for (const lead of leads) {
    if (effectiveLeadStatus(lead, cohortDates, today, nowMs) !== 'paid') continue
    const leadCohort = lead.cohort_id ? cohortDates.get(lead.cohort_id) : null
    if (!leadCohort || leadCohort.start_date > formWindowEnd) continue
    const w = lead.selected_workshop_id ? workshops.find(x => x.id === lead.selected_workshop_id) : null
    if (!w?.linked_form_id) continue
    const form = linkedFormDefs.get(w.linked_form_id)
    if (!form) continue
    const isFilled = isFormFilled(form.id, lead, linkedFormDefs, filledIndex)
    if (!isFilled) {
      const cur = unfilledByForm.get(form.id) ?? { title: form.title, count: 0, latest: null as string | null, leadIds: [] as string[], firstStart: leadCohort.start_date }
      if (leadCohort.start_date < cur.firstStart) cur.firstStart = leadCohort.start_date
      cur.count += 1
      cur.leadIds.push(lead.id)
      if (cur.latest == null || lead.created_at > cur.latest) cur.latest = lead.created_at
      unfilledByForm.set(form.id, cur)
    }
  }
  for (const [formId, info] of unfilledByForm) {
    tasks.push({
      key: `unfilled_form:${formId}`,
      title: `${info.count} לא מילאו את "${info.title}"`,
      facts: ['שאלון פתיחה', `הסדנה מתחילה ${ddmm(info.firstStart)}`],
      severity: 'mid',
      // The answer to "who are they?" is the registrations list, not
      // the form itself — the form has nothing to act on.
      section: 'registrations',
      actionLabel: 'להרשמות',
      sourceUpdatedAt: info.latest,
      targetId: formId,
      targetLeadIds: info.leadIds,
    })
  }

  // 4b · Money arrived and nobody got a seat. Highest severity there is:
  //      she has been paid and the payer has nothing to show for it.
  //      6.10.26: the button opens "למי שייך התשלום?" (AssignPaymentModal)
  //      with the likely registrations ranked; one tap attaches it.
  for (const u of unmatchedPayments) {
    tasks.push({
      key: `unmatched_payment:${u.id}`,
      title: `תשלום שהגיע ולא שויך${u.total != null ? ` · ₪${Number(u.total).toLocaleString()}` : ''}`,
      facts: [
        u.payer_name || u.payer_email || 'משלמת לא מזוהה',
        u.description ?? '',
        new Date(u.received_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }),
      ].filter(Boolean),
      severity: 'high',
      section: 'registrations',
      actionLabel: 'לשיוך',
      sourceUpdatedAt: u.received_at,
      payment: u,
    })
  }

  // 4b' · Money still owed on a registration (partial / cash later).
  //       Only registrations with recorded payments can owe; see payments.ts.
  if (openBalances.length > 0) {
    const total = openBalances.reduce((s, b) => s + b.left, 0)
    tasks.push({
      key: `open_balances:${openBalances.map(b => `${b.leadId}:${b.left}`).sort().join(',')}`,
      title: openBalances.length === 1
        ? `${openBalances[0].name} חייבת עוד ₪${openBalances[0].left.toLocaleString()}`
        : `${openBalances.length} הרשמות עם יתרה לתשלום · ₪${total.toLocaleString()}`,
      facts: openBalances.length === 1
        ? [openBalances[0].workshopTitle ?? ''].filter(Boolean)
        : openBalances.slice(0, 3).map(b => `${b.name.split(' ')[0]} ₪${b.left.toLocaleString()}`),
      severity: 'mid',
      section: 'registrations',
      actionLabel: 'לרשימה',
      sourceUpdatedAt: null,
      targetLeadIds: openBalances.map(b => b.leadId),
    })
  }

  // 4c · How the registration is actually going. Three shapes, one loop.
  const in3 = addDays(today, 3)
  for (const ev of events) {
    if (!ev.is_active || ev.event_date < today) continue
    const seats = eventSeats.get(ev.id)
    const waiting = eventWaiting.get(ev.id) ?? 0

    if (waiting > 0) {
      tasks.push({
        key: `event_waitlist:${ev.id}`,
        title: `${waiting === 1 ? 'אמא אחת ממתינה' : `${waiting} אמהות ממתינות`} ל"${ev.title}"`,
        facts: [ddmm(ev.event_date)],
        severity: 'mid',
        section: 'events',
        actionLabel: 'לרשימה',
        sourceUpdatedAt: ev.updated_at ?? null,
        targetId: ev.id,
        targetView: 'registrants',
      })
    }

    // Yahav 2.10.26: "האירוע מלא" used to be a task here. A full event is
    // good news, not something to do, so it lives in the events screen and
    // in "כמה נרשמו" only.
    if (
      seats?.capacity && ev.event_date <= in3 &&
      seats.taken < Math.ceil(seats.capacity * 0.5)
    ) {
      // Three days out and under half full is the last moment a push can
      // still change the outcome.
      tasks.push({
        key: `event_underfilled:${ev.id}`,
        title: `"${ev.title}" בעוד ימים ספורים ורק ${seats.taken} נרשמו`,
        facts: [ddmm(ev.event_date), `מתוך ${seats.capacity} מקומות`],
        severity: 'high',
        section: 'events',
        actionLabel: 'לאירוע',
        sourceUpdatedAt: ev.updated_at ?? null,
        targetId: ev.id,
      })
    }
  }

  // 5 · Upcoming event (10 days, was 14 until 2.10.26) with no vendor at all.
  const in10 = addDays(today, 10)
  for (const ev of events) {
    if (ev.is_active && ev.event_date >= today && ev.event_date <= in10 && !ev.vendor_id && !ev.vendor_name) {
      tasks.push({
        key: `event_no_vendor:${ev.id}`,
        title: `"${ev.title}" בעוד פחות מ-10 ימים בלי ספק`,
        facts: [ddmm(ev.event_date)],
        severity: 'mid',
        section: 'events',
        actionLabel: 'לאירוע',
        sourceUpdatedAt: ev.updated_at ?? null,
        targetId: ev.id,
      })
    }
  }

  // 6 · Upcoming event (2 days, was 7 until 2.10.26) with no check-in link yet.
  //     The link is made the day before; a week out it was only noise.
  const in2 = addDays(today, 2)
  for (const ev of events) {
    if (ev.is_active && ev.event_date >= today && ev.event_date <= in2 && !checkinEventIds.has(ev.id)) {
      tasks.push({
        key: `event_no_checkin:${ev.id}`,
        title: `ל"${ev.title}" אין עדיין קישור צ'ק-אין`,
        facts: [ddmm(ev.event_date), 'הספק לא יוכל לסמן נוכחות'],
        severity: 'mid',
        section: 'events',
        actionLabel: 'לאירוע',
        sourceUpdatedAt: ev.updated_at ?? null,
        targetId: ev.id,
      })
    }
  }

  // 7 · Low stock — ONLY for products with no cohorts (stock_quantity is
  // dual-purpose: per-cohort max for workshops, stock for physical
  // products — handoff §3.2 warning).
  for (const w of workshops) {
    if (
      w.is_active &&
      !workshopIdsWithCohorts.has(w.id) &&
      w.workshop_type != null &&
      w.stock_quantity != null &&
      w.stock_quantity <= 3
    ) {
      tasks.push({
        key: `low_stock:${w.id}`,
        title: `"${w.title}": נשארו ${w.stock_quantity} במלאי`,
        facts: ['מוצר פיזי'],
        severity: 'mid',
        section: 'workshops',
        actionLabel: 'למוצר',
        sourceUpdatedAt: w.updated_at ?? null,
        targetId: w.id,
      })
    }
  }

  // high first, then mid; stable within severity.
  return tasks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
}

// ─── Phase 2: persistence glue ───────────────────────────────────────────────

/** Who a manual task is for. One admin login is shared by Brenda and
 *  Yahav, so this is a label + filter, not a user id (2.10.26). */
export type TaskAssignee = 'brenda' | 'yahav' | 'both'

/** Row shape of admin_tasks (manual tasks). */
export type ManualTask = {
  id: string
  title: string
  detail: string | null
  severity: 'high' | 'mid' | 'low'
  link_section: AdminTaskSection | null
  link_id: string | null
  status: 'open' | 'done'
  created_at: string
  done_at: string | null
  /** Optional day the task is for (YYYY-MM-DD). */
  due_date: string | null
  /** 28.9.26: the customer the task is about (keys the customer card uses). */
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  /** 2.10.26: ברנדה / יהב / משותף (both), null = not assigned. */
  assignee?: TaskAssignee | null
}

/** Filter derived tasks through persisted dismissals. A dismissed task
 *  stays hidden until its source row changes AFTER dismissed_at — then
 *  the condition is "new news" and it resurfaces (handoff §3.5). */
export function applyDismissals(tasks: AdminTask[], dismissals: Map<string, string>): AdminTask[] {
  return tasks.filter(t => {
    const dismissedAt = dismissals.get(t.key)
    if (!dismissedAt) return true
    return t.sourceUpdatedAt != null && t.sourceUpdatedAt > dismissedAt
  })
}
