import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square, ChevronDown, Save, Plus, Video, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Exercise, SessionTemplate, GlossaryTerm, ProgramTopic, CohortSession } from '../../lib/program'

/**
 * Admin side of the workshop program. Three tabs:
 *
 *  מה הספקנו  — per cohort meeting, every exercise shows CHECKED. Brenda
 *              only un-checks what she did not get to, from her phone, in
 *              ~30 seconds. A row is written only when something is
 *              un-checked; no row = everything = zero clicks. Un-checked
 *              items rise to the top of the next meeting for the mothers.
 *  תרגילים    — the library. One record per exercise, edited once, used
 *              in every meeting that lists it.
 *  מונחון     — the 14 terms and their plain explanations.
 *
 * Meeting ORDER (which exercise sits in which meeting) is data in
 * session_templates and is edited from the SQL for now; it changes once a
 * season, the content changes weekly.
 */

type Tab = 'sessions' | 'exercises' | 'glossary'

type CohortRow = { id: string; workshop_id: string; label: string | null; start_date: string; is_active: boolean; workshop_title: string }

export default function ProgramPanel() {
  const [tab, setTab] = useState<Tab>('sessions')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [templates, setTemplates] = useState<SessionTemplate[]>([])
  const [topics, setTopics] = useState<ProgramTopic[]>([])
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [ex, tp, tpc, gl] = await Promise.all([
      supabase.from('exercises').select('*').order('is_warmup', { ascending: false }).order('title'),
      supabase.from('session_templates').select('*').order('workshop_id').order('meeting_number'),
      supabase.from('program_topics').select('*').order('display_order'),
      supabase.from('glossary').select('*').order('term'),
    ])
    setExercises((ex.data ?? []) as Exercise[])
    setTemplates((tp.data ?? []) as SessionTemplate[])
    setTopics((tpc.data ?? []) as ProgramTopic[])
    setGlossary((gl.data ?? []) as GlossaryTerm[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const exMap = useMemo(() => new Map(exercises.map(e => [e.id, e])), [exercises])

  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h2 className="text-xl font-black text-sand-800">תוכנית הסדנאות</h2>
        <p className="text-xs text-sand-400 mt-0.5">התרגילים, המפגשים, ומה הספקנו בפועל</p>
      </div>

      <div className="flex gap-1 bg-sand-100 rounded-2xl p-1 w-fit">
        {([['sessions', 'מה הספקנו'], ['exercises', 'תרגילים'], ['glossary', 'מונחון']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-colors ${tab === id ? 'bg-white text-sand-800 shadow-sm' : 'text-sand-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-sand-400 py-6 text-center">טוען...</p> : (
        <>
          {tab === 'sessions'  && <SessionsTab templates={templates} exMap={exMap} />}
          {tab === 'exercises' && <ExercisesTab exercises={exercises} topics={topics} glossary={glossary} templates={templates} onChanged={load} />}
          {tab === 'glossary'  && <GlossaryTab glossary={glossary} onChanged={load} />}
        </>
      )}
    </div>
  )
}

// ── מה הספקנו ─────────────────────────────────────────────────────────────

function SessionsTab({ templates, exMap }: { templates: SessionTemplate[]; exMap: Map<string, Exercise> }) {
  const [cohorts, setCohorts] = useState<CohortRow[]>([])
  const [cohortId, setCohortId] = useState<string>('')
  const [sessions, setSessions] = useState<CohortSession[]>([])
  const [openMeeting, setOpenMeeting] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const workshopIds = useMemo(() => Array.from(new Set(templates.map(t => t.workshop_id))), [templates])

  useEffect(() => {
    if (workshopIds.length === 0) return
    ;(async () => {
      const { data } = await supabase
        .from('workshop_cohorts')
        .select('id, workshop_id, label, start_date, is_active, workshops(title)')
        .in('workshop_id', workshopIds)
        .order('start_date', { ascending: false })
        .limit(40)
      const rows = ((data ?? []) as unknown as (Omit<CohortRow, 'workshop_title'> & { workshops: { title: string } | null })[])
        .map(r => ({ ...r, workshop_title: r.workshops?.title ?? '' }))
      setCohorts(rows)
      // Default: the most recent ACTIVE cohort, which is the one she is
      // teaching this week.
      const first = rows.find(r => r.is_active) ?? rows[0]
      if (first && !cohortId) setCohortId(first.id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopIds])

  useEffect(() => {
    if (!cohortId) return
    supabase.from('cohort_sessions').select('*').eq('cohort_id', cohortId)
      .then(({ data }) => setSessions((data ?? []) as CohortSession[]))
  }, [cohortId])

  const cohort = cohorts.find(c => c.id === cohortId)
  const myTemplates = templates.filter(t => t.workshop_id === cohort?.workshop_id)

  function skippedOf(n: number): string[] {
    return sessions.find(s => s.meeting_number === n)?.skipped_exercise_ids ?? []
  }

  async function toggle(n: number, exerciseId: string) {
    if (!cohortId) return
    const current = new Set(skippedOf(n))
    current.has(exerciseId) ? current.delete(exerciseId) : current.add(exerciseId)
    const next = Array.from(current)
    setSaving(true)
    // Optimistic
    setSessions(prev => {
      const others = prev.filter(s => s.meeting_number !== n)
      const row = prev.find(s => s.meeting_number === n)
      return [...others, { id: row?.id ?? 'tmp', cohort_id: cohortId, meeting_number: n, skipped_exercise_ids: next, note: row?.note ?? null }]
    })
    if (next.length === 0) {
      await supabase.from('cohort_sessions').delete().eq('cohort_id', cohortId).eq('meeting_number', n)
    } else {
      await supabase.from('cohort_sessions')
        .upsert({ cohort_id: cohortId, meeting_number: n, skipped_exercise_ids: next }, { onConflict: 'cohort_id,meeting_number' })
    }
    const { data } = await supabase.from('cohort_sessions').select('*').eq('cohort_id', cohortId)
    setSessions((data ?? []) as CohortSession[])
    setSaving(false)
  }

  async function resetMeeting(n: number) {
    if (!cohortId) return
    await supabase.from('cohort_sessions').delete().eq('cohort_id', cohortId).eq('meeting_number', n)
    setSessions(prev => prev.filter(s => s.meeting_number !== n))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-sand-600 leading-relaxed">
        הכל מסומן כברירת מחדל. אחרי מפגש, בטלי סימון רק למה שלא הספקת: זה יעלה אוטומטית לראש המפגש הבא אצל האמהות. אם לא נכנסת בכלל, הן רואות את המפגש המלא.
      </p>

      <select value={cohortId} onChange={e => { setCohortId(e.target.value); setOpenMeeting(null) }}
        className="w-full bg-white border border-sand-200 rounded-2xl px-3 py-2.5 text-sm text-sand-800">
        {cohorts.map(c => (
          <option key={c.id} value={c.id}>
            {c.workshop_title.replace('ליווי התפתחותי - ', '')} · {c.label ?? c.start_date}{c.is_active ? '' : ' (סגור)'}
          </option>
        ))}
      </select>

      <div className="space-y-2">
        {myTemplates.map(t => {
          const skipped = new Set(skippedOf(t.meeting_number))
          const items = (t.exercise_ids ?? []).map(id => exMap.get(id)).filter((e): e is Exercise => !!e)
          const open = openMeeting === t.meeting_number
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-sand-100">
              <button onClick={() => setOpenMeeting(open ? null : t.meeting_number)}
                className="w-full flex items-center justify-between px-4 py-3 text-right">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
                    style={{ background: '#E7C78A', color: '#3B2E1C' }}>{t.meeting_number}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-sand-800 truncate">{t.title}</span>
                    <span className="block text-[11px] text-sand-400">
                      {skipped.size === 0 ? 'הכל הוספק' : `${skipped.size} לא הוספקו, עוברים למפגש ${t.meeting_number + 1}`}
                    </span>
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-sand-400 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-1">
                  {items.map(e => {
                    const done = !skipped.has(e.id)
                    return (
                      <button key={e.id} onClick={() => toggle(t.meeting_number, e.id)} disabled={saving}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-colors ${done ? 'bg-sand-50' : 'bg-[#FFF3EE]'}`}>
                        {done ? <CheckSquare className="w-5 h-5 text-green-600 flex-shrink-0" /> : <Square className="w-5 h-5 text-[#A35C3D] flex-shrink-0" />}
                        <span className={`text-sm ${done ? 'text-sand-700' : 'text-[#A35C3D] font-semibold'}`}>{e.title}</span>
                      </button>
                    )
                  })}
                  {skipped.size > 0 && (
                    <button onClick={() => resetMeeting(t.meeting_number)}
                      className="flex items-center gap-1.5 text-[12px] text-sand-400 hover:text-sand-600 px-2 pt-2">
                      <RotateCcw className="w-3.5 h-3.5" /> הכל הוספק
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {cohort && myTemplates.length === 0 && (
          <p className="text-sm text-sand-400 text-center py-4">למוצר הזה אין עדיין תוכנית מפגשים.</p>
        )}
      </div>
    </div>
  )
}

// ── תרגילים ───────────────────────────────────────────────────────────────

const EMPTY: Omit<Exercise, 'id'> = {
  slug: null, title: '', how: '', why: '', caution: '', lyrics: '', video_url: '',
  topics: [], terms: [], age_range: '', is_warmup: false, is_active: true,
}

function ExercisesTab({ exercises, topics, glossary, templates, onChanged }: {
  exercises: Exercise[]; topics: ProgramTopic[]; glossary: GlossaryTerm[]; templates: SessionTemplate[]; onChanged: () => void
}) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Exercise> | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const usedIn = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const t of templates) {
      for (const id of [...(t.exercise_ids ?? []), ...(t.warmup_exercise_ids ?? [])]) {
        const short = t.workshop_id.slice(0, 4)
        const list = m.get(id) ?? []
        list.push(`${short}·${t.meeting_number}`)
        m.set(id, list)
      }
    }
    return m
  }, [templates])

  const filtered = exercises.filter(e => !q || e.title.includes(q) || (e.how ?? '').includes(q))

  async function save() {
    if (!editing?.title?.trim()) return
    setSaving(true)
    const payload = {
      title: editing.title.trim(),
      how: editing.how || null,
      why: editing.why || null,
      caution: editing.caution || null,
      lyrics: editing.lyrics || null,
      video_url: editing.video_url || null,
      topics: editing.topics ?? [],
      terms: editing.terms ?? [],
      age_range: editing.age_range || null,
      is_warmup: !!editing.is_warmup,
      is_active: editing.is_active !== false,
    }
    if (editing.id) await supabase.from('exercises').update(payload).eq('id', editing.id)
    else await supabase.from('exercises').insert(payload)
    setSaving(false)
    setEditing(null)
    onChanged()
  }

  /** Straight into the private videos bucket, same policy the course
   *  videos use. The stored URL is the /object/public/ form the signer
   *  understands; the bucket itself stays private. */
  async function uploadVideo(file: File) {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'mp4'
    const path = `exercises/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('videos').upload(path, file, { upsert: false })
    if (!error) {
      const { data } = supabase.storage.from('videos').getPublicUrl(path)
      setEditing(e => ({ ...(e ?? {}), video_url: data.publicUrl }))
    } else {
      alert('ההעלאה נכשלה: ' + error.message)
    }
    setUploading(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש תרגיל..."
          className="flex-1 bg-white border border-sand-200 rounded-2xl px-3 py-2 text-sm" />
        <button onClick={() => setEditing({ ...EMPTY })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-bold text-white" style={{ background: '#E7C78A' }}>
          <Plus className="w-4 h-4" /> תרגיל
        </button>
      </div>

      <div className="space-y-1.5">
        {filtered.map(e => (
          <button key={e.id} onClick={() => setEditing({ ...e })}
            className="w-full bg-white rounded-2xl border border-sand-100 px-4 py-3 text-right flex items-center gap-3 hover:bg-sand-50">
            <span className="flex-1 min-w-0">
              <span className={`block text-sm font-bold truncate ${e.is_active ? 'text-sand-800' : 'text-sand-400 line-through'}`}>
                {e.is_warmup ? '🎵 ' : ''}{e.title}
              </span>
              <span className="block text-[11px] text-sand-400 truncate">
                {e.topics.map(k => topics.find(t => t.key === k)?.label ?? k).join(' · ') || 'בלי נושא'}
                {usedIn.get(e.id) ? ` · ${usedIn.get(e.id)!.length} מפגשים` : ' · לא במפגש'}
              </span>
            </span>
            {e.video_url && <Video className="w-4 h-4 text-mustard-500 flex-shrink-0" />}
          </button>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full lg:max-w-xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl lg:rounded-3xl p-5 space-y-3 shadow-xl" onClick={ev => ev.stopPropagation()}>
            <h3 className="font-bold text-sand-800">{editing.id ? 'עריכת תרגיל' : 'תרגיל חדש'}</h3>
            <Field label="כותרת"><input className="inp" value={editing.title ?? ''} onChange={e => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="איך עושים (HTML קל: p, ul, ol, strong, em)"><textarea className="inp min-h-[110px]" value={editing.how ?? ''} onChange={e => setEditing({ ...editing, how: e.target.value })} /></Field>
            <Field label="למה (התיבה הכחולה)"><textarea className="inp min-h-[70px]" value={editing.why ?? ''} onChange={e => setEditing({ ...editing, why: e.target.value })} /></Field>
            <Field label="שימי לב (התיבה האדומה)"><textarea className="inp min-h-[50px]" value={editing.caution ?? ''} onChange={e => setEditing({ ...editing, caution: e.target.value })} /></Field>
            <Field label="מילות שיר (שורה = <br>)"><textarea className="inp min-h-[50px]" value={editing.lyrics ?? ''} onChange={e => setEditing({ ...editing, lyrics: e.target.value })} /></Field>
            <Field label="טווח גיל (לא חובה)"><input className="inp" value={editing.age_range ?? ''} onChange={e => setEditing({ ...editing, age_range: e.target.value })} placeholder="למשל: עד חודשיים" /></Field>

            <Field label="נושאים">
              <div className="flex flex-wrap gap-1.5">
                {topics.map(t => {
                  const on = (editing.topics ?? []).includes(t.key)
                  return (
                    <button key={t.key} type="button"
                      onClick={() => setEditing({ ...editing, topics: on ? (editing.topics ?? []).filter(k => k !== t.key) : [...(editing.topics ?? []), t.key] })}
                      className="rounded-full px-3 py-1 text-[12px] font-semibold border"
                      style={on ? { background: '#2E2C24', color: '#fff', borderColor: '#2E2C24' } : { background: '#fff', color: '#4A443C', borderColor: '#E5DCD0' }}>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="מונחים שמופיעים בטקסט">
              <div className="flex flex-wrap gap-1.5">
                {glossary.map(g => {
                  const on = (editing.terms ?? []).includes(g.term)
                  return (
                    <button key={g.id} type="button"
                      onClick={() => setEditing({ ...editing, terms: on ? (editing.terms ?? []).filter(k => k !== g.term) : [...(editing.terms ?? []), g.term] })}
                      className="rounded-full px-2.5 py-1 text-[12px] border"
                      style={on ? { background: '#A35C3D', color: '#fff', borderColor: '#A35C3D' } : { background: '#fff', color: '#A35C3D', borderColor: '#E5DCD0' }}>
                      {g.term}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="סרטון">
              <div className="flex items-center gap-2">
                <input className="inp flex-1" value={editing.video_url ?? ''} onChange={e => setEditing({ ...editing, video_url: e.target.value })} placeholder="קישור, או העלאה" dir="ltr" />
                <label className="px-3 py-2 rounded-xl text-xs font-bold bg-sand-100 text-sand-700 cursor-pointer whitespace-nowrap">
                  {uploading ? 'מעלה...' : 'העלאה'}
                  <input type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f) }} />
                </label>
              </div>
            </Field>

            <div className="flex items-center gap-4 text-sm text-sand-700">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!editing.is_warmup} onChange={e => setEditing({ ...editing, is_warmup: e.target.checked })} /> חלק מהחימום</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={editing.is_active !== false} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> פעיל</label>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving || !editing.title?.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60" style={{ background: '#E7C78A' }}>
                <Save className="w-4 h-4" /> שמירה
              </button>
              <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-2xl text-sm font-bold bg-sand-100 text-sand-700">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── מונחון ────────────────────────────────────────────────────────────────

function GlossaryTab({ glossary, onChanged }: { glossary: GlossaryTerm[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<Partial<GlossaryTerm> | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!editing?.term?.trim() || !editing.plain?.trim()) return
    setSaving(true)
    const payload = { term: editing.term.trim(), plain: editing.plain.trim(), aliases: editing.aliases ?? [] }
    if (editing.id) await supabase.from('glossary').update(payload).eq('id', editing.id)
    else await supabase.from('glossary').insert(payload)
    setSaving(false); setEditing(null); onChanged()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-sand-600">מונח שמופיע בטקסט של תרגיל נפתח בלחיצה עם ההסבר הפשוט. הכינויים הם צורות נוספות של אותו מונח בטקסט (למשל ״רפלקס מורו״ ל״מורו״).</p>
      <button onClick={() => setEditing({ term: '', plain: '', aliases: [] })}
        className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-bold text-white" style={{ background: '#E7C78A' }}>
        <Plus className="w-4 h-4" /> מונח
      </button>
      <div className="space-y-1.5">
        {glossary.map(g => (
          <button key={g.id} onClick={() => setEditing({ ...g })}
            className="w-full bg-white rounded-2xl border border-sand-100 px-4 py-3 text-right hover:bg-sand-50">
            <span className="block text-sm font-bold" style={{ color: '#A35C3D' }}>{g.term}</span>
            <span className="block text-[13px] text-sand-600 leading-relaxed">{g.plain}</span>
          </button>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => setEditing(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative w-full lg:max-w-lg bg-white rounded-t-3xl lg:rounded-3xl p-5 space-y-3 shadow-xl" onClick={ev => ev.stopPropagation()}>
            <h3 className="font-bold text-sand-800">{editing.id ? 'עריכת מונח' : 'מונח חדש'}</h3>
            <Field label="מונח"><input className="inp" value={editing.term ?? ''} onChange={e => setEditing({ ...editing, term: e.target.value })} /></Field>
            <Field label="הסבר פשוט"><textarea className="inp min-h-[90px]" value={editing.plain ?? ''} onChange={e => setEditing({ ...editing, plain: e.target.value })} /></Field>
            <Field label="כינויים (מופרדים בפסיק)">
              <input className="inp" value={(editing.aliases ?? []).join(', ')}
                onChange={e => setEditing({ ...editing, aliases: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
            </Field>
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60" style={{ background: '#E7C78A' }}>
                <Save className="w-4 h-4" /> שמירה
              </button>
              <button onClick={() => setEditing(null)} className="px-4 py-2.5 rounded-2xl text-sm font-bold bg-sand-100 text-sand-700">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-sand-500 mb-1">{label}</span>
      {children}
    </label>
  )
}

