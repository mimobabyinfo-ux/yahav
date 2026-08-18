import { useState, useEffect, useRef } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { useLastEntry } from '../../hooks/useLastEntry'
import { formatTimeSince } from '../../utils/timeSince'
import { compressImage } from '../../utils/imageCompress'
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
  const [date, setDate] = useState(() => formatDate(new Date()))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)
  const lastFeeding = useLastEntry('feeding', refetchTick)

  // Brenda 17.8.26: "on food there should be an option to add a photo."
  // First tastes are the thing people photograph, and until now the only
  // screen that could take a picture was the diaper one. Same bucket, same
  // per-user path scheme, same generic daily_log_entries.photo_url column.
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }
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
          entry_date: date || formatDate(now),
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

        {/* Date as well as time. Brenda's earlier note about backdating a
            bottle applies here too: a nappy changed at 23:50 and logged at
            00:10 was filed on the wrong day, at the wrong end of it. */}
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">תאריך</label>
            <input
              type="date"
              value={date}
              max={formatDate(new Date())}
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
      </div>
    </ActionPageLayout>
  )
}
