import { supabase } from './supabase'

/**
 * The workshop PROGRAM: exercises as records instead of one body_html block
 * per meeting. Brenda 3.9.26.
 *
 * Content lives ONCE in `exercises`. A session template is only an ordered
 * list of exercise ids (the warm-up repeats in every meeting; ערסול sits in
 * meetings 1 and 3; some exercises repeat across עטופים and מגלים), so a
 * wording fix is one edit, not four.
 *
 * `cohort_sessions` stores what was SKIPPED in a real meeting, never what
 * was done: a missing row means "everything", which is the zero-click
 * default. Skipped items are surfaced at the top of the next meeting, in
 * the app, without anything being written.
 */

export type ProgramTopic = { key: string; label: string; display_order: number }

export type Exercise = {
  id: string
  slug: string | null
  title: string
  how: string | null        // light html
  why: string | null        // the "why" box, light html
  caution: string | null    // the red box, light html
  lyrics: string | null     // <br>-separated
  video_url: string | null  // videos bucket, /object/public/ form
  topics: string[]          // program_topics.key
  terms: string[]           // glossary.term
  age_range: string | null
  is_warmup: boolean
  is_active: boolean
}

export type SessionTemplate = {
  id: string
  workshop_id: string
  meeting_number: number
  title: string
  intro: string | null
  outro: string | null
  exercise_ids: string[]
  warmup_exercise_ids: string[]
  include_warmup: boolean
}

export type GlossaryTerm = { id: string; term: string; plain: string; aliases: string[] }

export type CohortSession = {
  id: string
  cohort_id: string
  meeting_number: number
  skipped_exercise_ids: string[]
  note: string | null
}

export type Program = {
  templates: SessionTemplate[]          // ordered by meeting_number
  exercises: Map<string, Exercise>
  topics: ProgramTopic[]
  glossary: GlossaryTerm[]
}

/** Everything the program view needs for one workshop, or null when the
 *  workshop has no session templates (then the old content view applies). */
export async function loadProgram(workshopId: string): Promise<Program | null> {
  const { data: templates } = await supabase
    .from('session_templates').select('*')
    .eq('workshop_id', workshopId)
    .order('meeting_number')
  if (!templates || templates.length === 0) return null

  const ids = new Set<string>()
  for (const t of templates as SessionTemplate[]) {
    for (const id of t.exercise_ids ?? []) ids.add(id)
    for (const id of t.warmup_exercise_ids ?? []) ids.add(id)
  }

  const [exRes, topicRes, glossRes] = await Promise.all([
    supabase.from('exercises').select('*').in('id', Array.from(ids)),
    supabase.from('program_topics').select('*').order('display_order'),
    supabase.from('glossary').select('*'),
  ])

  const exercises = new Map<string, Exercise>()
  for (const e of (exRes.data ?? []) as Exercise[]) exercises.set(e.id, e)

  return {
    templates: templates as SessionTemplate[],
    exercises,
    topics: (topicRes.data ?? []) as ProgramTopic[],
    glossary: (glossRes.data ?? []) as GlossaryTerm[],
  }
}

export const MEETING_ORDINAL = ['', 'מפגש ראשון', 'מפגש שני', 'מפגש שלישי', 'מפגש רביעי', 'מפגש חמישי', 'מפגש שישי', 'מפגש שביעי', 'מפגש שמיני']

/** The meeting the mother should land on: the last one that already took
 *  place in HER cohort, else the first. */
export function defaultMeeting(pastNumbers: number[]): number {
  if (pastNumbers.length === 0) return 1
  return Math.max(...pastNumbers)
}

/**
 * Wraps glossary terms in light html so they can be tapped. Works on the
 * html string itself, outside tags only, first occurrence of each term
 * (longest alias first so "רפלקס מורו" wins over "מורו"). Terms the
 * exercise lists in `terms` are always searched; the rest of the glossary
 * is searched too, because Brenda writes them into the text freely.
 */
export function markTerms(html: string | null, glossary: GlossaryTerm[]): string {
  if (!html) return ''
  const entries: { needle: string; term: string }[] = []
  for (const g of glossary) {
    entries.push({ needle: g.term, term: g.term })
    for (const a of g.aliases ?? []) entries.push({ needle: a, term: g.term })
  }
  entries.sort((a, b) => b.needle.length - a.needle.length)

  // Split into tags and text so we never touch attributes.
  const parts = html.split(/(<[^>]+>)/g)
  const seen = new Set<string>()
  const out = parts.map(part => {
    if (part.startsWith('<')) return part
    let text = part
    for (const { needle, term } of entries) {
      if (seen.has(term)) continue
      const idx = text.indexOf(needle)
      if (idx === -1) continue
      seen.add(term)
      const safe = term.replace(/"/g, '&quot;')
      text = text.slice(0, idx)
        + `<button type="button" class="pg-term" data-term="${safe}">${needle}</button>`
        + text.slice(idx + needle.length)
    }
    return text
  })
  return out.join('')
}
