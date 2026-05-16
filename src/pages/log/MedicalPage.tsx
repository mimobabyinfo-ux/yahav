import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import ActionPageLayout from './ActionPageLayout'

type Props = {
  onBack: () => void
  onSaved?: () => void
}

const ACCENT = '#7B6AA0' // muted purple — medical theme

type MedicalType = 'vaccination' | 'checkup' | 'illness' | 'medication' | 'other'

const TYPE_OPTIONS: { key: MedicalType; label: string; emoji: string }[] = [
  { key: 'vaccination', label: 'חיסון',          emoji: '💉' },
  { key: 'checkup',     label: 'בדיקה שגרתית',  emoji: '🩺' },
  { key: 'illness',     label: 'מחלה',           emoji: '🤒' },
  { key: 'medication',  label: 'תרופה',          emoji: '💊' },
  { key: 'other',       label: 'אחר',            emoji: '📌' },
]

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MedicalPage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [medicalType, setMedicalType] = useState<MedicalType>('vaccination')
  const [details, setDetails] = useState('')
  const [when, setWhen] = useState(() => toLocalDatetimeInput(new Date()))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    if (!user || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const whenDate = new Date(when)
      if (Number.isNaN(whenDate.getTime())) throw new Error('שעה/תאריך לא תקינים')

      // entry_type stays 'doctor_visit' (legacy) per Q2/N2.
      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(whenDate),
          entry_time: formatTime(whenDate),
          entry_type: 'doctor_visit',
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      const { error: detErr } = await supabase.from('medical_details').insert({
        log_entry_id: entry.id,
        medical_type: medicalType,
        details: details.trim() || null,
      })
      if (detErr) throw detErr

      onSaved?.()
      onBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  return (
    <ActionPageLayout
      title="רופא"
      emoji="👨‍⚕️"
      accent={ACCENT}
      onBack={onBack}
      bottom={
        <>
          {saveError && <p className="text-xs text-red-500 text-center">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full font-semibold py-4 rounded-2xl text-white shadow-md transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}dd)` }}
          >
            {saving ? 'שומרת…' : 'שמירה ✓'}
          </button>
        </>
      }
    >
      <div className="max-w-xs mx-auto space-y-5">
        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-2 text-right">סוג ביקור</label>
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMedicalType(opt.key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all border-2 flex items-center gap-1.5 ${
                  medicalType === opt.key
                    ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                    : 'border-sand-200 text-sand-600'
                }`}
              >
                <span>{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">פרטים</label>
          <input
            type="text"
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder='למשל: חיסון 2 חודשים, אקמול 2.5 מ"ל'
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-right"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">תאריך ושעה</label>
          <input
            type="datetime-local"
            value={when}
            onChange={e => setWhen(e.target.value)}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">הערות</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="הערות (אופציונלי)"
            rows={3}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
          />
        </div>
      </div>
    </ActionPageLayout>
  )
}
