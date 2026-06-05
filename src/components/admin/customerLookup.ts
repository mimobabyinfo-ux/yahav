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

export type CustomerKey = { phone?: string | null; email?: string | null }

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
  workshop: { id: string; title: string; linked_form_id: string | null } | null
  cohort: WorkshopCohort | null
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
      .select('*, workshops:selected_workshop_id(id, title, linked_form_id)')
      .or(orQuery),
  ])

  type ProfileRow = UserProfile & { normalized_phone: string | null }
  type LeadRow = CustomerRegistration & {
    normalized_phone: string | null
    workshops?: { id: string; title: string; linked_form_id: string | null } | null
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
    workshops?: { id: string; title: string; linked_form_id: string | null } | null
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

  return {
    user,
    displayName,
    phone,
    email,
    normalizedPhone: cluster.normalizedPhone,
    registrations,
    formSubmissions,
  }
}
