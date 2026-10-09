import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'

/**
 * One question in the questionnaire editor (9.10.26).
 *
 * Yahav: "האופן עריכה של העמוד שאלונים לא מספיק נוח ולא מספיק אינטואיטיבי".
 * Before: a dropdown first, a small 12px textarea for the question, the
 * actions as bare arrows, "חובה" as a checkbox at the bottom. Now the
 * question itself is the biggest thing on the card, the card says what it
 * is ("שאלה 3 · בחירה מרשימה"), חובה is a toggle next to it, and the
 * actions (duplicate, up, down, drag, delete) sit together on the header.
 * Tapping a card marks it active, and the live preview jumps to it.
 *
 * The options editor and the "מתי להציג" editor stay the existing ones
 * (passed in), so their logic is untouched.
 */

type Field = { id: string; type: string; label: string; options?: string[]; required?: boolean; maxSelect?: number }

const INPUT_TYPES = new Set(['text', 'textarea', 'select', 'multiselect', 'rating', 'date'])

export default function FormFieldEditor({
  field, idx, total, questionNumber, fieldTypes, dragHandle, active, onActivate,
  onChange, onMove, onRemove, onDuplicate, optionsEditor, showIfEditor,
}: {
  field: Field
  idx: number
  total: number
  /** 1-based number among real questions; null for info/link blocks. */
  questionNumber: number | null
  fieldTypes: { value: string; label: string }[]
  dragHandle: ReactNode
  active: boolean
  onActivate: () => void
  onChange: (patch: Partial<Field> & Record<string, unknown>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onDuplicate: () => void
  optionsEditor: ReactNode
  showIfEditor: ReactNode
}) {
  const isInput = INPUT_TYPES.has(field.type)
  const iconBtn = 'p-1.5 rounded-lg transition-colors hover:bg-[#F1EBE1] disabled:opacity-25 disabled:hover:bg-transparent'

  return (
    <div
      onFocusCapture={onActivate}
      onClick={onActivate}
      className="rounded-2xl bg-white transition-shadow"
      style={{
        border: `1.5px solid ${active ? '#C8A460' : '#E9E2D6'}`,
        boxShadow: active ? '0 2px 10px rgba(200,164,96,0.18)' : 'none',
      }}
    >
      {/* Header: what it is + actions */}
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className="flex-shrink-0 rounded-full flex items-center justify-center font-bold"
          style={{ minWidth: 26, height: 26, padding: '0 6px', fontSize: 12.5, background: isInput ? '#F6ECD8' : '#EEF2F4', color: isInput ? '#6E5836' : '#35505C' }}>
          {questionNumber ?? (field.type === 'info' ? 'T' : '🔗')}
        </span>
        <select
          value={field.type}
          onChange={e => onChange({ type: e.target.value })}
          className="min-w-0 max-w-[220px] rounded-full px-3 py-1 font-semibold bg-[#F6F3ED] focus:outline-none cursor-pointer"
          style={{ fontSize: 12.5, color: '#5E4938', border: 'none' }}
          aria-label="סוג השאלה"
          title="סוג השאלה"
        >
          {fieldTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {isInput && (
          <button
            type="button"
            onClick={() => onChange({ required: !field.required })}
            className="flex-shrink-0 rounded-full font-bold transition-colors"
            style={{ fontSize: 12, padding: '4px 10px', background: field.required ? '#F5E2D8' : '#F6F3ED', color: field.required ? '#8B4A30' : '#A2937D' }}
            aria-pressed={!!field.required}
            title="האם חובה לענות"
          >
            {field.required ? '★ חובה' : '☆ לא חובה'}
          </button>
        )}
        <span className="flex-1" />
        <span className="flex items-center flex-shrink-0" style={{ color: '#A2937D' }}>
          <button type="button" onClick={onDuplicate} className={iconBtn} title="שכפול"><Copy className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => onMove(-1)} disabled={idx === 0} className={iconBtn} title="למעלה"><ChevronUp className="w-4 h-4" /></button>
          <button type="button" onClick={() => onMove(1)} disabled={idx === total - 1} className={iconBtn} title="למטה"><ChevronDown className="w-4 h-4" /></button>
          {dragHandle}
          <button type="button" onClick={onRemove} className={`${iconBtn} hover:!bg-[#F5E2D8]`} style={{ color: '#8B4A30' }} title="מחיקת השאלה"><Trash2 className="w-3.5 h-3.5" /></button>
        </span>
      </div>

      {/* Body */}
      <div className="px-3.5 pb-3.5 space-y-2.5">
        {field.type === 'link' ? (
          <>
            <input value={field.label} onChange={e => onChange({ label: e.target.value })}
              placeholder="טקסט מעל הכפתור (למשל: נא לבצע תשלום בלינק)"
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none bg-white" style={{ border: '1px solid #E9E2D6', color: '#443327' }} />
            <input value={field.options?.[0] ?? ''} onChange={e => onChange({ options: [e.target.value] })}
              placeholder="https://..." dir="ltr"
              className="w-full px-3 py-2 rounded-xl text-sm focus:outline-none bg-white" style={{ border: '1px solid #E9E2D6', color: '#443327' }} />
          </>
        ) : (
          <textarea
            data-focusid={field.id}
            value={field.label}
            onChange={e => onChange({ label: e.target.value })}
            placeholder={field.type === 'info' ? 'הטקסט שיוצג בטופס (פרטים, הנחיות, תאריכים...)' : 'מה השאלה?'}
            rows={Math.min(6, Math.max(field.type === 'info' ? 3 : 1, field.label.split('\n').length, Math.ceil(field.label.length / 60)))}
            className="w-full px-3 py-2 rounded-xl focus:outline-none bg-white resize-y leading-relaxed"
            style={{ border: '1px solid #E9E2D6', color: '#443327', fontSize: 15, fontWeight: field.type === 'info' ? 500 : 700 }}
          />
        )}

        {(field.type === 'select' || field.type === 'multiselect') && (
          <div className="rounded-xl p-2.5" style={{ background: '#FBF9F5' }}>
            <p className="font-bold mb-1.5" style={{ fontSize: 12, color: '#8A7A63' }}>אפשרויות ({field.options?.length ?? 0})</p>
            {optionsEditor}
            {field.type === 'multiselect' && (
              <label className="flex items-center gap-2 mt-2" style={{ fontSize: 12, color: '#8A7A63' }}>
                אפשר לבחור עד
                <input type="number" min={0} value={field.maxSelect ?? ''} onChange={e => onChange({ maxSelect: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="ללא הגבלה" className="w-24 px-2 py-1 rounded-lg bg-white" style={{ border: '1px solid #E9E2D6' }} />
              </label>
            )}
          </div>
        )}

        {field.type !== 'link' && showIfEditor}
      </div>
    </div>
  )
}
