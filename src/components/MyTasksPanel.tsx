import { useEffect, useState, useCallback } from 'react'
import { X, ClipboardList } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type FormField = { id: string; type: 'text' | 'textarea' | 'select' | 'rating'; label: string; options?: string[] }
type FormRecord = { id: string; title: string; description: string | null; fields_json: FormField[] }
type AssignedTask = {
  id: string
  form_id: string
  is_completed: boolean
  forms: FormRecord
}

export default function MyTasksPanel() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<AssignedTask[]>([])
  const [activeTask, setActiveTask] = useState<AssignedTask | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('form_assignments')
      .select('*, forms(*)')
      .eq('user_id', user.id)
      .eq('is_completed', false)
      .order('created_at', { ascending: false })
    setTasks((data ?? []) as AssignedTask[])
  }, [user])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!user || !activeTask) return
    setSubmitting(true)
    await supabase.from('form_submissions').insert({
      form_id: activeTask.form_id,
      user_id: user.id,
      responses_json: answers,
    })
    await supabase.from('form_assignments').update({ is_completed: true }).eq('id', activeTask.id)
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setActiveTask(null)
      setAnswers({})
      load()
    }, 1800)
  }

  if (tasks.length === 0) return null

  return (
    <>
      {/* Summary card */}
      <div className="bg-white rounded-3xl shadow-sm p-4 border-r-4 border-mustard-400" dir="rtl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-2xl bg-mustard-100 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-mustard-600" />
          </div>
          <div>
            <p className="font-bold text-sand-800 text-sm">משימות שהוקצו לך</p>
            <p className="text-xs text-sand-400">{tasks.length} טפסים ממתינים</p>
          </div>
        </div>
        <div className="space-y-2">
          {tasks.map(task => (
            <button
              key={task.id}
              onClick={() => { setActiveTask(task); setAnswers({}) }}
              className="w-full flex items-center justify-between px-4 py-3 bg-mustard-50 rounded-2xl text-right hover:bg-mustard-100 transition-colors"
            >
              <span className="text-sm font-semibold text-sand-800">{task.forms.title}</span>
              <span className="text-xs bg-mustard-400 text-white px-2 py-0.5 rounded-lg">מלאי</span>
            </button>
          ))}
        </div>
      </div>

      {/* Form modal */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
              <div>
                <h3 className="font-bold text-sand-800">{activeTask.forms.title}</h3>
                {activeTask.forms.description && <p className="text-xs text-sand-400 mt-0.5">{activeTask.forms.description}</p>}
              </div>
              <button onClick={() => setActiveTask(null)} className="p-1.5 text-sand-300 hover:text-sand-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {submitted ? (
              <div className="p-8 text-center space-y-2">
                <div className="text-5xl">🎉</div>
                <p className="font-bold text-sand-800">כל הכבוד! המשימה הושלמה.</p>
              </div>
            ) : (
              <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
                {activeTask.forms.fields_json.map(field => (
                  <div key={field.id}>
                    <label className="block text-sm font-semibold text-sand-700 mb-1.5">{field.label}</label>
                    {field.type === 'text' && (
                      <input
                        value={answers[field.label] ?? ''}
                        onChange={e => setAnswers(a => ({ ...a, [field.label]: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400"
                      />
                    )}
                    {field.type === 'textarea' && (
                      <textarea
                        rows={3}
                        value={answers[field.label] ?? ''}
                        onChange={e => setAnswers(a => ({ ...a, [field.label]: e.target.value }))}
                        className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl text-sm focus:outline-none focus:border-mustard-400 resize-none"
                      />
                    )}
                    {field.type === 'rating' && (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => setAnswers(a => ({ ...a, [field.label]: String(n) }))}
                            className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${answers[field.label] === String(n) ? 'text-white shadow-md' : 'bg-sand-100 text-sand-600 hover:bg-mustard-100 hover:text-mustard-700'}`}
                            style={answers[field.label] === String(n) ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                    {field.type === 'select' && (
                      <div className="flex flex-wrap gap-2">
                        {(field.options ?? []).map(opt => (
                          <button
                            key={opt}
                            onClick={() => setAnswers(a => ({ ...a, [field.label]: opt }))}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${answers[field.label] === opt ? 'text-white shadow-sm' : 'bg-sand-100 text-sand-600 hover:bg-mustard-50 hover:text-mustard-700'}`}
                            style={answers[field.label] === opt ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)' } : {}}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-2xl text-white font-bold text-sm disabled:opacity-50 mt-2"
                  style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
                >
                  {submitting ? 'שולח...' : 'סיום משימה ✓'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
