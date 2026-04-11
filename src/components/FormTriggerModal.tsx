import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type FormField = { id: string; type: 'text' | 'textarea' | 'select' | 'rating'; label: string; options?: string[]; required?: boolean }
type FormRecord = {
  id: string
  title: string
  description: string | null
  fields_json: FormField[]
  trigger_rule: { type: string; count: number } | null
  is_active: boolean
}

/**
 * Listens for active forms whose trigger conditions are met.
 * Currently supported triggers:
 *   - after_video_views: show after user has N video_start events
 *   - after_days:        show after user has been registered N days
 *
 * Renders a bottom-sheet modal when a form should be shown.
 * Stores submissions in form_submissions.
 */
export default function FormTriggerModal() {
  const { user, profile } = useAuth()
  const [pendingForm, setPendingForm] = useState<FormRecord | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const checkTriggers = useCallback(async () => {
    if (!user || !profile) return

    // Load active forms
    const { data: forms } = await supabase
      .from('forms')
      .select('*')
      .eq('is_active', true)

    if (!forms || forms.length === 0) return

    // Load already-submitted form ids for this user
    const { data: existing } = await supabase
      .from('form_submissions')
      .select('form_id')
      .eq('user_id', user.id)

    const submittedIds = new Set((existing ?? []).map(s => s.form_id))

    // Get user's video_start event count
    const { count: videoViews } = await supabase
      .from('user_activities')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('event_type', 'video_start')

    const daysSinceSignup = profile.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0

    for (const form of forms as FormRecord[]) {
      if (submittedIds.has(form.id)) continue
      const rule = form.trigger_rule
      if (!rule) continue

      let triggered = false
      if (rule.type === 'after_video_views' && (videoViews ?? 0) >= rule.count) {
        triggered = true
      } else if (rule.type === 'after_days' && daysSinceSignup >= rule.count) {
        triggered = true
      }

      if (triggered) {
        setPendingForm(form)
        break // show one form at a time
      }
    }
  }, [user, profile])

  useEffect(() => {
    checkTriggers()
  }, [checkTriggers])

  async function submit() {
    if (!user || !pendingForm) return
    const missing = pendingForm.fields_json.filter(f => f.required && !answers[f.label]?.trim())
    if (missing.length > 0) { alert(`שדות חובה: ${missing.map(f => f.label).join(', ')}`) ; return }
    setSubmitting(true)
    await supabase.from('form_submissions').insert({
      form_id: pendingForm.id,
      user_id: user.id,
      responses_json: answers,
    })
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(() => {
      setPendingForm(null)
      setSubmitted(false)
      setAnswers({})
    }, 1800)
  }

  if (!pendingForm) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-6" dir="rtl">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sand-100">
          <div>
            <h3 className="font-bold text-sand-800">{pendingForm.title}</h3>
            {pendingForm.description && (
              <p className="text-xs text-sand-400 mt-0.5">{pendingForm.description}</p>
            )}
          </div>
          <button onClick={() => setPendingForm(null)} className="p-1.5 text-sand-300 hover:text-sand-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-2">
            <div className="text-5xl">🙏</div>
            <p className="font-bold text-sand-800">תודה על המשוב!</p>
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {pendingForm.fields_json.map(field => (
              <div key={field.id}>
                <label className="block text-sm font-semibold text-sand-700 mb-1.5">{field.label}{field.required && <span className="text-red-400 mr-1">*</span>}</label>
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
                        className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                          answers[field.label] === String(n)
                            ? 'text-white shadow-md'
                            : 'bg-sand-100 text-sand-600 hover:bg-mustard-100 hover:text-mustard-700'
                        }`}
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
                        className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                          answers[field.label] === opt
                            ? 'text-white shadow-sm'
                            : 'bg-sand-100 text-sand-600 hover:bg-mustard-50 hover:text-mustard-700'
                        }`}
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
              {submitting ? 'שולח...' : 'שלח'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
