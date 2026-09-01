import { supabase, type UserProfile, type WorkshopCohort } from '../../lib/supabase'
import { resolveSubmitter, normalizePhone as digitsOnly } from './formSubmissionResolver'

// Phase 5 / A2 Part 3: aggregate every record we have for one person.
// Input key: { phone, email }. Output: either a single CustomerProfile
// or — when phone matches one person and email matches a different
// one — a list of candidates so admin can pick.

// Mirror of the SQL normalize_il_phone() function so JS-side and
// DB-side produce the SAME canonical form. Both must agree for the
// indexed equality lookup to work.
export function normalizeIlPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = digitsOnly(raw)
  if (!digits) return null
  if (digits.length === 12 && digits.startsWith('972')) {
    return '0' + digits.slice(3)
  }
  return digits
}

// Screen A / A3: leadId (optional) focuses the panel's ההרשמה tab on a
// specific registration — the row the admin actually clicked — instead
// of always the latest one. Lookup itself still keys on phone/email.
export type CustomerKey = { phone?: string | null; email?: string | null; leadId?: string | null }

export type CustomerRegistration = {
  id: string
  name: string
  phone: string
  email: string
  status: 'pending' | 'paid' | 'handled'
  cohort_id: string | null
  selected_workshop_id: string | null
  source: string | null
  created_at: string
  workshop: { id: string; title: string; linked_form_id: string | null; price: number | null } | null
  cohort: WorkshopCohort | null
  /** The offer she registered through, when there was one — the paid
   *  amount is the product price only until a discount enters. */
  offer: RegistrationOffer | null
}

export type RegistrationOffer = {
  id: string
  workshop_id: string
  label: string | null
  discount_type: 'fixed' | 'percent'
  discount_value: number
}

// ─── Money ──────────────────────────────────────────────────────────
// registration_leads stores NO amount (handoff §7.1) — what she paid is
// derived: the product's list price, minus the offer she came through.
// Same semantics as PublicRegisterPage.computeOfferPrice, which is what
// she was actually charged: `fixed` IS the special price, `percent`
// takes that share off the list price.

export function offerPrice(offer: RegistrationOffer, listPrice: number | null): number | null {
  if (offer.discount_type === 'fixed') return offer.discount_value
  if (offer.discount_type === 'percent' && listPrice != null) {
    return Math.round(listPrice * (1 - offer.discount_value / 100))
  }
  return null
}

/** What this one registration is worth. null = no product / no price. */
export function registrationAmount(reg: {
  workshop: { id: string; price: number | null } | null
  offer: RegistrationOffer | null
}): number | null {
  const list = reg.workshop?.price ?? null
  // An offer only applies to the product it belongs to — the admin may
  // have since switched the registration to a different workshop.
  if (reg.offer && reg.workshop && reg.offer.workshop_id === reg.workshop.id) {
    const discounted = offerPrice(reg.offer, list)
    if (discounted != null) return discounted
  }
  return list
}

// ─── Community events ───────────────────────────────────────────────
// The card is supposed to hold the WHOLE customer, and since the
// community launched that includes every event she signed up for, not
// only the workshops she bought. event_registrations keys on the auth
// user, so this stays empty for a lead who never opened the app —
// that is real information about her, not a gap.

export type CustomerEventLite = {
  id: string
  title: string
  emoji: string | null
  event_date: string
  start_time: string | null
  location: string | null
  price: number | null
}

export type EventRegStatus = 'pending' | 'registered' | 'cancelled' | 'attended' | 'no_show'

export type CustomerEventRegistration = {
  id: string
  event_id: string
  status: EventRegStatus
  paid: boolean
  paid_amount: number | null
  /** Who she brought — one paid seat per name, on top of her own. */
  guestNames: string[]
  /** A further ticket bought after the fact; unpaid while it holds. */
  extraGuestNames: string[]
  substituteName: string | null
  created_at: string
  event: CustomerEventLite | null
}

export type CustomerEventWaitlistEntry = {
  id: string
  event_id: string
  status: string
  created_at: string
  event: CustomerEventLite | null
}

export type CustomerCredit = {
  id: string
  amount: number
  created_at: string
  expires_at: string | null
  used_at: string | null
  used_note: string | null
  grant_note: string | null
  sourceEventTitle: string | null
}

/** Seats this registration holds: herself plus every guest name. */
export function eventSeats(reg: CustomerEventRegistration): number {
  return 1 + reg.guestNames.length
}

/** What the seat(s) are worth. Same rule EventsAdminPanel writes with:
 *  paid_amount is the truth once it exists, and before that it is the
 *  list price times the seats she holds. */
