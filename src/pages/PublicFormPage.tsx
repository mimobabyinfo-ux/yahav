import { useEffect, useState } from 'react'
import { visibleAnswers } from '../lib/formFields'
import { SurveyFields, SurveyProgress, SurveySubmit, useSurveyProgress, scrollToField, SURVEY, type SurveyField } from '../components/forms/SurveyFields'
import { supabase } from '../lib/supabase'
import MimoLogo from '../components/MimoLogo'

type FormField = SurveyField

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
  const [showMissing, setShowMissing] = useState(false)

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

  const { missing, requiredTotal, answeredRequired } = useSurveyProgress(form?.fields_json, answers)

  async function submit() {
    if (!form) return
    if (missing.length > 0) { setShowMissing(true); scrollToField(missing[0].id); return }
    setSubmitting(true)
    await supabase.from('form_submissions').insert({
      form_id: form.id,
      user_id: null,
      responses_json: visibleAnswers(form.fields_json, answers),
    })
    setSubmitting(false)
    setSubmitted(true)
    // Auto-open payment link if form contains a link field
    const linkField = form.fields_json.find(f => f.type === 'link')
    if (linkField?.options?.[0]) {
      window.open(linkField.options[0], '_blank', 'noopener,noreferrer')
    }
  }

  const bg = '#FFFFFF'

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
        <div className="bg-[#F5F1EB] rounded-3xl p-8 text-center space-y-4 shadow-xl max-w-sm w-full">
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
    <div className="min-h-screen" style={{ background: SURVEY.sheet }} dir="rtl">
      <div className="max-w-md mx-auto flex flex-col min-h-screen">
        <div className="bg-white px-5 pt-8 pb-4" style={{ borderBottom: `1px solid ${SURVEY.border}` }}>
          <div className="flex justify-center mb-3"><MimoLogo size={56} /></div>
          <h1 className="font-bold leading-snug text-center" style={{ fontSize: 20, color: SURVEY.ink }}>{form.title}</h1>
          {form.description && (
            <p className="mt-1 leading-relaxed whitespace-pre-line text-center" style={{ fontSize: 13.5, color: SURVEY.muted }}>{form.description}</p>
          )}
          <SurveyProgress answered={answeredRequired} total={requiredTotal} done={missing.length === 0} />
        </div>

        <div className="flex-1 px-4 py-4 space-y-3">
          <SurveyFields fields={form.fields_json} answers={answers} setAnswers={setAnswers} showMissing={showMissing} />
        </div>

        <div className="sticky bottom-0 px-4 pt-3 bg-white" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', borderTop: `1px solid ${SURVEY.border}` }}>
          <SurveySubmit onSubmit={submit} submitting={submitting} missingCount={missing.length} showMissing={showMissing} label="שליחת הטופס ✓" />
          <p className="text-center mt-2" style={{ fontSize: 11, color: SURVEY.muted }}>מופעל על ידי Mimo 🐣</p>
        </div>
      </div>
    </div>
  )
}
