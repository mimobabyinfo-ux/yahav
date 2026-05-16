import { X, Camera, Trash2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatTime } from '../utils/dateUtils'
import { MILESTONE_CHIPS } from '../constants/milestones'
import { sleepTypeFromStartTime } from '../utils/sleepTypeFromTime'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'

async function compressImage(file: File): Promise<Blob> {
  return new Promise(resolve => {
    const img = new Image()
    const reader = new FileReader()
    reader.onload = e => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        const maxDim = 1200
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (blob && blob.size > 512 * 1024) {
            canvas.toBlob(b => resolve(b ?? blob), 'image/jpeg', 0.6)
          } else {
            resolve(blob ?? new Blob())
          }
        }, 'image/jpeg', 0.82)
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

type EntryType = 'feeding' | 'sleep' | 'diaper' | 'tummy_time' | 'milestone' | 'doctor_visit' | 'note'

type Props = {
  entryType: EntryType
  date: string
  onClose: () => void
  onSaved: () => void
  // When set, the feeding type-picker is hidden and the form opens directly
  // in that mode. Used by FeedingTypePicker → bottle / solid / breast (past).
  presetFeedingType?: 'breast' | 'bottle' | 'solid'
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

export default function LogEntryModal({ entryType, date, onClose, onSaved, presetFeedingType }: Props) {
  const { user, selectedChild } = useAuth()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [time, setTime] = useState(formatTime(new Date()))
  const [notes, setNotes] = useState('')

  // Feeding
  const [feedingType, setFeedingType] = useState<'breast' | 'bottle' | 'solid'>(presetFeedingType ?? 'breast')
  const [breastSide, setBreastSide] = useState<'left' | 'right' | 'both'>('right')
  const [durationMins, setDurationMins] = useState('')
  const [amountMl, setAmountMl] = useState('')

  // Tummy time
  const [tummyDuration, setTummyDuration] = useState('')

  // Sleep — manual entry uses start/end time pair (more intuitive than minutes
  // when logging retroactively). duration_minutes is computed at save time.
  // sleep_type is auto-derived from the start time (silent rule, no toggle).
  const [sleepEndTime, setSleepEndTime] = useState('')
  const [sleepQuality, setSleepQuality] = useState<'good' | 'fair' | 'poor'>('good')

  function computeSleepDurationMins(): number | null {
    if (!time || !sleepEndTime) return null
    const [sh, sm] = time.split(':').map(Number)
    const [eh, em] = sleepEndTime.split(':').map(Number)
    if ([sh, sm, eh, em].some(n => isNaN(n))) return null
    const startMin = sh * 60 + sm
    const endMin = eh * 60 + em
    // Wrap past midnight: 23:00 → 07:00 = 8h
    return ((endMin - startMin) + 1440) % 1440
  }

  // Diaper
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both'>('wet')
  const [diaperPhoto, setDiaperPhoto] = useState<Blob | null>(null)
  const [diaperPhotoPreview, setDiaperPhotoPreview] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Milestone
  const [milestoneMedia, setMilestoneMedia] = useState<Blob | null>(null)
  const [milestoneMediaPreview, setMilestoneMediaPreview] = useState<string | null>(null)
  const [milestoneIsVideo, setMilestoneIsVideo] = useState(false)
  const milestoneMediaInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (diaperPhotoPreview) URL.revokeObjectURL(diaperPhotoPreview)
      if (milestoneMediaPreview) URL.revokeObjectURL(milestoneMediaPreview)
    }
  }, [diaperPhotoPreview, milestoneMediaPreview])

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setDiaperPhoto(compressed)
    setDiaperPhotoPreview(URL.createObjectURL(compressed))
  }

  function removePhoto() {
    setDiaperPhoto(null)
    setDiaperPhotoPreview(null)
    if (photoInputRef.current) photoInputRef.current.value = ''
  }

  async function handleMilestoneMediaSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    if (isVideo) {
      if (file.size > 50 * 1024 * 1024) { setSaveError('הסרטון גדול מדי — מקסימום 50MB'); return }
      setMilestoneMedia(file)
      setMilestoneMediaPreview(URL.createObjectURL(file))
      setMilestoneIsVideo(true)
    } else {
      if (file.size > 5 * 1024 * 1024) { setSaveError('התמונה גדולה מדי — מקסימום 5MB'); return }
      const compressed = await compressImage(file)
      setMilestoneMedia(compressed)
      setMilestoneMediaPreview(URL.createObjectURL(compressed))
      setMilestoneIsVideo(false)
    }
  }

  function removeMilestoneMedia() {
    setMilestoneMedia(null)
    setMilestoneMediaPreview(null)
    if (milestoneMediaInputRef.current) milestoneMediaInputRef.current.value = ''
  }

  async function handleSave(e?: React.MouseEvent) {
    // Defensive: block bubbling/default in case anything wraps this in a form-like context.
    if (e) { e.preventDefault(); e.stopPropagation() }
    if (!user || savingRef.current) return
    savingRef.current = true
    // Immediately disable the button at DOM level — belt-and-suspenders against ghost clicks.
    if (saveButtonRef.current) saveButtonRef.current.disabled = true
    setSaving(true)
    setSaveError(null)
    try {
      const now = new Date()
      // For tummy_time, merge duration into the notes field on INSERT.
      let finalNotes = notes || null
      if (entryType === 'tummy_time' && tummyDuration) {
        finalNotes = notes
          ? `משך: ${tummyDuration} דקות — ${notes}`
          : `משך: ${tummyDuration} דקות`
      }
      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: date,
          entry_time: time || formatTime(now),
          entry_type: entryType,
          notes: finalNotes,
        })
        .select()
        .single()

      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      if (entryType === 'feeding') {
        await supabase.from('feeding_details').insert({
          log_entry_id: entry.id,
          feeding_type: feedingType,
          breast_side: feedingType === 'breast' ? breastSide : null,
          duration_minutes: durationMins ? parseFloat(durationMins) : null,
          amount_ml: amountMl ? parseInt(amountMl) : null,
        })
      } else if (entryType === 'sleep') {
        // sleep_type derived from the start time on the entry's date.
        // `date` is YYYY-MM-DD and `time` is HH:MM — combined into a
        // local Date so the hour reflects the user's input. Invalid
        // inputs (empty time) fall through to 'nap' inside the util.
        const startDate = new Date(`${date}T${time || '00:00'}:00`)
        await supabase.from('sleep_details').insert({
          log_entry_id: entry.id,
          sleep_type: sleepTypeFromStartTime(startDate),
          duration_minutes: computeSleepDurationMins(),
          quality: sleepQuality,
        })
      } else if (entryType === 'diaper') {
        await supabase.from('diaper_details').insert({
          log_entry_id: entry.id,
          diaper_type: diaperType,
          notes: notes || null,
        })
        if (diaperPhoto) {
          const childSegment = selectedChild?.id ?? user.id
          const ext = 'jpg'
          const path = `${user.id}/${childSegment}/${Date.now()}.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('diaper-photos')
            .upload(path, diaperPhoto, { contentType: 'image/jpeg' })
          if (!uploadErr) {
            await supabase.from('daily_log_entries').update({ photo_url: path }).eq('id', entry.id)
          }
        }
      } else if (entryType === 'milestone' && milestoneMedia) {
        const ext = milestoneIsVideo ? 'mp4' : 'jpg'
        const contentType = milestoneIsVideo ? 'video/mp4' : 'image/jpeg'
        const childSegment = selectedChild?.id ?? user.id
        const path = `${user.id}/${childSegment}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('milestone-media')
          .upload(path, milestoneMedia, { contentType })
        if (!uploadErr) {
          await supabase.from('daily_log_entries').update({ photo_url: path }).eq('id', entry.id)
        }
      }

      onSaved()
      onClose()
      // Intentionally do NOT reset savingRef here — modal is unmounting.
      // Resetting before React unmounts opens a window where a delayed
      // mobile "ghost click" (~300ms after touchstart) can re-enter handleSave.
    } catch (err) {
      setSaving(false)
      savingRef.current = false
      if (saveButtonRef.current) saveButtonRef.current.disabled = false
      const msg = err instanceof Error ? err.message : 'שגיאה בשמירה — נסי שנית'
      setSaveError(msg)
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

          {/* Time — sleep renders its own start/end pair below, so hide
              the generic single-time input there to avoid duplication. */}
          {entryType !== 'sleep' && (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">שעה</label>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
              />
            </div>
          )}

          {/* Feeding fields */}
          {entryType === 'feeding' && (
            <>
              {/* Hide the type picker when caller preset the type — the choice
                  was made via FeedingTypePicker before the modal opened. */}
              {!presetFeedingType && (
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
              )}
              {feedingType === 'breast' && (
                <div>
                  <label className="block text-xs font-semibold text-sand-600 mb-2">צד</label>
                  <BreastfeedingQuickSwitch side={breastSide} onChange={setBreastSide} />
                </div>
              )}
              {feedingType !== 'solid' && (
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
                  {feedingType === 'bottle' && (
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
              )}
              {feedingType === 'solid' && (
                <div>
                  <label className="block text-xs font-semibold text-sand-600 mb-1">מה התינוק אכל?</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="מה התינוק אכל? למשל: אבוקדו וקרוטוס"
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none"
                  />
                </div>
              )}
            </>
          )}

          {/* Sleep fields */}
          {entryType === 'sleep' && (
            <>
              {/* Start / end times — easier than computing minutes when logging
                  retroactively. Wraps past midnight automatically on save. */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1">התחלה</label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-sand-600 mb-1">סיום</label>
                  <input
                    type="time"
                    value={sleepEndTime}
                    onChange={e => setSleepEndTime(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
                  />
                </div>
              </div>
              {(() => {
                const mins = computeSleepDurationMins()
                if (mins === null) return null
                return (
                  <p className="text-xs text-sand-500 -mt-2">
                    משך: {mins < 60
                      ? `${mins} דק'`
                      : `${Math.floor(mins / 60)}ש${mins % 60 ? ` ${mins % 60}דק'` : ''}`}
                  </p>
                )
              })()}
              {/* Sleep type (nap / night) is auto-derived from the start
                  time at save — silent rule, no UI toggle. */}
              <div>
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
            </>
          )}

          {/* Diaper fields */}
          {entryType === 'diaper' && (
            <div className="space-y-3">
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

              {/* Photo upload */}
              <div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
                {diaperPhotoPreview ? (
                  <div className="flex items-center gap-3">
                    <img src={diaperPhotoPreview} alt="תצוגה מקדימה" className="w-14 h-14 rounded-xl object-cover border border-sand-200" />
                    <div className="flex-1">
                      <p className="text-xs text-sand-600 font-medium">תמונה נבחרה</p>
                      <p className="text-[10px] text-sand-400">תישמר עם הרשומה</p>
                    </div>
                    <button
                      onClick={removePhoto}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                    הוסף תמונה (אופציונלי)
                  </button>
                )}
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

          {/* Milestone: chip suggestions + media upload */}
          {entryType === 'milestone' && (
            <div className="space-y-3">
              {/* Suggested milestone chips */}
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-2">בחרי אבן דרך</label>
                <div className="flex flex-wrap gap-2">
                  {MILESTONE_CHIPS.map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setNotes(n => n === chip ? '' : chip)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        notes === chip
                          ? 'bg-mustard-500 border-mustard-500 text-white'
                          : 'bg-sand-50 border-sand-200 text-sand-700 hover:border-mustard-300'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Media upload */}
              <div>
                <input
                  ref={milestoneMediaInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={handleMilestoneMediaSelect}
                />
                {milestoneMediaPreview ? (
                  <div className="flex items-center gap-3">
                    {milestoneIsVideo ? (
                      <video src={milestoneMediaPreview} className="w-14 h-14 rounded-xl object-cover border border-sand-200" muted playsInline />
                    ) : (
                      <img src={milestoneMediaPreview} alt="תצוגה מקדימה" className="w-14 h-14 rounded-xl object-cover border border-sand-200" />
                    )}
                    <div className="flex-1">
                      <p className="text-xs text-sand-600 font-medium">{milestoneIsVideo ? 'סרטון נבחר' : 'תמונה נבחרה'}</p>
                      <p className="text-[10px] text-sand-400">תישמר עם הרשומה</p>
                    </div>
                    <button onClick={removeMilestoneMedia} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => milestoneMediaInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-sand-200 rounded-2xl text-sand-500 hover:border-mustard-300 hover:text-mustard-600 transition-colors text-sm"
                  >
                    <Camera className="w-4 h-4" />
                    הוסיפי תמונה או סרטון (אופציונלי)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Notes — generic notes box for these types. Solid feeding uses
              its own labelled "what did baby eat?" textarea above. */}
          {(['milestone', 'doctor_visit', 'note', 'tummy_time'].includes(entryType) ||
            (entryType === 'feeding' && feedingType === 'bottle')) && (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">
                {entryType === 'note' ? 'הערה' :
                 entryType === 'milestone' ? 'אם בא לך לכתוב משהו' :
                 entryType === 'feeding' ? 'הערות (אופציונלי)' :
                 'הערות'}
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
        <div className="px-5 pb-5 pt-3 flex-shrink-0 border-t border-sand-100 space-y-2">
          {saveError && (
            <p className="text-xs text-red-500 text-center">{saveError}</p>
          )}
          <button
            ref={saveButtonRef}
            type="button"
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
