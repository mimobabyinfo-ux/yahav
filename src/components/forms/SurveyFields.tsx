// Shared survey UI for every place a form is filled: assigned tasks
// (MyTasksPanel), triggered forms (FormTriggerModal) and the public link
// (PublicFormPage). Brenda 6.10.26: white question cards, bordered pills
// with a check when chosen, dark text on mustard, progress bar, required
// validation with a jump to the first missing question.
import { useMemo } from 'react'
import { Check } from 'lucide-react'
import { isFieldVisible, toggleMulti, multiSelected, type FormShowIf } from '../../lib/formFields'

export type SurveyField = {
  id: string
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'rating' | 'date' | 'info' | 'link'
  label: string
  options?: string[]
  required?: boolean
  showIf?: FormShowIf | null
  maxSelect?: number
  role?: string
}

export const SURVEY = {
  ink: '#4A3A28',
  muted: '#8A7A66',
  mustard: '#E7C78A',
  mustardDeep: '#C8A460',
  border: '#DDD3C3',
  sheet: '#F7F2EA',
  chip: '#F3EEE5',
  info: '#FBF1DC',
  error: '#C96A55',
  errorBorder: '#D98B7A',
}

export const INPUT_TYPES = new Set(['text', 'textarea', 'select', 'multiselect', 'rating', 'date'])

type Answers = Record<string, string>

export function useSurveyProgress(fields: SurveyField[] | undefined, answers: Answers) {
  return useMemo(() => {
    const fs = fields ?? []
    const visibleRequired = fs.filter(f => INPUT_TYPES.has(f.type) && f.required && isFieldVisible(f, answers))
    const missing = visibleRequired.filter(f => !answers[f.label]?.trim())
    return { missing, requiredTotal: visibleRequired.length, answeredRequired: visibleRequired.length - missing.length }
  }, [fields, answers])
}

export function scrollToField(id: string) {
  const el = document.querySelector(`[data-qid="${id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-right flex items-center gap-2 rounded-2xl text-[15px] transition-all active:scale-[0.98]"
      style={{
        padding: '13px 16px',
        background: on ? SURVEY.mustard : '#FFFFFF',
        color: SURVEY.ink,
        border: `2px solid ${on ? SURVEY.mustardDeep : SURVEY.border}`,
        fontWeight: on ? 700 : 500,
        boxShadow: on ? '0 2px 8px rgba(200,164,96,0.35)' : 'none',
      }}
    >
      <span
        className="flex items-center justify-center flex-shrink-0 rounded-full"
        style={{ width: 20, height: 20, background: on ? SURVEY.mustardDeep : SURVEY.chip, border: on ? 'none' : `1.5px solid ${SURVEY.border}` }}
      >
        {on && <Check style={{ width: 13, height: 13, color: '#fff' }} strokeWidth={3} />}
      </span>
      <span className="flex-1 leading-snug">{children}</span>
    </button>
  )
}

export function SurveyProgress({ answered, total, done }: { answered: number; total: number; done: boolean }) {
  if (total === 0) return null
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between mb-1" style={{ fontSize: 12, color: SURVEY.muted }}>
        <span>{answered} מתוך {total} שאלות חובה</span>
        {done && <span style={{ color: SURVEY.mustardDeep, fontWeight: 700 }}>אפשר לשלוח ✓</span>}
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: '#EFE8DC' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${(answered / total) * 100}%`, background: SURVEY.mustardDeep }} />
      </div>
    </div>
  )
}

export function SurveySubmit({ onSubmit, submitting, missingCount, showMissing, label }: { onSubmit: () => void; submitting: boolean; missingCount: number; showMissing: boolean; label?: string }) {
  const done = missingCount === 0
  return (
    <>
      {showMissing && missingCount > 0 && (
        <p className="text-center mb-2" style={{ fontSize: 13, color: SURVEY.error, fontWeight: 600 }}>
          נשארו {missingCount} שאלות חובה
        </p>
      )}
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="w-full rounded-2xl font-bold disabled:opacity-60 transition-all active:scale-[0.99]"
        style={{ height: 52, fontSize: 16, background: done ? SURVEY.mustardDeep : SURVEY.mustard, color: done ? '#fff' : SURVEY.ink }}
      >
        {submitting ? 'שולחת...' : done ? (label ?? 'שליחה ✓') : `שליחה (עוד ${missingCount} חובה)`}
      </button>
    </>
  )
}

