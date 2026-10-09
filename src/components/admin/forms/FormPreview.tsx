import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Smartphone } from 'lucide-react'
import { SurveyFields, SurveyProgress, useSurveyProgress, SURVEY, type SurveyField } from '../../forms/SurveyFields'
import { isFieldVisible } from '../../../lib/formFields'
import MimoLogo from '../../MimoLogo'

/**
 * "איך זה נראה לאמא" — a live preview of a questionnaire while it is being
 * edited (9.10.26, Yahav: "אין לי אופציה לראות איך זה נראה לאמא").
 *
 * It renders the SAME SurveyFields the mother gets (public link, in-app task,
 * triggered form), inside a phone-width frame, updating on every keystroke.
 * It is interactive: answers here are local and never saved, so conditional
 * questions (showIf) can be tried out. The question being edited is
 * highlighted and scrolled into view.
 */
export default function FormPreview({ title, description, fields, activeId, compact = false }: {
  title: string
  description: string
  fields: SurveyField[]
  activeId?: string | null
  /** Mobile editor: no outer phone frame, full width. */
  compact?: boolean
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [showMissing, setShowMissing] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  const { missing, requiredTotal, answeredRequired } = useSurveyProgress(fields, answers)

  useEffect(() => {
    if (!activeId || !box.current) return
    const el = box.current.querySelector(`[data-qid="${activeId}"]`) as HTMLElement | null
    if (!el) return
    const top = el.offsetTop - box.current.offsetTop - 80
    box.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }, [activeId])

  const active = activeId ? fields.find(f => f.id === activeId) : null
  const activeHidden = !!active && active.type !== 'link' && !isFieldVisible(active, answers)
  const linkField = fields.find(f => f.type === 'link')

  return (
    <div className={compact ? '' : 'flex flex-col items-center'} dir="rtl">
      {!compact && (
        <p className="flex items-center gap-1.5 font-bold mb-2" style={{ fontSize: 12.5, color: '#8A7A63' }}>
          <Smartphone className="w-4 h-4" /> ככה זה נראה לאמא
          <button onClick={() => { setAnswers({}); setShowMissing(false) }} className="flex items-center gap-1 font-semibold mr-2 hover:underline" style={{ color: '#A2937D' }} title="לנקות את התשובות בתצוגה">
            <RotateCcw className="w-3 h-3" /> לנקות
          </button>
        </p>
      )}
      <div
        className={compact ? 'rounded-2xl overflow-hidden' : 'overflow-hidden'}
        style={compact
          ? { border: `1px solid ${SURVEY.border}` }
          : { width: 380, maxWidth: '100%', borderRadius: 34, border: '9px solid #3B3128', boxShadow: '0 12px 32px rgba(60,45,30,0.18)' }}
      >
        <style>{`.form-preview [data-qid="${activeId ?? '__none__'}"] { outline: 3px solid ${SURVEY.mustardDeep}; outline-offset: 2px; }`}</style>
        <div ref={box} className="form-preview overflow-y-auto" style={{ background: SURVEY.sheet, maxHeight: compact ? undefined : 'calc(100vh - 190px)', minHeight: compact ? undefined : 520 }}>
          <div className="bg-white px-5 pt-6 pb-4" style={{ borderBottom: `1px solid ${SURVEY.border}` }}>
            <div className="flex justify-center mb-2"><MimoLogo size={44} /></div>
            <h1 className="font-bold leading-snug text-center" style={{ fontSize: 19, color: SURVEY.ink }}>{title || <span style={{ color: SURVEY.muted }}>כותרת הטופס</span>}</h1>
            {description && <p className="mt-1 leading-relaxed whitespace-pre-line text-center" style={{ fontSize: 13, color: SURVEY.muted }}>{description}</p>}
            <SurveyProgress answered={answeredRequired} total={requiredTotal} done={missing.length === 0} />
          </div>

          {activeHidden && (
            <p className="mx-4 mt-3 rounded-xl px-3 py-2 font-semibold" style={{ fontSize: 12.5, background: '#FBF1DC', color: '#6E5836' }}>
              השאלה שאת עורכת מוסתרת כרגע לפי תנאי ההצגה שלה. עני כאן על השאלה שהיא תלויה בה כדי לראות אותה.
            </p>
          )}

          <div className="px-4 py-4 space-y-3">
            {fields.length === 0
              ? <p className="text-center py-8" style={{ fontSize: 13.5, color: SURVEY.muted }}>עוד אין שאלות. מה שתוסיפי יופיע כאן.</p>
              : <SurveyFields fields={fields} answers={answers} setAnswers={setAnswers} showMissing={showMissing} />}
          </div>

          <div className="px-4 pt-3 pb-4 bg-white" style={{ borderTop: `1px solid ${SURVEY.border}` }}>
            <button
              type="button"
              onClick={() => setShowMissing(true)}
              className="w-full rounded-2xl font-bold"
              style={{ padding: '13px 16px', fontSize: 15, background: SURVEY.mustard, color: SURVEY.ink }}
            >
              שליחת הטופס ✓
            </button>
            <p className="text-center mt-2" style={{ fontSize: 11, color: SURVEY.muted }}>
              {showMissing && missing.length > 0 ? `חסרות ${missing.length} תשובות חובה (בתצוגה בלבד, שום דבר לא נשמר)` : 'תצוגה בלבד. שום דבר לא נשמר.'}
              {linkField?.options?.[0] ? ' אחרי שליחה נפתח הלינק לתשלום.' : ''}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
