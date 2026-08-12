import type { Workshop, WorkshopCohort } from '../../lib/supabase'
import { resolveSubmitter, type ResolverField } from './formSubmissionResolver'
import { normalizeIlPhone } from './customerLookup'

// ─── "מועמדות למגלים" — graduates whose baby reached the next age ────────────
//
// Brenda's CRM sends the מגלים follow-up a fixed 14 days after עטופים
// ends. That's calendar-based, so for a mother who joined עטופים with a
// two-week-old the message lands ~2 months too early. This module
// answers the other question: WHO is at the right AGE right now.
//
// Pure derivation, no fetching — same contract as adminTasks.ts, so the
// home screen and (later) any badge can share one computation.
//
// Definition of a candidate (Brenda, 10.8.26):
//   1. paid registration for עטופים,
//   2. whose cohort has ENDED (she finished the workshop),
//   3. no registration for מגלים in any status,
//   4. baby's age today >= 3 months (the מגלים lower bound exactly;
//      Yahav 12.8.26 asked for 3 and not 2.5, a mother whose baby is
//      not yet 3 months old reads as noise), and < the upper bound
//      (6 months), past which it is no longer the right workshop.
//
// The baby's date of birth is NOT a column on registration_leads. It
// comes from the developmental questionnaire the mother fills before
// the workshop (`תאריך לידה` inside the "פרטי התינוק/ת" section),
// matched back to the lead by phone. App users with a profile are a
// second source. Mothers with neither are reported as a count, not
// silently dropped — they're still potential customers, Brenda just
// can't see their baby's age from here.

/** Months before the target workshop's lower age bound to start
 *  surfacing a mother. Zero: the card starts exactly at the workshop's
 *  own lower bound. Raise it if Brenda ever wants a head start. */
export const MEGALIM_LEAD_MONTHS = 0
/** Fallbacks used when the workshop rows carry no age range yet. */
const DEFAULT_TARGET_START_MONTHS = 3
const DEFAULT_TARGET_END_MONTHS = 6
const AVG_DAYS_PER_MONTH = 30.4375

export type CandidateLead = {
  id: string
  name: string
  phone: string
  email: string
  status: 'pending' | 'paid' | 'handled'
  created_at: string
  selected_workshop_id: string | null
  cohort_id: string | null
}

export type DobSubmission = {
  form_id: string
  responses_json: Record<string, unknown>
  user_profiles?: { mother_name: string | null; email: string | null } | null
}

export type DobFormDef = {
  id: string
  fields_json: ResolverField[]
}

/** user_profiles rows that carry a baby birth date (app users). */
export type ProfileDob = {
  normalized_phone: string | null
  baby_name: string | null
  baby_dob: string | null
}

export type BabyDob = {
  dob: string                      // YYYY-MM-DD
  babyName: string | null
  source: 'form' | 'profile'
}

export type MegalimCandidate = {
  leadId: string
  name: string
  phone: string
  babyName: string | null
  babyDob: string
  /** Age today in months, one decimal. */
  ageMonths: number
  /** Date the עטופים cohort ended (YYYY-MM-DD). */
  finishedOn: string
  /** How long ago she finished, in whole days. */
  daysSinceFinish: number
  dobSource: 'form' | 'profile'
}

export type MegalimCandidatesResult = {
  candidates: MegalimCandidate[]
  /** Finished עטופים, not in מגלים, but we have no birth date for the
   *  baby — can't tell whether she's in range. */
  unknownDobCount: number
  /** Title of the workshop we're recommending (for the card heading). */
  targetTitle: string | null
  /** Resolved age window actually used, for the card's subtitle. */
  fromMonths: number
  toMonths: number
}

export type MegalimCandidatesInput = {
  workshops: Workshop[]
  cohorts: Pick<WorkshopCohort, 'id' | 'workshop_id' | 'start_date' | 'end_date'>[]
  leads: CandidateLead[]
  /** Developmental-questionnaire defs, keyed by form id. */
  formDefs: Map<string, DobFormDef>
  submissions: DobSubmission[]
  profiles: ProfileDob[]
  /** Israel-calendar today as YYYY-MM-DD (passed in for testability). */
  today: string
}

// ─── helpers ────────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** Labels that hold the BABY's birth date. `תאריך לידה של האם` is the
 *  mother's and must never match. */
const BABY_DOB_RE = /^\s*תאריך לידה\s*$/

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + 'T12:00:00Z')
  const b = Date.parse(toIso + 'T12:00:00Z')
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN
  return Math.round((b - a) / 86_400_000)
}

/** Guard against a mother's birth date landing in a baby field: a baby
 *  we could still sell a 0-6 month workshop for was born in the last
 *  three years and not in the future. */
function isPlausibleBabyDob(dob: string, today: string): boolean {
  if (!ISO_DATE_RE.test(dob)) return false
  const d = daysBetween(dob, today)
  return !Number.isNaN(d) && d >= 0 && d <= 366 * 3
}

function readDateValue(raw: unknown): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  if (ISO_DATE_RE.test(s)) return s
  // Tolerate dd/mm/yyyy — some questionnaires were filled as free text.
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/**
 * Build phone → baby birth date from questionnaire submissions and app
 * profiles. Questionnaires win when both exist: the mother typed the
 * date herself in the form she filled for this exact workshop.
 * Later submissions win over earlier ones for the same phone (a second
 * baby means the newer answer is the live one).
 */
