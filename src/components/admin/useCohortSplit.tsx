import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { resolveSubmitter, type ResolverField } from './formSubmissionResolver'
import { normalizeIlPhone } from './customerLookup'

// 23.9.26 (Brenda): inside a product's opening questionnaire, the answers of
// the NEXT group should be one tap away, not buried among 70 older ones.
// A chip row above the answers: the nearest upcoming (or running) cohort
// first and selected by default, then later ones, then past ones, then הכל.
//
// Which cohort an answer belongs to: the registration of the form's linked
// product that matches the submitter (user_id, else phone, else email).
// A mother with two registrations of the same product goes to the cohort
// whose start date is nearest to when she answered.
// Forms that are not a product's opening form get no bar at all.

type Sub = {
  id: string
  user_id: string | null
  responses_json: Record<string, unknown>
  created_at: string
  user_profiles?: { mother_name: string | null; email: string | null } | null
}
type FormLike = { id: string; fields_json: ResolverField[] } | null

type Cohort = { id: string; start_date: string; end_date: string | null; label: string | null }
type Lead = { cohort_id: string | null; user_id: string | null; phone: string | null; email: string | null; status: string }

const ALL = 'all'
const NONE = 'none'

function fmt(d: string) {
  const [, m, day] = d.split('-')
  return `${Number(day)}.${Number(m)}`
}

export function useCohortSplit<T extends Sub>(form: FormLike, submissions: T[]): { bar: ReactNode; filtered: T[] } {
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [sel, setSel] = useState<string>(ALL)
  const formId = form?.id ?? null

  useEffect(() => {
    let cancelled = false
    setCohorts([]); setLeads([]); setSel(ALL)
    if (!formId) return
    ;(async () => {
      const { data: ws } = await supabase.from('workshops').select('id').eq('linked_form_id', formId)
      const wsIds = (ws ?? []).map(w => (w as { id: string }).id)
      if (wsIds.length === 0 || cancelled) return
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from('workshop_cohorts').select('id, start_date, end_date, label').in('workshop_id', wsIds),
        supabase.from('registration_leads').select('cohort_id, user_id, phone, email, status').in('selected_workshop_id', wsIds),
      ])
      if (cancelled) return
      const cs = ((c ?? []) as Cohort[]).filter(x => x.start_date)
      setCohorts(cs)
      setLeads((l ?? []) as Lead[])
      // Default: the nearest cohort that has not finished yet.
      const today = new Date().toISOString().slice(0, 10)
      const upcoming = cs
        .filter(x => (x.end_date ?? addDays(x.start_date, 35)) >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
      if (upcoming[0]) setSel(upcoming[0].id)
    })()
    return () => { cancelled = true }
  }, [formId])

  const cohortOf = useMemo(() => {
    const m = new Map<string, string | null>()
    if (!form || cohorts.length === 0) return m
    const startById = new Map(cohorts.map(c => [c.id, c.start_date]))
    const withCohort = leads.filter(l => l.cohort_id && startById.has(l.cohort_id))
    for (const s of submissions) {
      const r = resolveSubmitter({ fields_json: form.fields_json }, { responses_json: s.responses_json, user_profiles: s.user_profiles ?? null })
      const phone = normalizeIlPhone(r.phone)
      const email = r.email?.toLowerCase().trim() || null
      const cands = withCohort.filter(l =>
        (s.user_id && l.user_id === s.user_id) ||
        (phone && normalizeIlPhone(l.phone) === phone) ||
        (email && l.email?.toLowerCase().trim() === email))
      if (cands.length === 0) { m.set(s.id, null); continue }
      const t = new Date(s.created_at).getTime()
      cands.sort((a, b) =>
        Math.abs(new Date(startById.get(a.cohort_id!)!).getTime() - t) -
        Math.abs(new Date(startById.get(b.cohort_id!)!).getTime() - t))
      m.set(s.id, cands[0].cohort_id)
    }
    return m
  }, [form, cohorts, leads, submissions])

  const filtered = useMemo(() => {
    if (sel === ALL || cohorts.length === 0) return submissions
    if (sel === NONE) return submissions.filter(s => !cohortOf.get(s.id))
    return submissions.filter(s => cohortOf.get(s.id) === sel)
  }, [sel, submissions, cohortOf, cohorts.length])

  if (cohorts.length === 0) return { bar: null, filtered: submissions }

  const today = new Date().toISOString().slice(0, 10)
  const isOpen = (c: Cohort) => (c.end_date ?? addDays(c.start_date, 35)) >= today
  const open = cohorts.filter(isOpen).sort((a, b) => a.start_date.localeCompare(b.start_date))
  const past = cohorts.filter(c => !isOpen(c)).sort((a, b) => b.start_date.localeCompare(a.start_date))
  const answersIn = (id: string) => submissions.filter(s => cohortOf.get(s.id) === id).length
  const registeredIn = (id: string) => leads.filter(l => l.cohort_id === id && l.status !== 'pending').length
  const noneCount = submissions.filter(s => !cohortOf.get(s.id)).length

  const chip = (key: string, top: string, sub: string, highlight = false) => {
    const active = sel === key
    return (
      <button key={key} type="button" onClick={() => setSel(key)}
        className="flex-shrink-0 text-right rounded-xl transition-colors"
        style={{
          padding: '6px 12px',
          background: active ? '#2E2C24' : highlight ? '#FBF3E4' : '#FFF',
          color: active ? '#FFF' : '#3D2E20',
          border: `1px solid ${active ? '#2E2C24' : highlight ? '#E6CFA0' : '#E5DCD0'}`,
        }}>
        <span className="block" style={{ fontWeight: 700, fontSize: 13 }}>{top}</span>
        <span className="block" style={{ fontWeight: 600, fontSize: 11.5, opacity: 0.75 }}>{sub}</span>
      </button>
    )
  }
  const cohortChip = (c: Cohort, i: number, isNext: boolean) => {
    const a = answersIn(c.id), r = registeredIn(c.id)
    const when = new Date(c.start_date) > new Date(today) ? '' : ' · רצה'
    const top = `${isNext && i === 0 ? 'הקרובה · ' : ''}${fmt(c.start_date)}${c.label ? ` · ${c.label}` : ''}${isNext ? when : ''}`
    return chip(c.id, top, r > 0 ? `${a} מתוך ${r} מילאו` : `${a} תשובות`, isNext && i === 0)
  }

  const bar = (
    <div className="flex gap-2 overflow-x-auto pb-1" dir="rtl" style={{ scrollbarWidth: 'thin' }}>
      {open.map((c, i) => cohortChip(c, i, true))}
      {past.map((c, i) => cohortChip(c, i, false))}
      {noneCount > 0 && chip(NONE, 'בלי קבוצה', `${noneCount} תשובות`)}
      {chip(ALL, 'הכל', `${submissions.length} תשובות`)}
    </div>
  )
  return { bar, filtered }
}

function addDays(d: string, n: number) {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}
