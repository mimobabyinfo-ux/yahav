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
  /** Phase 3: exact lead ids the destination should filter+pre-select. */
  targetLeadIds?: string[]
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
}

export type LinkedFormDef = {
  id: string
  title: string
  fields_json: { id: string; type: string; label: string; role?: 'name' | 'phone' | 'email' | 'none' }[]
  public_link_enabled: boolean
}

export type LinkedSubmission = {
  form_id: string
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
  }
  return idx
}

export function deriveAdminTasks(input: AdminTaskInput): AdminTask[] {
  const { workshops, cohorts, events, checkinEventIds, leads, linkedFormDefs, linkedSubmissions, today, nowMs } = input
  const tasks: AdminTask[] = []

  const workshopIdsWithCohorts = new Set(cohorts.map(c => c.workshop_id))

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

  // 3 · Pending payments older than 48h — aggregated into one line.
  const cutoff = nowMs - 48 * 3600 * 1000
  const stalePending = leads.filter(l => l.status === 'pending' && new Date(l.created_at).getTime() < cutoff)
  if (stalePending.length > 0) {
    tasks.push({
      key: 'stale_pending',
      title: `${stalePending.length} ממתינות לתשלום מעל 48 שעות`,
      facts: [stalePending.slice(0, 2).map(l => l.name.split(' ')[0]).join(', ') + (stalePending.length > 2 ? '…' : '')],
      severity: 'high',
      section: 'registrations',
      actionLabel: 'להרשמות',
      sourceUpdatedAt: stalePending.reduce<string | null>((m, l) => (m == null || l.created_at > m ? l.created_at : m), null),
      targetLeadIds: stalePending.map(l => l.id),
    })
  }

  // 4 · Opening questionnaire not filled — one line per linked form.
  //
  // Counted over EFFECTIVE status, exactly like the registrations
  // page's "מחכה לך" inbox: only a paid registration whose cohort
  // hasn't started yet is still worth chasing. Before this, the home
  // screen counted by raw status and showed 9 where the page showed 7
  // — the two extra had already sat through the workshop.
  const cohortDates = new Map(cohorts.map(c => [c.id, c]))
  const filledIndex = buildFilledIndex(linkedFormDefs, linkedSubmissions)
  const unfilledByForm = new Map<string, { title: string; count: number; latest: string | null; leadIds: string[] }>()
  for (const lead of leads) {
    if (effectiveLeadStatus(lead, cohortDates, today, nowMs) !== 'paid') continue
    const w = lead.selected_workshop_id ? workshops.find(x => x.id === lead.selected_workshop_id) : null
    if (!w?.linked_form_id) continue
    const form = linkedFormDefs.get(w.linked_form_id)
    if (!form) continue
    const phone = normalizeIlPhone(lead.phone)
    const emailL = lead.email?.toLowerCase().trim()
    const isFilled = (!!phone && filledIndex.has(`${form.id}|p|${phone}`))
      || (!!emailL && filledIndex.has(`${form.id}|e|${emailL}`))
    if (!isFilled) {
      const cur = unfilledByForm.get(form.id) ?? { title: form.title, count: 0, latest: null as string | null, leadIds: [] as string[] }
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
      facts: ['שאלון פתיחה'],
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

  // 5 · Upcoming event (14 days) with no vendor at all.
  const in14 = addDays(today, 14)
  for (const ev of events) {
    if (ev.is_active && ev.event_date >= today && ev.event_date <= in14 && !ev.vendor_id && !ev.vendor_name) {
      tasks.push({
        key: `event_no_vendor:${ev.id}`,
        title: `"${ev.title}" בעוד פחות משבועיים בלי ספק`,
        facts: [ddmm(ev.event_date)],
        severity: 'mid',
        section: 'events',
        actionLabel: 'לאירוע',
        sourceUpdatedAt: ev.updated_at ?? null,
        targetId: ev.id,
      })
    }
  }

  // 6 · Upcoming event (7 days) with no check-in link yet.
  const in7 = addDays(today, 7)
  for (const ev of events) {
    if (ev.is_active && ev.event_date >= today && ev.event_date <= in7 && !checkinEventIds.has(ev.id)) {
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
