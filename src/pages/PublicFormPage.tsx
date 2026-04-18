import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

type FormField = {
  id: string
  type: 'text' | 'textarea' | 'select' | 'rating'
  label: string
  options?: string[]
  required?: boolean
}

type FormRecord = {
  id: string
  title: string
  description: string | null
  fields_json: FormField[]
}

export default function PublicFormPage({ formId }: { formId: string }) {
  const [form, setForm] = useState<FormRecord | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  useEffect(() => {
    supabase
      .from('forms')
      .select('*')
      .eq('id', formId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setNotFound(true)
        else setForm(data as FormRecord)
      })
  }, [formId])

  async function submit() {
    if (!form) return
    // Validate required fields
    const errs: Record<string, boolean> = {}
    form.fields_json.forEach(f => {
      if (f.required && !answers[f.label]?.trim()) errs[f.label] = true
    })
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setSubmitting(true)
    await supabase.from('form_submissions').insert({
      form_id: form.id,
      user_id: null,
      responses_json: answers,
    })
    setSubmitting(false)
    setSubmitted(true)
  }

  const bg = 'linear-gradient(135deg, #F7F3EC 0%, #F2EBE0 100%)'

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: bg }} dir="rtl">
        <div className="text-center space-y-3">
          <MimoLogo size={70} />
          <p className="text-sand-500 text-sm">הטופס לא נמצא או לא זמין</p>
        </div>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
        <div className="w-8 h-8 border-2 border-mustard-300 border-t-mustard-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: bg }} dir="rtl">
        <div className="bg-white rounded-3xl p-8 text-center space-y-4 shadow-xl max-w-sm w-full">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold text-sand-800">תודה!</h2>
          <p className="text-sand-500 text-sm">התשובות שלך נשמרו בהצלחה.</p>
          <div className="pt-2">
            <MimoLogo size={50} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4" style={{ background: bg }} dir="rtl">
      <div className="max-w-sm mx-auto space-y-4 pt-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <MimoLogo size={60} />
          <h1 className="text-xl font-bold text-sand-800">{form.title}</h1>
          {form.description && <p className="text-sand-500 text-sm">{form.description}</p>}
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-5 shadow-sm space-y-5">
          {form.fields_json.map(field => (
            <div key={field.id}>
              <label className="block text-sm font-semibold text-sand-700 mb-2">
                {field.label}
                {field.required && <span className="text-red-500 mr-1">*</span>}
              </label>

              {field.type === 'text' && (
                <input
                  value={answers[field.label] ?? ''}
                  onChange={e => setAnswers(a => ({ ...a, [field.label]: e.target.value }))}
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-300 bg-red-50' : 'border-sand-200 focus:border-mustard-400'}`}
                />
              )}

              {field.type === 'textarea' && (
                <textarea
                  rows={3}
                  value={answers[field.label] ?? ''}
                  onChange={e => setAnswers(a => ({ ...a, [field.label]: e.target.value }))}
                  className={`w-full px-4 py-3 border-2 rounded-2xl text-sm focus:outline-none resize-none transition-colors ${errors[field.label] ? 'border-red-300 bg-red-50' : 'border-sand-200 focus:border-mustard-400'}`}
                />
              )}

              {field.type === 'rating' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setAnswers(a => ({ ...a, [field.label]: String(n) }))}
                      className="w-11 h-11 rounded-xl text-sm font-bold transition-all"
                      style={answers[field.label] === String(n)
                        ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)', color: 'white' }
                        : { background: '#F5F0E8', color: '#9B8E80' }}
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
                      className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                      style={answers[field.label] === opt
                        ? { background: 'linear-gradient(135deg, #D4AA52, #C49438)', color: 'white' }
                        : { background: '#F5F0E8', color: '#9B8E80' }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {errors[field.label] && (
                <p className="text-xs text-red-500 mt-1">שדה זה חובה</p>
              )}
            </div>
          ))}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-white font-bold text-sm disabled:opacity-50 mt-2"
            style={{ background: 'linear-gradient(135deg, #D4AA52, #C49438)' }}
          >
            {submitting ? 'שולח...' : 'שלח טופס ✓'}
          </button>
        </div>

        <p className="text-center text-xs text-sand-300 pb-6">מופעל על ידי Mimo 🐣</p>
      </div>
    </div>
  )
}