export function SurveyFields({ fields, answers, setAnswers, showMissing }: {
  fields: SurveyField[]
  answers: Answers
  setAnswers: (fn: (a: Answers) => Answers) => void
  showMissing: boolean
}) {
  const inputBase = 'w-full px-4 py-3 rounded-2xl text-[15px] focus:outline-none bg-white'
  const inputStyle = { border: `2px solid ${SURVEY.border}`, color: SURVEY.ink }
  const set = (label: string, value: string) => setAnswers(a => ({ ...a, [label]: value }))

  return (
    <>
      {fields.map((field, idx) => {
        if (field.type === 'link') return null
        if (!isFieldVisible(field, answers)) return null
        if (field.type === 'info') return (
          <div key={field.id} className="rounded-2xl p-4" style={{ background: SURVEY.info, borderRight: `4px solid ${SURVEY.mustard}` }}>
            <p className="leading-relaxed whitespace-pre-line" style={{ fontSize: 14.5, color: SURVEY.ink }}>{field.label}</p>
          </div>
        )
        const isMissing = showMissing && !!field.required && !answers[field.label]?.trim()
        const qNumber = fields.slice(0, idx).filter(f => INPUT_TYPES.has(f.type) && isFieldVisible(f, answers)).length + 1
        return (
          <div key={field.id} data-qid={field.id} className="bg-white rounded-2xl p-4" style={{ border: `1.5px solid ${isMissing ? SURVEY.errorBorder : SURVEY.border}` }}>
            <div className="flex items-start gap-2 mb-3">
              <span className="flex-shrink-0 rounded-full flex items-center justify-center font-bold" style={{ width: 24, height: 24, fontSize: 12, background: SURVEY.chip, color: SURVEY.muted }}>{qNumber}</span>
              <label className="block font-bold leading-snug flex-1 whitespace-pre-line" style={{ fontSize: 15.5, color: SURVEY.ink }}>
                {field.label}
                {field.required && <span style={{ color: SURVEY.error, marginRight: 4 }}>*</span>}
              </label>
            </div>

            {field.type === 'text' && (
              <input value={answers[field.label] ?? ''} onChange={e => set(field.label, e.target.value)} className={inputBase} style={inputStyle} />
            )}
            {field.type === 'textarea' && (
              <textarea rows={3} value={answers[field.label] ?? ''} onChange={e => set(field.label, e.target.value)} placeholder="כתבי כאן..." className={`${inputBase} resize-none`} style={inputStyle} />
            )}
            {field.type === 'date' && (
              <div dir="ltr" className="overflow-hidden">
                <input type="date" value={answers[field.label] ?? ''} onChange={e => set(field.label, e.target.value)} className={`${inputBase} max-w-full box-border`} style={inputStyle} />
              </div>
            )}
            {field.type === 'rating' && (
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => {
                  const on = answers[field.label] === String(n)
                  return (
                    <button key={n} type="button" onClick={() => set(field.label, String(n))} className="flex-1 rounded-xl font-bold transition-all"
                      style={{ height: 46, fontSize: 16, background: on ? SURVEY.mustard : '#fff', color: SURVEY.ink, border: `2px solid ${on ? SURVEY.mustardDeep : SURVEY.border}` }}>
                      {n}
                    </button>
                  )
                })}
              </div>
            )}
            {field.type === 'select' && (
              <div className="flex flex-col gap-2">
                {(field.options ?? []).map(opt => (
                  <Pill key={opt} on={answers[field.label] === opt} onClick={() => set(field.label, opt)}>{opt}</Pill>
                ))}
              </div>
            )}
            {field.type === 'multiselect' && (
              <div className="flex flex-col gap-2">
                {(field.options ?? []).map(opt => {
                  const on = multiSelected(answers[field.label]).includes(opt)
                  return (
                    <Pill key={opt} on={on} onClick={() => setAnswers(a => ({ ...a, [field.label]: toggleMulti(a[field.label], opt, field.maxSelect) }))}>{opt}</Pill>
                  )
                })}
                <p style={{ fontSize: 12, color: SURVEY.muted }}>{field.maxSelect ? `אפשר לבחור עד ${field.maxSelect}` : 'אפשר לבחור כמה תשובות'}</p>
              </div>
            )}
            {isMissing && <p className="mt-2" style={{ fontSize: 12.5, color: SURVEY.error, fontWeight: 600 }}>שאלת חובה</p>}
          </div>
        )
      })}
    </>
  )
}
