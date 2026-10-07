import { useEffect, useState, useCallback } from 'react'
import { X, ClipboardList, ChevronLeft } from 'lucide-react'
import { visibleAnswers } from '../lib/formFields'
import { SurveyFields, SurveyProgress, SurveySubmit, useSurveyProgress, scrollToField, SURVEY, type SurveyField } from './forms/SurveyFields'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTracker } from '../hooks/useTracker'

type FormRecord = { id: string; title: string; description: string | null; fields_json: SurveyField[]; allow_anonymous?: boolean }
type AssignedTask = {
  id: string
  form_id: string
  title: string | null
  description: string | null
  due_date: string | null
  completed_at: string | null
  forms: FormRecord
}

export default function MyTasksPanel() {
  const { user } = useAuth()
  const { track } = useTracker()
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [activeTask, setActiveTask] = useState<AssignedTask | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    const { data: assignments } = await supabase
      .from('form_assignments')
      .select('id, form_id, title, description, due_date, assigned_at, completed_at')
      .eq('user_id', user.id)
      .is('completed_at', null)
      .order('assigned_at', { ascending: false })
    if (!assignments?.length) { setTasks([]); return }

    const formIds = [...new Set(assignments.map(a => a.form_id))]
    const { data: forms } = await supabase.from('forms').select('*').in('id', formIds)
    const formsMap = Object.fromEntries((forms ?? []).map(f => [f.id, f]))

    setTasks(assignments.map(a => ({ ...a, forms: formsMap[a.form_id] })).filter(t => t.forms) as AssignedTask[])
  }, [user])

  // ?task=<form id> from the end-of-workshop email (App.tsx stores it).
  // Open her assignment for that form; if she has none, open the form
  // anyway (submit_form_response records it as answered); if she already
  // answered, say so instead of asking twice.
  const openPendingTask = useCallback(async () => {
    if (!user) return
    let formId: string | null = null
    try {
      const raw = localStorage.getItem('mimo_open_task')
      if (raw) {
        const p = JSON.parse(raw) as { formId?: string; at?: number }
        if (p.formId && (!p.at || Date.now() - p.at < 7 * 24 * 3600 * 1000)) formId = p.formId
        localStorage.removeItem('mimo_open_task')
      }
    } catch { /* ignore */ }
    if (!formId) return
    const { data: rows } = await supabase
      .from('form_assignments')
      .select('id, form_id, title, description, due_date, assigned_at, completed_at')
      .eq('user_id', user.id).eq('form_id', formId)
      .order('assigned_at', { ascending: false })
    const open = (rows ?? []).find(r => !r.completed_at)
    if (!open && (rows ?? []).length > 0) { setNotice('כבר מילאת את השאלון הזה, תודה 🤍'); return }
    const { data: form } = await supabase.from('forms').select('*').eq('id', formId).maybeSingle()
    if (!form) return
    const task = open
      ? { ...open, forms: form } as AssignedTask
      : { id: '', form_id: formId, title: null, description: null, due_date: null, completed_at: null, forms: form } as AssignedTask
    openTask(task)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  useEffect(() => { openPendingTask() }, [openPendingTask])

  useEffect(() => { load() }, [load])

  const { missing, requiredTotal, answeredRequired } = useSurveyProgress(activeTask?.forms.fields_json, answers)

  async function submit() {
    if (!user || !activeTask) return
    if (missing.length > 0) { setShowMissing(true); scrollToField(missing[0].id); return }
    setSubmitting(true)
    // One RPC (7.10.26): saves the answer (without her id when she chose
    // anonymous and the form allows it) and closes or records her task.
    const { error } = await supabase.rpc('submit_form_response', {
      p_form_id: activeTask.form_id,
      p_responses: visibleAnswers(activeTask.forms.fields_json, answers),
      p_anonymous: anonymous && !!activeTask.forms.allow_anonymous,
    })
    if (error) { setSubmitting(false); alert('משהו השתבש בשליחה, נסי שוב'); return }
    track('form_submit', { form_id: activeTask.form_id })
    setSubmitting(false)
    setSubmitted(true)
    const linkField = activeTask.forms.fields_json.find(f => f.type === 'link')
    if (linkField?.options?.[0]) window.open(linkField.options[0], '_blank', 'noopener,noreferrer')
    setTimeout(() => {
      setSubmitted(false)
      setActiveTask(null)
      setAnswers({})
      setShowMissing(false)
      load()
    }, 2200)
  }

  function openTask(task: AssignedTask) {
    track('form_open', { form_id: task.form_id, assignment_id: task.id })
    setActiveTask(task)
    setAnswers({})
    setShowMissing(false)
    setAnonymous(false)
  }

  if (tasks.length === 0 && !activeTask && !notice) return null

  return (
    <>
      {notice && (
        <div className="rounded-3xl flex items-center justify-between gap-3" dir="rtl"
          style={{ background: '#FBF1DC', border: `1.5px solid ${SURVEY.mustard}`, padding: '14px 16px' }}>
          <p className="font-bold" style={{ fontSize: 15, color: SURVEY.ink }}>{notice}</p>
          <button onClick={() => setNotice(null)} className="p-1.5 rounded-full flex-shrink-0" style={{ background: SURVEY.chip, color: SURVEY.muted }} aria-label="סגירה">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary card: top of the feed, mustard, one clear action per task */}
      {tasks.length > 0 && (
      <div
        className="rounded-3xl shadow-sm"
        dir="rtl"
        style={{ background: 'linear-gradient(135deg, #FBF1DC 0%, #F6E6C4 100%)', border: `1.5px solid ${SURVEY.mustard}`, padding: '16px 16px 14px' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-2xl flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: SURVEY.mustard }}>
            <ClipboardList style={{ width: 22, height: 22, color: SURVEY.ink }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold" style={{ fontSize: 16, color: SURVEY.ink }}>{tasks.length === 1 ? 'מחכה לך משהו קטן' : `${tasks.length} דברים קטנים מחכים לך`}</p>
            <p style={{ fontSize: 13, color: SURVEY.muted }}>{tasks.length === 1 ? 'טופס אחד למילוי' : `${tasks.length} טפסים למילוי`}</p>
          </div>
        </div>
        <div className="space-y-2">
          {tasks.map(task => (
            <button
              key={task.id}
              onClick={() => openTask(task)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl text-right transition-transform active:scale-[0.99]"
              style={{ padding: '14px 16px', border: `1.5px solid ${SURVEY.border}` }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold leading-snug" style={{ fontSize: 15, color: SURVEY.ink }}>{task.title || task.forms.title}</p>
                {(task.description || task.forms.description) && (
                  <p className="mt-0.5 leading-snug" style={{ fontSize: 13, color: SURVEY.muted }}>{task.description || task.forms.description}</p>
                )}
                {task.due_date && (
                  <p className="mt-1" style={{ fontSize: 12, color: SURVEY.mustardDeep, fontWeight: 600 }}>
                    עד {new Date(task.due_date + 'T12:00:00').toLocaleDateString('he-IL')}
                  </p>
                )}
              </div>
              <span className="flex items-center gap-1 flex-shrink-0 rounded-xl font-bold" style={{ background: SURVEY.mustard, color: SURVEY.ink, fontSize: 14, padding: '10px 14px' }}>
                למילוי
                <ChevronLeft style={{ width: 16, height: 16 }} strokeWidth={2.5} />
              </span>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Form sheet */}
      {activeTask && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45" dir="rtl">
          <div className="w-full max-w-md flex flex-col rounded-t-[28px] shadow-2xl overflow-hidden" style={{ background: SURVEY.sheet, maxHeight: '94vh' }}>
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 bg-white" style={{ borderBottom: `1px solid ${SURVEY.border}` }}>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold leading-snug" style={{ fontSize: 18, color: SURVEY.ink }}>{activeTask.title || activeTask.forms.title}</h3>
                {(activeTask.description || activeTask.forms.description) && (
                  <p className="mt-0.5 leading-snug" style={{ fontSize: 13, color: SURVEY.muted }}>{activeTask.description || activeTask.forms.description}</p>
                )}
                {!submitted && <SurveyProgress answered={answeredRequired} total={requiredTotal} done={missing.length === 0} />}
              </div>
              <button onClick={() => setActiveTask(null)} className="p-2 rounded-full flex-shrink-0" style={{ background: SURVEY.chip, color: SURVEY.muted }} aria-label="סגירה">
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitted ? (
              <div className="p-10 text-center space-y-3">
                <div className="text-6xl">🎉</div>
                <p className="font-bold" style={{ fontSize: 18, color: SURVEY.ink }}>תודה! התשובות נשלחו</p>
                <p style={{ fontSize: 14, color: SURVEY.muted }}>ברנדה קוראת כל תשובה</p>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  <SurveyFields fields={activeTask.forms.fields_json} answers={answers} setAnswers={setAnswers} showMissing={showMissing} />
                </div>
                <div className="px-4 pt-3 bg-white" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', borderTop: `1px solid ${SURVEY.border}` }}>
                  {activeTask.forms.allow_anonymous && (
                    <label className="flex items-start gap-2.5 mb-3 cursor-pointer select-none">
                      <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)}
                        className="mt-0.5 flex-shrink-0" style={{ width: 18, height: 18, accentColor: SURVEY.mustardDeep }} />
                      <span style={{ fontSize: 13.5, color: SURVEY.ink, lineHeight: 1.45 }}>
                        <b>לשלוח בלי השם שלי</b>
                        <span style={{ display: 'block', color: SURVEY.muted, fontSize: 12.5 }}>התשובות יישמרו בלי קישור אלייך</span>
                      </span>
                    </label>
                  )}
                  <SurveySubmit onSubmit={submit} submitting={submitting} missingCount={missing.length} showMissing={showMissing} />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