export function eventRegistrationAmount(reg: CustomerEventRegistration): number | null {
  if (reg.paid_amount != null) return Number(reg.paid_amount)
  const price = reg.event?.price
  if (price == null) return null
  return Number(price) * eventSeats(reg)
}

/** Lifetime value split by whether the money actually arrived.
 *  מומש (handled) counts as paid — it's a workshop she already used. */
export function customerTotals(
  registrations: CustomerRegistration[],
  eventRegistrations: CustomerEventRegistration[] = [],
): {
  /** Everything she has actually paid us — workshops AND events. */
  paid: number
  pending: number
  /** Registrations we couldn't price (no product, or product with no price). */
  unpricedPaid: number
  /** The two halves of `paid`, so the card can show the split. */
  workshopsPaid: number
  eventsPaid: number
} {
  let workshopsPaid = 0
  let pending = 0
  let unpricedPaid = 0
  for (const r of registrations) {
    const amount = registrationAmount(r)
    const counted = r.status === 'paid' || r.status === 'handled'
    if (amount == null) {
      if (counted) unpricedPaid++
      continue
    }
    if (counted) workshopsPaid += amount
    else pending += amount
  }

  // Community events. A cancelled seat is money that came back (or
  // never arrived) — it counts for nothing on either side.
  let eventsPaid = 0
  for (const r of eventRegistrations) {
    if (r.status === 'cancelled') continue
    const amount = eventRegistrationAmount(r)
    if (amount == null) {
      if (r.paid) unpricedPaid++
    } else if (r.paid) {
      eventsPaid += amount
    } else if (amount > 0) {
      // A free meetup is not money she owes us.
      pending += amount
    }
    // An extra ticket she took after registering is a separate hold,
    // unpaid until Morning says otherwise.
    const price = r.event?.price
    if (r.extraGuestNames.length > 0 && price != null) {
      pending += Number(price) * r.extraGuestNames.length
    }
  }

  return { paid: workshopsPaid + eventsPaid, pending, unpricedPaid, workshopsPaid, eventsPaid }
}

export function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL')}`
}

export type CustomerFormSubmission = {
  id: string
  form_id: string
  responses_json: Record<string, unknown>
  created_at: string
  form: { id: string; title: string; fields_json: FormFieldShape[] } | null
}

// Lightweight mirror of the AdminPage FormField for the resolver.
// fields_json comes from supabase as `unknown` jsonb; we narrow here.
type FormFieldShape = {
  id: string
  type: string
  label: string
  role?: 'name' | 'phone' | 'email' | 'none'
  options?: string[]
}

export type CustomerProfile = {
  // The mother. Prefer user_profile when present, else aggregate
  // from registration_leads / form submissions.
  user: UserProfile | null
  displayName: string
  phone: string | null
  email: string | null
  normalizedPhone: string | null

  registrations: CustomerRegistration[]
  formSubmissions: CustomerFormSubmission[]
  // Screen A / A3: the linked-form definitions for this person's
  // registrations (even when unfilled) — the panel's השאלון tab needs
  // the form title + id to build the reminder message.
  linkedForms: { id: string; title: string }[]

  // Community. Only ever populated when `user` is set — these tables
  // key on the auth user, not on a phone number.
  eventRegistrations: CustomerEventRegistration[]
  eventWaitlist: CustomerEventWaitlistEntry[]
  credits: CustomerCredit[]
}

export type CustomerCandidate = {
  key: { normalizedPhone: string | null; email: string | null }
  displayName: string
  phone: string | null
  email: string | null
  hasUserProfile: boolean
  registrationCount: number
}

export type LookupResult =
  | { kind: 'one'; profile: CustomerProfile }
  | { kind: 'many'; candidates: CustomerCandidate[] }
  | { kind: 'none' }

// Group records (any object with normalized_phone + email) into
// likely-same-person clusters. Two records are linked if they share
// at least one of (normalized phone, lowercased email). Doesn't
// transitively merge (A↔B, B↔C → A,B,C) — at admin scale the chain
// length is ≤ 2 in practice; if that changes, swap for union-find.
type GroupableRecord = { normalized_phone: string | null; email: string | null }

function groupByPerson<T extends GroupableRecord>(records: T[]): T[][] {
  const groups: T[][] = []
  for (const r of records) {
    const phone = r.normalized_phone
    const emailL = r.email?.toLowerCase().trim() ?? ''
    let placed = false
    for (const g of groups) {
      const overlaps = g.some(x =>
        (phone && x.normalized_phone === phone) ||
        (emailL && (x.email?.toLowerCase().trim() ?? '') === emailL),
      )
      if (overlaps) { g.push(r); placed = true; break }
    }
    if (!placed) groups.push([r])
  }
  return groups
}

