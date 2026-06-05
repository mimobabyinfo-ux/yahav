// Phase 5 / A4: pure helper that figures out WHO submitted a form even
// when user_id is NULL (anonymous public submissions).
//
// Logic:
//   1. If the joined user_profiles has a mother_name → that's the truth.
//   2. Otherwise walk the form's fields_json. For each text field, decide
//      its semantic role via:
//        - explicit override: field.role (set by admin via the
//          "זיהוי שדות" panel)  ← deterministic
//        - heuristic on the field LABEL + answer VALUE  ← fallback
//      Then pick the first answer per role from responses_json.
//   3. When no override and no heuristic match → submitter is truly
//      'אנונימי' (returned as source='none').
//
// We don't write anything; the resolver runs on read every time the
// admin opens a form's responses. Per-form overrides are stored back
// into forms.fields_json (no migration).

export type FieldRole = 'name' | 'phone' | 'email' | 'none'

// Field shape we need to resolve. Mirrors the local FormField type
// in AdminPage.tsx but kept loose here so this file can be imported
// without dragging that whole module's types.
export type ResolverField = {
  id: string
  type: string
  label: string
  /** Admin-set override. `'none'` = explicit "don't use this field". */
  role?: FieldRole
}

export type ResolverForm = {
  fields_json: ResolverField[]
}

export type ResolverSubmission = {
  responses_json: Record<string, unknown>
  user_profiles?: { mother_name: string | null; email: string | null } | null
}

export type ResolvedSubmitter = {
  name: string | null
  phone: string | null
  email: string | null
  /** 'profile' — joined user_profiles row carried the name.
   *  'responses' — pulled identity out of the answers themselves.
   *  'none'      — truly anonymous (no identity in either source). */
  source: 'profile' | 'responses' | 'none'
  /** Maps each text field's LABEL → the role the resolver assigned to
   *  it (after override + heuristic). Used to pre-populate the override
   *  UI and to skip "identity" fields from the response preview. */
  roleByLabel: Record<string, FieldRole | null>
}

// Heuristic patterns. Hebrew labels first (the project default); the
// English alternates catch the rare bilingual form. The PHONE pattern
// deliberately matches "טלפון של בעל הזוג" too — overrides exist to
// turn that off when needed.
const PHONE_RE = /טלפון|פלאפון|נייד|tel|phone/i
const EMAIL_RE = /אימייל|מייל|דוא"ל|email/i
const FIRST_RE = /שם פרטי|first.?name/i
const LAST_RE  = /שם משפחה|last.?name|family.?name/i
const NAME_RE  = /^שם$|שם מלא|full.?name|^name$/i

// Phase 5 / A4 fix-4: distinguish "mother" labels from "baby/child"
// labels so the primary identity on a submission is the SUBMITTER
// (the mother), never the baby. Hebrew uses a final mem `ם` in
// `אם` (mother) which means a literal "אם" substring won't
// accidentally match words containing medial-mem `מ` like "אמא"
// stays — both forms are matched explicitly.
const MOTHER_RE = /אמא|האם|של אם/
// Baby/child fields shouldn't contribute to "who submitted this".
// Admin can still override with field.role explicitly when an unusual
// form needs it.
const BABY_RE = /תינוק|ילד|בייבי|baby|child/i

function detectRole(label: string, value: string): FieldRole | 'name_first' | 'name_last' | null {
  // Value-based signal: an answer that contains '@' is almost
  // certainly the email regardless of how the label was written.
  if (typeof value === 'string' && value.includes('@') && /\.[a-z]{2,}$/i.test(value)) return 'email'
  // Phase 5 / A4 fix-4: a NAME field that asks about the baby is not
  // the submitter's identity — skip it for name resolution. Phone /
  // email patterns still fire (a form might capture a baby's medical
  // contact field separately) but never get used as the headline.
  const isBaby = BABY_RE.test(label)
  if (!isBaby) {
    if (FIRST_RE.test(label)) return 'name_first'
    if (LAST_RE.test(label)) return 'name_last'
    if (NAME_RE.test(label)) return 'name'
  }
  if (PHONE_RE.test(label)) return 'phone'
  if (EMAIL_RE.test(label)) return 'email'
  return null
}

