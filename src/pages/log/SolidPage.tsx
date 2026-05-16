import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import ActionPageLayout from './ActionPageLayout'

type Props = {
  onBack: () => void
  onSaved?: () => void
}

const ACCENT = '#8FA968' // herb green — solids theme

export default function SolidPage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  // Per Q1 / N3: a single combined textarea (was "what did baby eat?" in
  // LogEntryModal). The user's full text lands in daily_log_entries.notes —
  // matching the legacy behavior so timeline rendering shows it identically.
  const [content, setContent] = useState('')
  const [time, setTime] = useState(() => formatTime(new Date()))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastFeeding = useLastEntry('feeding', refetchTick)

  async function handleSave() {
    if (!user || saving) return
    if (!content.trim()) {
      setSaveError('יש לתאר מה התינוק אכל')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const now = new Date()
      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(now),
          entry_time: time || formatTime(now),
          entry_type: 'feeding',
          notes: content.trim(),
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      const { error: detErr } = await supabase.from('feeding_details').insert({
        log_entry_id: entry.id,
        feeding_type: 'solid',
      })
      if (detErr) throw detErr

      setRefetchTick(t => t + 1)
      onSaved?.()
      onBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  return (
    <ActionPageLayout
      title="אוכל"
      emoji="🥄"
      accent={ACCENT}
      onBack={onBack}
      status={<span>{formatTimeSince(lastFeeding, 'טרם נרשמה האכלה')}</span>}
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
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">מה התינוק אכל?</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="למשל: אבוקדו, בננה, פירה תפוח־עץ"
            rows={4}
            autoFocus
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">שעה</label>
          <input
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
          />
        </div>
      </div>
    </ActionPageLayout>
  )
}