// Main entry — look up everything for `key`. Same logic the
// CustomerCardModal calls on open.
export async function lookupCustomer(key: CustomerKey): Promise<LookupResult> {
  const phoneNorm = normalizeIlPhone(key.phone ?? '') ?? null
  const emailLower = (key.email ?? '').toLowerCase().trim() || null
  if (!phoneNorm && !emailLower) return { kind: 'none' }

  // PostgREST .or() filter — build only the parts we have so we
  // don't accidentally OR with empty strings.
  function buildOr(): string {
    const parts: string[] = []
    if (phoneNorm) parts.push(`normalized_phone.eq.${phoneNorm}`)
    if (emailLower) parts.push(`email.ilike.${emailLower}`)
    return parts.join(',')
  }
  const orQuery = buildOr()

  const [{ data: profiles }, { data: leads }] = await Promise.all([
    supabase.from('user_profiles').select('*').or(orQuery),
    supabase
      .from('registration_leads')
      .select('*, workshops:selected_workshop_id(id, title, linked_form_id, price)')
      .or(orQuery),
  ])

  type ProfileRow = UserProfile & { normalized_phone: string | null }
  type LeadRow = CustomerRegistration & {
    normalized_phone: string | null
    offer_id: string | null
    workshops?: { id: string; title: string; linked_form_id: string | null; price: number | null } | null
  }

  const profileRows = (profiles ?? []) as ProfileRow[]
  const leadRows = (leads ?? []) as unknown as LeadRow[]

  if (profileRows.length === 0 && leadRows.length === 0) {
    return { kind: 'none' }
  }

  // Build candidate clusters across both tables. Each cluster is one
  // human; we represent it by its records.
  type Cluster = {
    profiles: ProfileRow[]
    leads: LeadRow[]
    normalizedPhone: string | null
    email: string | null
  }
  const allRecords: GroupableRecord[] = [
    ...profileRows.map(p => ({ normalized_phone: p.normalized_phone, email: p.email })),
    ...leadRows.map(l => ({ normalized_phone: l.normalized_phone, email: l.email })),
  ]
  const groups = groupByPerson(allRecords)

  // Re-attach the original rows to each group. We dedupe on a string
  // key derived from (phone, email) since groupByPerson lost row id.
  const clusters: Cluster[] = groups.map(g => {
    const keys = new Set(g.map(r => `${r.normalized_phone ?? ''}|${(r.email ?? '').toLowerCase()}`))
    const clusterProfiles = profileRows.filter(p =>
      keys.has(`${p.normalized_phone ?? ''}|${(p.email ?? '').toLowerCase()}`),
    )
    const clusterLeads = leadRows.filter(l =>
      keys.has(`${l.normalized_phone ?? ''}|${(l.email ?? '').toLowerCase()}`),
    )
    // Cluster identity = the first non-null phone/email we find.
    const np = clusterProfiles[0]?.normalized_phone ?? clusterLeads[0]?.normalized_phone ?? null
    const em = clusterProfiles[0]?.email ?? clusterLeads[0]?.email ?? null
    return { profiles: clusterProfiles, leads: clusterLeads, normalizedPhone: np, email: em }
  })

  if (clusters.length > 1) {
    return {
      kind: 'many',
      candidates: clusters.map(c => clusterToCandidate(c)),
    }
  }

  // Single cluster — assemble the full profile.
  const profile = await assembleProfile(clusters[0])
  return { kind: 'one', profile }
}

function clusterToCandidate(c: { profiles: UserProfile[]; leads: CustomerRegistration[]; normalizedPhone: string | null; email: string | null }): CustomerCandidate {
  const fromProfile = c.profiles[0]
  const fromLead = c.leads[0]
  const displayName =
    fromProfile?.mother_name ??
    fromLead?.name ??
    c.normalizedPhone ??
    c.email ??
    'אנונימי'
  return {
    key: { normalizedPhone: c.normalizedPhone, email: c.email?.toLowerCase().trim() ?? null },
    displayName,
    phone: fromProfile?.phone_number ?? fromLead?.phone ?? null,
    email: fromProfile?.email ?? fromLead?.email ?? null,
    hasUserProfile: c.profiles.length > 0,
    registrationCount: c.leads.length,
  }
}

