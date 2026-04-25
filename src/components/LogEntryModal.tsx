import { X } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatTime } from '../utils/dateUtils'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  entryType: EntryType
  date: string
  onClose: () => void
  onSaved: () => void
}

const TYPE_LABELS: Record<EntryType, string> = {
  feeding: 'האכלה',
  sleep: 'שינה',
  diaper: 'חיתול',
  tummy_time: 'זמן בטן',
  milestone: 'אבן דרך',
  doctor_visit: 'ביקור רופא',
  note: 'הערה',
}

export default function LogEntryModal({ entryType, date, onClose, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [saving, setSaving] = useState(false)
  const [time, setTime] = useState(formatTime(new Date()))
  const [notes, setNotes] = useState('')

  // Feeding
  const [feedingType, setFeedingType] = useState<'breast' | 'bottle' | 'solid'>('breast')
  const [breastSide, setBreastSide] = useState<'left' | 'right' | 'both'>('right')
  const [durationMins, setDurationMins] = useState('')
  const [amountMl, setAmountMl] = useState('')

  // Tummy time
  const [tummyDuration, setTummyDuration] = useState('')

  // Sleep
  const [sleepType, setSleepType] = useState<'nap' | 'night'>('nap')
  const [sleepDuration, setSleepDuration] = useState('')
  const [sleepQuality, setSleepQuality] = useState<'good' | 'fair' | 'poor'>('good')

  // Diaper
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both'>('wet')

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      const now = new Date()
      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: date,
          entry_time: time || formatTime(now),
          entry_type: entryType,
          notes: notes || null,
        })
        .select()
        .single()

      if (error || !entry) throw error

      if (entryType === 'tummy_time' && tummyDuration && !notes) {
        await supabase.from('daily_log_entries').update({
          notes: `משך: ${tummyDuration} דקות`
        }).eq('id', entry.id)
      }

      if (entryType === 'feeding') {
        await supabase.from('feeding_details').insert({
          log_entry_id: entry.id,
          feeding_type: feedingType,
          breast_side: feedingType === 'breast' ? breastSide : null,
          duration_minutes: durationMins ? parseFloat(durationMins) : null,
          amount_ml: amountMl ? parseInt(amountMl) : null,
        })
      } else if (entryType === 'sleep') {
        await supabase.from('sleep_details').insert({
          log_entry_id: entry.id,
          sleep_type: sleepType,
          duration_minutes: sleepDuration ? parseInt(sleepDuration) : null,
          quality: sleepQuality,
        })
      } else if (entryType === 'diaper') {
        await supabase.from('diaper_details').insert({
          log_entry_id: entry.id,
          diaper_type: diaperType,
          notes: notes || null,
        })
      }

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-[72px]" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl w-full max-w-[480px] shadow-2xl flex flex-col max-h-[75vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-sand-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-bold text-sand-800">הוספת {TYPE_LABELS[entryType]}</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-sand-100 text-sand-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable fields */}
        <div className="px-5 space-y-4 overflow-y-auto flex-1 pb-2">

          {/* Time */}
          <div>
            <label className="block text-xs font-semibold text-sand-600 mb-1">שעה</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
            />
          </div>

          {/* Feeding fields */}
          {entryType === 'feeding' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-2">סוג האכלה</label>
                <div className="flex gap-2">
                  {(['breast', 'bottle', 'solid'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setFeedingType(t)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                        feedingType === t
                          ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                          : 'border-sand-200 text-sand-600 hover:border-sand-300'
                      }`}
                    >
                      {t === 'breast' ? 'הנקה' : t === 'bottle' ? 'בקבוק' : 'מוצק'}
                    </button>
                  ))}
                </div>
              </div>
              {feedingType === 'breast' && (
                <div>
                  <label className="block text-xs font-semibold text-sand-600 mb-2">צד</label>
                  <BreastfeedingQuickSwitch side={breastSide} onChange={setBreastSide} />
                </div>
              )}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1">משך (דקות)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={durationMins}
                    onChange={e => setDurationMins(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
                  />
                </div>
                {feedingType !== 'breast' && (
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-sand-600 mb-1">כמות (מ"ל)</label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={amountMl}
                      onChange={e => setAmountMl(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Sleep fields */}
          {entryType === 'sleep' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-2">סוג שינה</label>
                <div className="flex gap-2">
                  {(['nap', 'night'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSleepType(t)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                        sleepType === t
                          ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                          : 'border-sand-200 text-sand-600'
                      }`}
                    >
                      {t === 'nap' ? 'שנת יום' : 'שנת לילה'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1">משך (דקות)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={sleepDuration}
                    onChange={e => setSleepDuration(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1">איכות</label>
                  <select
                    value={sleepQuality}
                    onChange={e => setSleepQuality(e.target.value as typeof sleepQuality)}
                    className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 bg-white"
                  >
                    <option value="good">טובה</option>
                    <option value="fair">בינונית</option>
                    <option value="poor">גרועה</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Diaper fields */}
          {entryType === 'diaper' && (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-2">סוג חיתול</label>
              <div className="flex gap-2">
                {(['wet', 'dirty', 'both'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setDiaperType(t)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                      diaperType === t
                        ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                        : 'border-sand-200 text-sand-600'
                    }`}
                  >
                    {t === 'wet' ? 'פיפי' : t === 'dirty' ? 'קקי' : 'שניהם'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tummy time fields */}
          {entryType === 'tummy_time' && (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">משך (דקות) — אופציונלי</label>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                value={tummyDuration}
                onChange={e => setTummyDuration(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
              />
            </div>
          )}

          {/* Notes */}
          {['milestone', 'doctor_visit', 'note', 'tummy_time'].includes(entryType) && (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">
                {entryType === 'note' ? 'הערה' : entryType === 'milestone' ? 'תיאור האבן דרך' : 'הערות'}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="כתבי כאן..."
                rows={3}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none"
              />
            </div>
          )}
        </div>

        {/* Sticky save button */}
        <div className="px-5 pb-5 pt-3 flex-shrink-0 border-t border-sand-100">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-gradient-to-r from-mustard-500 to-mustard-600 hover:from-mustard-600 hover:to-mustard-700 text-white font-semibold py-4 rounded-2xl transition-all shadow-lg disabled:opacity-50"
          >
            {saving ? 'שומרת...' : 'שמירה ✓'}
          </button>
        </div>
      </div>
    </div>
  )
}
