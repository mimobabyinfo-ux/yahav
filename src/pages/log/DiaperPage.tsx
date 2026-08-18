import { useState, useEffect, useRef } from 'react'
import { Camera, Trash2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime, clampDateTimeToNow, todayInputValue } from '../../utils/dateUtils'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import { compressImage } from '../../utils/imageCompress'
import ActionPageLayout from './ActionPageLayout'

type Props = {
  onBack: () => void
  onSaved?: () => void
}

const ACCENT = '#B57F50' // earthy brown — diaper theme

type DiaperType = 'wet' | 'dirty' | 'both' | 'dry'

// Brenda 17.8.26: "on the diaper, instead of 'both' let me press פיפי and
// קקי together." A "both" button is the app asking her to translate what
// she saw into one of four labels; pressing the two things that happened
// is just reporting them. The stored value is unchanged — wet, dirty, both
// or dry — so every summary and chart keeps working.
export default function DiaperPage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  const [wet, setWet] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [dry, setDry] = useState(false)
  const diaperType: DiaperType | null =
    dry ? 'dry' : wet && dirty ? 'both' : wet ? 'wet' : dirty ? 'dirty' : null
  const [time, setTime] = useState(() => formatTime(new Date()))
  const [date, setDate] = useState(() => formatDate(new Date()))
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastDiaper = useLastEntry('diaper', refetchTick)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setPhoto(compressed)
    setPhotoPreview(URL.createObjectURL(compressed))
  }

  function removePhoto() {
    setPhoto(null)
    setPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  async function handleSave() {
    if (!user || saving || !diaperType) return
    setSaving(true)
    setSaveError(null)
    try {
      const now = new Date()
      // Never store a future entry, whatever the inputs allowed —
      // `max` on an input is a hint, not a guarantee. And say so rather
      // than quietly moving it: silently rewriting 23:50 to 07:00 files
      // a real event at a time it did not happen, and nothing on screen
      // would tell her.
      const chosen = { date: date || formatDate(now), time: time || formatTime(now) }
      const saved = clampDateTimeToNow(chosen.date, chosen.time)
      if (saved.date !== chosen.date || saved.time !== chosen.time) {
        setSaveError('אי אפשר לרשום ביומן תאריך או שעה שעוד לא הגיעו')
        setSaving(false)
        return
      }
      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: saved.date,
          entry_time: saved.time,
          entry_type: 'diaper',
          notes: notes.trim() || null,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      await supabase.from('diaper_details').insert({
        log_entry_id: entry.id,
        diaper_type: diaperType,
        notes: notes.trim() || null,
      })

      // Photo upload (optional). Matches the path scheme + bucket used by
      // LogEntryModal so legacy entries' photo_url still resolves.
      if (photo) {
        const childSegment = selectedChild?.id ?? user.id
        const path = `${user.id}/${childSegment}/${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('diaper-photos')
          .upload(path, photo, { contentType: 'image/jpeg' })
        if (!uploadErr) {
          await supabase.from('daily_log_entries').update({ photo_url: path }).eq('id', entry.id)
        }
      }

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
      title="חיתול"
      emoji="💩"
      accent={ACCENT}
      onBack={onBack}
      status={<span>{formatTimeSince(lastDiaper, 'טרם נרשם חיתול')}</span>}
      bottom={
        <>
          {saveError && <p className="text-xs text-red-500 text-center">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving || !diaperType}
            className="w-full font-semibold py-4 rounded-2xl text-white shadow-md transition-all disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}dd)` }}
          >
            {saving ? 'שומרת…' : !diaperType ? 'מה היה בחיתול?' : 'שמירה ✓'}
          </button>
        </>
      }
    >
      <div className="max-w-xs mx-auto space-y-5">
        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-2 text-right">מה היה בחיתול?</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { on: wet,   emoji: '💧', label: 'פיפי', toggle: () => { setWet(v => !v); setDry(false) } },
              { on: dirty, emoji: '💩', label: 'קקי',  toggle: () => { setDirty(v => !v); setDry(false) } },
            ]).map(o => (
              <button
                key={o.label}
                type="button"
                onClick={o.toggle}
                aria-pressed={o.on}
                className={`py-3 rounded-xl text-sm font-medium transition-all border-2 flex items-center justify-center gap-1.5 ${
                  o.on ? 'border-mustard-500 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-600'
                }`}
              >
                <span>{o.emoji}</span>
                <span>{o.label}</span>
                {o.on && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
          </div>
          {/* יבש is the absence of the other two, so it clears them. */}
          <button
            type="button"
            onClick={() => { setDry(v => !v); setWet(false); setDirty(false) }}
            aria-pressed={dry}
            className={`mt-2 w-full py-3 rounded-xl text-sm font-medium transition-all border-2 flex items-center justify-center gap-1.5 ${
              dry ? 'border-mustard-500 bg-mustard-50 text-mustard-700' : 'border-sand-200 text-sand-600'
            }`}
          >
            <span>☀️</span>
            <span>יבש</span>
            {dry && <Check className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Date as well as time. Brenda's earlier note about backdating a
            bottle applies here too: a nappy changed at 23:50 and logged at
            00:10 was filed on the wrong day, at the wrong end of it. */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">תאריך</label>
            <input
              type="date"
              value={date}
              max={todayInputValue()}
              onChange={e => setDate(e.target.value)}
              dir="ltr"
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">שעה</label>
            <input
              type="time"
              value={time}
              max={date === todayInputValue() ? formatTime(new Date()) : undefined}
              onChange={e => setTime(e.target.value)}
              className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
            />
          </div>
        </div>

        <div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          {photoPreview ? (
            <div className="flex items-center gap-3">
              <img src={photoPreview} alt="תצוגה מקדימה" className="w-14 h-14 rounded-xl object-cover border border-sand-200" />
              <div className="flex-1 text-right">
                <p className="text-xs text-sand-600 font-medium">תמונה נבחרה</p>
                <p className="text-[10px] text-sand-400">תישמר עם הרשומה</p>
              </div>
              <button
                onClick={removePhoto}
                className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                aria-label="הסרת תמונה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-sand-200 rounded-2xl text-sand-500 hover:border-mustard-300 hover:text-mustard-600 transition-colors text-sm"
            >
              <Camera className="w-4 h-4" />
              הוסיפי תמונה (אופציונלי)
            </button>
          )}
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