export function buildBabyDobIndex(
  formDefs: Map<string, DobFormDef>,
  submissions: DobSubmission[],
  profiles: ProfileDob[],
  today: string,
): Map<string, BabyDob> {
  const idx = new Map<string, BabyDob>()

  for (const p of profiles) {
    const phone = normalizeIlPhone(p.normalized_phone)
    const dob = readDateValue(p.baby_dob)
    if (!phone || !dob || !isPlausibleBabyDob(dob, today)) continue
    idx.set(phone, { dob, babyName: p.baby_name, source: 'profile' })
  }

  for (const sub of submissions) {
    const form = formDefs.get(sub.form_id)
    if (!form) continue
    const dobField = form.fields_json.find(f => BABY_DOB_RE.test(f.label))
    if (!dobField) continue
    const dob = readDateValue(sub.responses_json[dobField.label] ?? sub.responses_json[dobField.id])
    if (!dob || !isPlausibleBabyDob(dob, today)) continue

    const phone = normalizeIlPhone(
      resolveSubmitter({ fields_json: form.fields_json }, {
        responses_json: sub.responses_json,
        user_profiles: sub.user_profiles ?? null,
      }).phone,
    )
    if (!phone) continue

    // Baby name lives in the "פרטי התינוק/ת" section as a plain
    // `שם מלא`; the resolver deliberately skips baby fields for
    // identity, so read it here by label.
    const babyNameField = form.fields_json.find(f => /^\s*שם מלא\s*$/.test(f.label))
    const babyName = babyNameField
      ? (String(sub.responses_json[babyNameField.label] ?? '').trim() || null)
      : null

    const prev = idx.get(phone)
    // Prefer the questionnaire over a profile row, and the newer birth
    // date when two questionnaires exist (second baby).
    if (!prev || prev.source === 'profile' || dob > prev.dob) {
      idx.set(phone, { dob, babyName, source: 'form' })
    }
  }

  return idx
}

/** Find a workshop by a word in its title, preferring active rows. */
function findWorkshopByTitle(workshops: Workshop[], needle: string): Workshop | null {
  const matches = workshops.filter(w => w.title.includes(needle))
  return matches.find(w => w.is_active) ?? matches[0] ?? null
}

export function deriveMegalimCandidates(input: MegalimCandidatesInput): MegalimCandidatesResult {
  const { workshops, cohorts, leads, formDefs, submissions, profiles, today } = input

  const source = findWorkshopByTitle(workshops, 'עטופים')
  const target = findWorkshopByTitle(workshops, 'מגלים')
  const empty: MegalimCandidatesResult = {
    candidates: [],
    unknownDobCount: 0,
    targetTitle: target?.title ?? null,
    fromMonths: DEFAULT_TARGET_START_MONTHS - MEGALIM_LEAD_MONTHS,
    toMonths: DEFAULT_TARGET_END_MONTHS,
  }
  if (!source || !target) return empty

  const fromMonths = (target.age_range_start_months ?? DEFAULT_TARGET_START_MONTHS) - MEGALIM_LEAD_MONTHS
  const toMonths = target.age_range_end_months ?? DEFAULT_TARGET_END_MONTHS
  const cohortById = new Map(cohorts.map(c => [c.id, c]))

  /** The workshop a lead belongs to — the explicit product, or the one
   *  behind its cohort when the product wasn't stamped on the row. */
  function workshopIdOf(lead: CandidateLead): string | null {
    if (lead.selected_workshop_id) return lead.selected_workshop_id
    return lead.cohort_id ? cohortById.get(lead.cohort_id)?.workshop_id ?? null : null
  }

  // Anyone already in מגלים — in ANY status — is out. She's either
  // paid, or mid-conversation, and either way this card would be noise.
  const inMegalim = new Set<string>()
  for (const l of leads) {
    if (workshopIdOf(l) !== target.id) continue
    const phone = normalizeIlPhone(l.phone)
    if (phone) inMegalim.add(phone)
  }

  const dobIndex = buildBabyDobIndex(formDefs, submissions, profiles, today)

  const candidates: MegalimCandidate[] = []
  let unknownDobCount = 0
  const seenPhones = new Set<string>()

  for (const lead of leads) {
    if (lead.status !== 'paid') continue
    if (workshopIdOf(lead) !== source.id) continue

    // Finished = her cohort's last day is behind us. A lead with no
    // cohort can't be shown to have finished, so it stays out.
    const cohort = lead.cohort_id ? cohortById.get(lead.cohort_id) : null
    const finishedOn = cohort?.end_date ?? cohort?.start_date ?? null
    if (!finishedOn || finishedOn >= today) continue

    const phone = normalizeIlPhone(lead.phone)
    if (!phone || inMegalim.has(phone) || seenPhones.has(phone)) continue

    const dob = dobIndex.get(phone)
    if (!dob) { unknownDobCount++; seenPhones.add(phone); continue }

    const ageMonths = daysBetween(dob.dob, today) / AVG_DAYS_PER_MONTH
    if (ageMonths < fromMonths || ageMonths >= toMonths) continue

    seenPhones.add(phone)
    candidates.push({
      leadId: lead.id,
      name: lead.name,
      phone: lead.phone,
      babyName: dob.babyName,
      babyDob: dob.dob,
      ageMonths: Math.round(ageMonths * 10) / 10,
      finishedOn,
      daysSinceFinish: daysBetween(finishedOn, today),
      dobSource: dob.source,
    })
  }

  // Oldest baby first — she's the one about to age out of the window.
  candidates.sort((a, b) => b.ageMonths - a.ageMonths)

  return { candidates, unknownDobCount, targetTitle: target.title, fromMonths, toMonths }
}
