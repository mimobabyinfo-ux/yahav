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

const ACCENT = '#D9B978' // warm yellow — bottle feeding

type MilkType = 'pumped' | 'formula'

export default function BottlePage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [amount, setAmount] = useState('')
  const [milkType, setMilkType] = useState<MilkType>('formula')
  const [time, setTime] = useState(() => formatTime(new Date()))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastFeeding = useLastEntry('feeding', refetchTick)

  async function handleSave() {
    if (!user || saving) return
    const ml = parseInt(amount, 10)
    if (!Number.isFinite(ml) || ml <= 0) {
      setSaveError('יש להזין כמות בקבוק (במ"ל)')
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
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      const { error: detErr } = await supabase.from('feeding_details').insert({
        log_entry_id: entry.id,
        feeding_type: 'bottle',
        amount_ml: ml,
        milk_type: milkType,
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
      title="בקבוק"
      emoji="🍼"
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
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">כמות (מ"ל)</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-4 py-4 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-2xl font-semibold text-center"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-2 text-right">סוג</label>
          <div className="flex gap-2">
            {(['pumped', 'formula'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setMilkType(t)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                  milkType === t
                    ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                    : 'border-sand-200 text-sand-600'
                }`}
              >
                {t === 'pumped' ? 'חלב אם שאוב' : 'תמ"ל'}
              </button>
            ))}
          </div>
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