async function assembleProfile(cluster: {
  profiles: UserProfile[]
  leads: (CustomerRegistration & {
    offer_id?: string | null
    workshops?: { id: string; title: string; linked_form_id: string | null; price: number | null } | null
  })[]
  normalizedPhone: string | null
  email: string | null
}): Promise<CustomerProfile> {
  const user = cluster.profiles[0] ?? null

  // Resolve display name. Prefer mother_name from user_profiles; fall
  // back to the most recent registration's `name` field.
  const sortedLeads = [...cluster.leads].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
  const displayName =
    user?.mother_name ??
    sortedLeads[0]?.name ??
    cluster.normalizedPhone ??
    cluster.email ??
    'ללא שם'

  const phone = user?.phone_number ?? sortedLeads[0]?.phone ?? null
  const email = user?.email ?? sortedLeads[0]?.email ?? null

  // Fetch the cohorts for each lead's cohort_id. One round trip.
  const cohortIds = Array.from(
    new Set(sortedLeads.map(l => l.cohort_id).filter((x): x is string => !!x)),
  )
  let cohortMap = new Map<string, WorkshopCohort>()
  if (cohortIds.length > 0) {
    const { data: cohorts } = await supabase
      .from('workshop_cohorts')
      .select('*')
      .in('id', cohortIds)
    cohortMap = new Map(((cohorts ?? []) as WorkshopCohort[]).map(c => [c.id, c]))
  }

  // The offers behind these registrations — what she was actually
  // charged, not the sticker price.
  const offerIds = Array.from(
    new Set(sortedLeads.map(l => l.offer_id).filter((x): x is string => !!x)),
  )
  let offerMap = new Map<string, RegistrationOffer>()
  if (offerIds.length > 0) {
    const { data: offers } = await supabase
      .from('workshop_offers')
      .select('id, workshop_id, label, discount_type, discount_value')
      .in('id', offerIds)
    offerMap = new Map(((offers ?? []) as RegistrationOffer[]).map(o => [o.id, o]))
  }

  const registrations: CustomerRegistration[] = sortedLeads.map(l => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email,
    status: l.status,
    cohort_id: l.cohort_id,
    selected_workshop_id: l.selected_workshop_id,
    source: l.source,
    created_at: l.created_at,
    workshop: l.workshops ?? null,
    cohort: l.cohort_id ? cohortMap.get(l.cohort_id) ?? null : null,
    offer: l.offer_id ? offerMap.get(l.offer_id) ?? null : null,
  }))

  // Form submissions: gather the unique linked_form_ids she might
  // have filled, fetch the submissions, then keep only those whose
  // A4-resolver-derived phone/email matches this person.
  const linkedFormIds = Array.from(
    new Set(
      registrations
        .map(r => r.workshop?.linked_form_id)
        .filter((x): x is string => !!x),
    ),
  )

  let formSubmissions: CustomerFormSubmission[] = []
  let linkedForms: { id: string; title: string }[] = []
  if (linkedFormIds.length > 0) {
    const [{ data: forms }, { data: subs }] = await Promise.all([
      supabase.from('forms').select('id, title, fields_json').in('id', linkedFormIds),
      supabase
        .from('form_submissions')
        .select('*, user_profiles(mother_name, email)')
        .in('form_id', linkedFormIds),
    ])
    type FormRow = { id: string; title: string; fields_json: FormFieldShape[] }
    type SubRow = {
      id: string
      form_id: string
      user_id: string | null
      responses_json: Record<string, unknown>
      created_at: string
      user_profiles?: { mother_name: string | null; email: string } | null
    }
    const formById = new Map<string, FormRow>(
      (forms ?? []).map(f => [(f as FormRow).id, f as FormRow]),
    )
    linkedForms = Array.from(formById.values()).map(f => ({ id: f.id, title: f.title }))
    for (const s of (subs ?? []) as SubRow[]) {
      const form = formById.get(s.form_id)
      if (!form) continue
      // Match by user_id first (cheapest), then fall back to the
      // resolver-derived phone/email.
      const profileMatch = user && s.user_id === user.id
      const resolved = resolveSubmitter(
        { fields_json: form.fields_json },
        { responses_json: s.responses_json, user_profiles: s.user_profiles ?? null },
      )
      const resolvedPhoneNorm = normalizeIlPhone(resolved.phone)
      const resolvedEmail = resolved.email?.toLowerCase().trim() ?? null
      const phoneMatch = cluster.normalizedPhone &&
        resolvedPhoneNorm === cluster.normalizedPhone
      const emailMatch = cluster.email &&
        resolvedEmail === (cluster.email.toLowerCase().trim())
      if (profileMatch || phoneMatch || emailMatch) {
        formSubmissions.push({
          id: s.id,
          form_id: s.form_id,
          responses_json: s.responses_json,
          created_at: s.created_at,
          form: { id: form.id, title: form.title, fields_json: form.fields_json },
        })
      }
    }
    // Newest first.
    formSubmissions = formSubmissions.sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )
  }

  // ── Community: events she signed up for, waitlist places, credit ──
  const community = await loadCommunity(user?.id ?? null)

  return {
    user,
    displayName,
    phone,
    email,
    normalizedPhone: cluster.normalizedPhone,
    registrations,
    formSubmissions,
    linkedForms,
    ...community,
  }
}