export function resolveSubmitter(form: ResolverForm, submission: ResolverSubmission): ResolvedSubmitter {
  // Profile join wins when the linked user has a known name.
  const profile = submission.user_profiles ?? null
  if (profile?.mother_name) {
    return {
      name: profile.mother_name,
      phone: null,
      email: profile.email ?? null,
      source: 'profile',
      roleByLabel: {},
    }
  }

  // Phase 5 / A4 fix-4: collect all candidate name values along with
  // an isMother bias bit. After the loop, pick the best per role
  // (mother-marked wins over generic). For phone/email we still take
  // the first match — admins use overrides for ambiguous phone fields.
  type NameCandidate = { value: string; isMother: boolean }
  const firstCands: NameCandidate[] = []
  const lastCands: NameCandidate[] = []
  const fullCands: NameCandidate[] = []
  let phone: string | null = null
  let email: string | null = null
  const roleByLabel: ResolvedSubmitter['roleByLabel'] = {}

  for (const field of form.fields_json) {
    if (field.type === 'info' || field.type === 'link') continue
    const raw = submission.responses_json[field.label]
    const value = raw == null ? '' : String(raw).trim()
    if (!value) continue

    let role: FieldRole | 'name_first' | 'name_last' | null
    if (field.role === 'none') {
      role = null
    } else if (field.role === 'phone' || field.role === 'email' || field.role === 'name') {
      role = field.role
    } else {
      role = detectRole(field.label, value)
    }

    // Map the internal role pair back to the public FieldRole union
    // for the roleByLabel exposure (name_first/name_last → 'name').
    if (role === 'name_first' || role === 'name_last') {
      roleByLabel[field.label] = 'name'
    } else {
      roleByLabel[field.label] = role
    }

    const isMother = MOTHER_RE.test(field.label)
    if (role === 'phone' && !phone) phone = value
    else if (role === 'email' && !email) email = value
    else if (role === 'name_first') firstCands.push({ value, isMother })
    else if (role === 'name_last') lastCands.push({ value, isMother })
    else if (role === 'name') fullCands.push({ value, isMother })
  }

  function pickBest(cands: NameCandidate[]): string | null {
    if (cands.length === 0) return null
    // Mother-tagged wins over generic. Within each tier, first match
    // wins (stable order from field iteration).
    return (cands.find(c => c.isMother) ?? cands[0]).value
  }
  const firstName = pickBest(firstCands)
  const lastName = pickBest(lastCands)
  const fullName = pickBest(fullCands)

  // Phase 5 / A4 fix-4: first+last beats single full-name. The bug
  // was that a baby's "שם מלא" field used to override the mother's
  // first+last; baby fields are now skipped via BABY_RE above, AND
  // this ordering ensures mother first+last takes precedence even
  // in forms with both styles.
  const composedName =
    (firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : null) ??
    fullName

  const source: ResolvedSubmitter['source'] =
    composedName || phone || email ? 'responses' : 'none'

  return {
    name: composedName,
    phone,
    email,
    source,
    roleByLabel,
  }
}

// Normalize a phone to digits-only for comparison. Strips dashes,
// spaces, parentheses, leading +, etc. Does NOT do +972↔0 conversion
// yet — that lands in A2's migration. For A4 we accept that
// "0501234567" and "+972501234567" won't match; the heuristic is good
// enough at the volume admin works with.
export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

// Look up whether this resolved identity matches an existing
// registration_leads row. Match on digit-stripped phone OR
// case-insensitive email. Returns the first match (typically there's
// at most one for a real person).
export type LeadMatch = { id: string; phone: string; email: string }

export function findRegistrationMatch(
  resolved: ResolvedSubmitter,
  leads: LeadMatch[],
): LeadMatch | null {
  const phoneNorm = normalizePhone(resolved.phone)
  const emailNorm = (resolved.email ?? '').toLowerCase().trim()
  if (!phoneNorm && !emailNorm) return null
  for (const l of leads) {
    if (phoneNorm && normalizePhone(l.phone) === phoneNorm) return l
    if (emailNorm && l.email.toLowerCase().trim() === emailNorm) return l
  }
  return null
}
