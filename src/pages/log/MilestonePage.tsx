import { useState, useEffect, useRef } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatDate, formatTime } from '../../utils/dateUtils'
import { compressImage } from '../../utils/imageCompress'
import { MILESTONE_CHIPS } from '../../constants/milestones'
import ActionPageLayout from './ActionPageLayout'

type Props = {
  onBack: () => void
  onSaved?: () => void
}

const ACCENT = '#D9A55C' // warm gold — milestones
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024

function toLocalDateInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function MilestonePage({ onBack, onSaved }: Props) {
  const { user, selectedChild } = useAuth()
  // Chip selection — chosen chip text becomes notes. Selecting a chip
  // clears the custom field and vice versa (so the user can't accidentally
  // submit both; whichever was last edited wins).
  const [selectedChip, setSelectedChip] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [dateStr, setDateStr] = useState(() => toLocalDateInput(new Date()))
  const [extraNotes, setExtraNotes] = useState('')
  const [media, setMedia] = useState<Blob | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const [isVideo, setIsVideo] = useState(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    }
  }, [mediaPreview])

  async function handleMediaSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const video = file.type.startsWith('video/')
    if (video) {
      if (file.size > MAX_VIDEO_BYTES) {
        setSaveError('הסרטון גדול מדי — מקסימום 50MB')
        return
      }
      setMedia(file)
      setMediaPreview(URL.createObjectURL(file))
      setIsVideo(true)
    } else {
      if (file.size > MAX_PHOTO_BYTES) {
        setSaveError('התמונה גדולה מדי — מקסימום 5MB')
        return
      }
      const compressed = await compressImage(file)
      setMedia(compressed)
      setMediaPreview(URL.createObjectURL(compressed))
      setIsVideo(false)
    }
  }

  function removeMedia() {
    setMedia(null)
    setMediaPreview(null)
    if (mediaInputRef.current) mediaInputRef.current.value = ''
  }

  async function handleSave() {
    if (!user || saving) return
    // Resolve which text becomes the milestone label. Custom takes precedence
    // over the chip — typing in custom is a stronger intent signal.
    const milestoneText = custom.trim() || selectedChip
    if (!milestoneText) {
      setSaveError('יש לבחור אבן דרך או לתאר אבן דרך מותאמת')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const whenDate = new Date(`${dateStr}T${formatTime(new Date())}`)
      // Compose notes: "<milestone>\n<extra>" so timeline shows the chip
      // line as the headline.
      const finalNotes = extraNotes.trim()
        ? `${milestoneText}\n${extraNotes.trim()}`
        : milestoneText

      const { data: entry, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: formatDate(whenDate),
          entry_time: formatTime(whenDate),
          entry_type: 'milestone',
          notes: finalNotes,
        })
        .select()
        .single()
      if (error || !entry) throw error ?? new Error('שגיאה בשמירה')

      if (media) {
        const ext = isVideo ? 'mp4' : 'jpg'
        const contentType = isVideo ? 'video/mp4' : 'image/jpeg'
        const childSegment = selectedChild?.id ?? user.id
        const path = `${user.id}/${childSegment}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('milestone-media')
          .upload(path, media, { contentType })
        if (!uploadErr) {
          await supabase.from('daily_log_entries').update({ photo_url: path }).eq('id', entry.id)
        }
      }

      onSaved?.()
      onBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'שגיאה בשמירה')
      setSaving(false)
    }
  }

  return (
    <ActionPageLayout
      title="אבן דרך"
      emoji="🎯"
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
          <label className="block text-xs font-semibold text-sand-600 mb-2 text-right">בחרי אבן דרך</label>
          <div className="flex flex-wrap gap-2">
            {MILESTONE_CHIPS.map(chip => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setSelectedChip(c => (c === chip ? null : chip))
                  setCustom('') // selecting a chip clears the custom field
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedChip === chip
                    ? 'bg-mustard-500 border-mustard-500 text-white'
                    : 'bg-sand-50 border-sand-200 text-sand-700 hover:border-mustard-300'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">או אבן דרך מותאמת</label>
          <input
            type="text"
            value={custom}
            onChange={e => {
              setCustom(e.target.value)
              if (e.target.value.trim()) setSelectedChip(null) // custom wins
            }}
            placeholder="תיאור חופשי…"
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-right"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">תאריך</label>
          <input
            type="date"
            value={dateStr}
            onChange={e => setDateStr(e.target.value)}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 text-sand-800"
          />
        </div>

        <div>
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={handleMediaSelect}
          />
          {mediaPreview ? (
            <div className="flex items-center gap-3">
              {isVideo ? (
                <video src={mediaPreview} className="w-14 h-14 rounded-xl object-cover border border-sand-200" muted playsInline />
              ) : (
                <img src={mediaPreview} alt="תצוגה מקדימה" className="w-14 h-14 rounded-xl object-cover border border-sand-200" />
              )}
              <div className="flex-1 text-right">
                <p className="text-xs text-sand-600 font-medium">{isVideo ? 'סרטון נבחר' : 'תמונה נבחרה'}</p>
                <p className="text-[10px] text-sand-400">תישמר עם הרשומה</p>
              </div>
              <button onClick={removeMedia} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg" aria-label="הסרת מדיה">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mediaInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-sand-200 rounded-2xl text-sand-500 hover:border-mustard-300 hover:text-mustard-600 transition-colors text-sm"
            >
              <Camera className="w-4 h-4" />
              הוסיפי תמונה או סרטון (אופציונלי)
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-sand-600 mb-1.5 text-right">הערות נוספות</label>
          <textarea
            value={extraNotes}
            onChange={e => setExtraNotes(e.target.value)}
            placeholder="הערות (אופציונלי)"
            rows={3}
            className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500 resize-none text-right"
          />
        </div>
      </div>
    </ActionPageLayout>
  )
}