// Everything the community side of the app knows about one mother.
// Three small reads, one round trip. Anything that fails comes back
// empty — the card still opens.
async function loadCommunity(userId: string | null): Promise<{
  eventRegistrations: CustomerEventRegistration[]
  eventWaitlist: CustomerEventWaitlistEntry[]
  credits: CustomerCredit[]
}> {
  const empty = { eventRegistrations: [], eventWaitlist: [], credits: [] }
  if (!userId) return empty

  const EVENT_COLS = 'id, title, emoji, event_date, start_time, location, price'
  const [{ data: regRows }, { data: waitRows }, { data: creditRows }] = await Promise.all([
    supabase
      .from('event_registrations')
      .select(
        `id, event_id, status, paid, paid_amount, guest_names, extra_guest_names, ` +
        `substitute_name, created_at, community_events(${EVENT_COLS})`,
      )
      .eq('user_id', userId),
    supabase
      .from('event_waitlist')
      .select(`id, event_id, status, created_at, community_events(${EVENT_COLS})`)
      .eq('user_id', userId),
    // community_credits points at community_events twice (source and
    // used_on), so the embed has to name the constraint.
    supabase
      .from('community_credits')
      .select(
        'id, amount, created_at, expires_at, used_at, used_note, grant_note, ' +
        'source_event:community_events!community_credits_source_event_id_fkey(title)',
      )
      .eq('user_id', userId),
  ])

  type EventJoin = CustomerEventLite | CustomerEventLite[] | null
  const oneEvent = (e: EventJoin): CustomerEventLite | null =>
    Array.isArray(e) ? e[0] ?? null : e ?? null

  type RegRow = {
    id: string; event_id: string; status: EventRegStatus; paid: boolean
    paid_amount: number | null; guest_names: string[] | null
    extra_guest_names: string[] | null; substitute_name: string | null
    created_at: string; community_events: EventJoin
  }
  type WaitRow = {
    id: string; event_id: string; status: string; created_at: string
    community_events: EventJoin
  }
  type CreditRow = {
    id: string; amount: number; created_at: string; expires_at: string | null
    used_at: string | null; used_note: string | null; grant_note: string | null
    source_event: { title: string } | { title: string }[] | null
  }

  const eventRegistrations: CustomerEventRegistration[] =
    ((regRows ?? []) as unknown as RegRow[])
      .map(r => ({
        id: r.id,
        event_id: r.event_id,
        status: r.status,
        paid: r.paid,
        paid_amount: r.paid_amount,
        guestNames: r.guest_names ?? [],
        extraGuestNames: r.extra_guest_names ?? [],
        substituteName: r.substitute_name,
        created_at: r.created_at,
        event: oneEvent(r.community_events),
      }))
      // Newest event first; an event with no date sorts last.
      .sort((a, b) => (b.event?.event_date ?? '').localeCompare(a.event?.event_date ?? ''))

  const eventWaitlist: CustomerEventWaitlistEntry[] =
    ((waitRows ?? []) as unknown as WaitRow[])
      .map(w => ({
        id: w.id,
        event_id: w.event_id,
        status: w.status,
        created_at: w.created_at,
        event: oneEvent(w.community_events),
      }))
      .sort((a, b) => (b.event?.event_date ?? '').localeCompare(a.event?.event_date ?? ''))

  const credits: CustomerCredit[] =
    ((creditRows ?? []) as unknown as CreditRow[])
      .map(c => {
        const src = Array.isArray(c.source_event) ? c.source_event[0] ?? null : c.source_event
        return {
          id: c.id,
          amount: Number(c.amount),
          created_at: c.created_at,
          expires_at: c.expires_at,
          used_at: c.used_at,
          used_note: c.used_note,
          grant_note: c.grant_note,
          sourceEventTitle: src?.title ?? null,
        }
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return { eventRegistrations, eventWaitlist, credits }
}
