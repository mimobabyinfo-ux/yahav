import { useEffect, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { visibleAnswers, type FormShowIf } from '../lib/formFields'
import { SurveyFields, SurveyProgress, SurveySubmit, useSurveyProgress, scrollToField, SURVEY } from './forms/SurveyFields'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { cachedQuery } from '../lib/queryCache'

import type { SurveyField as FormField } from './forms/SurveyFields'
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
  const [showMissing, setShowMissing] = useState(false)

  const checkTriggers = useCallback(async () => {
    if (!user || !profile || profile.is_admin) return
    // Three round trips per check, and the trigger rules count days and
    // video views — nothing that flips between two screens of the same
    // visit. Once per tab session per user.
    const onceKey = `mimo_form_triggers_checked:${user.id}`
    try { if (sessionStorage.getItem(onceKey)) return } catch { /* private mode */ }

    // Load active forms (cached; the same list serves every visit)
    const forms = await cachedQuery<FormRecord[]>('forms:active', async () => {
      const { data } = await supabase.from('forms').select('*').eq('is_active', true)
      return (data ?? []) as FormRecord[]
    }, 10 * 60_000)
    try { sessionStorage.setItem(onceKey, '1') } catch { /* ignore */ }

    if (forms.length === 0 || !forms.some(f => f.trigger_rule)) return

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

  const { missing, requiredTotal, answeredRequired } = useSurveyProgress(pendingForm?.fields_json, answers)

  async function submit() {
    if (!user || !pendingForm) return
    if (missing.length > 0) { setShowMissing(true); scrollToField(missing[0].id); return }
    setSubmitting(true)
    await supabase.from('form_submissions').insert({
      form_id: pendingForm.id,
      user_id: user.id,
      responses_json: visibleAnswers(pendingForm.fields_json, answers),
    })
    setSubmitting(false)
    setSubmitted(true)
    setTimeout(() => {
      setPendingForm(null)
      setSubmitted(false)
      setAnswers({})
      setShowMissing(false)
    }, 2200)
  }

  if (!pendingForm) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45" dir="rtl">
      <div className="w-full max-w-md flex flex-col rounded-t-[28px] shadow-2xl overflow-hidden" style={{ background: SURVEY.sheet, maxHeight: '94vh' }}>
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 bg-white" style={{ borderBottom: `1px solid ${SURVEY.border}` }}>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold leading-snug" style={{ fontSize: 18, color: SURVEY.ink }}>{pendingForm.title}</h3>
            {pendingForm.description && (
              <p className="mt-0.5 leading-snug" style={{ fontSize: 13, color: SURVEY.muted }}>{pendingForm.description}</p>
            )}
            {!submitted && <SurveyProgress answered={answeredRequired} total={requiredTotal} done={missing.length === 0} />}
          </div>
          <button onClick={() => setPendingForm(null)} className="p-2 rounded-full flex-shrink-0" style={{ background: SURVEY.chip, color: SURVEY.muted }} aria-label="סגירה">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-10 text-center space-y-3">
            <div className="text-6xl">🙏🏼</div>
            <p className="font-bold" style={{ fontSize: 18, color: SURVEY.ink }}>תודה על המשוב!</p>
            <p style={{ fontSize: 14, color: SURVEY.muted }}>ברנדה קוראת כל תשובה</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <SurveyFields fields={pendingForm.fields_json} answers={answers} setAnswers={setAnswers} showMissing={showMissing} />
            </div>
            <div className="px-4 pt-3 bg-white" style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))', borderTop: `1px solid ${SURVEY.border}` }}>
              <SurveySubmit onSubmit={submit} submitting={submitting} missingCount={missing.length} showMissing={showMissing} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
