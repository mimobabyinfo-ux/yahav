import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import ActionPageLayout from './ActionPageLayout'

type Props = {
  onBack: () => void
  onSaved?: () => void
}

const ACCENT = '#7A8B6A' // sage — note theme

function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NotePage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [content, setContent] = useState('')
  const [when, setWhen] = useState(() => toLocalDatetimeInput(new Date()))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleSave() {
    if (!user || saving) return
    if (!content.trim()) {
      setSaveError('יש לכתוב את הערה לפני השמירה')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const whenDate = new Date(when)
      if (Number.isNaN(whenDate.getTime())) throw new Error('שעה/תאריך לא תקינים')
      const { error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(whenDate),
          entry_time: formatTime(whenDate),
          entry_type: 'note',
          notes: content.trim(),
        })
      if (error) throw error
      onSaved?.()
      onBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  return (
    <ActionPageLayout
      title="הערה"
      emoji="📝"
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
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">הערה</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="כל דבר שתרצי לזכור…"
            rows={8}
            autoFocus
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
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
      </div>
    </ActionPageLayout>
  )
}
