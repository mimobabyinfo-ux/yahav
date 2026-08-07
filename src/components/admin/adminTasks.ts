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
  cohorts: Pick<WorkshopCohort, 'id' | 'workshop_id' | 'is_active'>[]
  events: Pick<CommunityEvent, 'id' | 'title' | 'event_date' | 'is_active' | 'price' | 'payment_link' | 'vendor_id' | 'vendor_name'>[]
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
    })
  }

  // 4 · Opening questionnaire not filled — one line per linked form.
  const filledIndex = buildFilledIndex(linkedFormDefs, linkedSubmissions)
  const unfilledByForm = new Map<string, { title: string; count: number }>()
  for (const lead of leads) {
    if (lead.status === 'handled') continue
    const w = lead.selected_workshop_id ? workshops.find(x => x.id === lead.selected_workshop_id) : null
    if (!w?.linked_form_id) continue
    const form = linkedFormDefs.get(w.linked_form_id)
    if (!form) continue
    const phone = normalizeIlPhone(lead.phone)
    const emailL = lead.email?.toLowerCase().trim()
    const isFilled = (!!phone && filledIndex.has(`${form.id}|p|${phone}`))
      || (!!emailL && filledIndex.has(`${form.id}|e|${emailL}`))
    if (!isFilled) {
      const cur = unfilledByForm.get(form.id) ?? { title: form.title, count: 0 }
      cur.count += 1
      unfilledByForm.set(form.id, cur)
    }
  }
  for (const [formId, info] of unfilledByForm) {
    tasks.push({
      key: `unfilled_form:${formId}`,
      title: `${info.count} לא מילאו את "${info.title}"`,
      facts: ['שאלון פתיחה'],
      severity: 'mid',
      section: 'forms',
      actionLabel: 'לשאלון',
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
        title: `"${w.title}" — נשארו ${w.stock_quantity} במלאי`,
        facts: ['מוצר פיזי'],
        severity: 'mid',
        section: 'workshops',
        actionLabel: 'למוצר',
      })
    }
  }

  // high first, then mid; stable within severity.
  return tasks.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))
}
