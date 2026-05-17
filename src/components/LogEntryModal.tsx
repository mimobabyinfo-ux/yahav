import { X, Camera, Trash2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyLogEntryWithDetails, SleepDetail, FeedingDetail, DiaperDetail } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatTime } from '../utils/dateUtils'
import { MILESTONE_CHIPS } from '../constants/milestones'
import { sleepTypeFromStartTime } from '../utils/sleepTypeFromTime'
import BreastfeedingQuickSwitch from './BreastfeedingQuickSwitch'

// PostgREST returns 1:1 detail joins as arrays at runtime. Match the
// firstOf pattern used by DashboardPanel + DailyTimeline.
function firstOf<T>(v: T[] | T | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

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
  // Phase 3 / C3 edit mode: when set, the modal opens prefilled and saves
  // via UPDATE rather than INSERT. The entry's own entry_type / entry_date
  // take precedence over the entryType/date props. Edit is enabled in the
  // timeline only for sleep / tummy_time / note / doctor_visit — other
  // types have data shapes (per-side seconds, photo uploads, milestone
  // chips) that this modal can't faithfully round-trip yet.
  entry?: DailyLogEntryWithDetails
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

export default function LogEntryModal({ entryType, date, onClose, onSaved, presetFeedingType, entry }: Props) {
  const { user, selectedChild } = useAuth()
  const isEdit = !!entry
  // Use the entry's own type/date when editing — falls back to the props
  // (which are still required for the create path).
  const effectiveEntryType = (entry?.entry_type ?? entryType) as EntryType
  const effectiveDate = entry?.entry_date ?? date

  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const saveButtonRef = useRef<HTMLButtonElement>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Prefill state from the entry on mount (lazy initializer). Each block
  // covers one entry_type — fields that don't apply stay at their defaults.

  const [time, setTime] = useState(() =>
    entry?.entry_time ? entry.entry_time.slice(0, 5) : formatTime(new Date()),
  )

  const [notes, setNotes] = useState(() => {
    if (!entry?.notes) return ''
    // Tummy entries encode duration as a "משך: N דקות —" prefix on notes.
    // Strip it so the textarea shows just the user-typed part; the
    // tummyDuration state below holds the parsed number.
    if (entry.entry_type === 'tummy_time') {
      return entry.notes.replace(/^משך:\s*\d+(?:\.\d+)?\s*דקות(?:\s*—\s*)?/, '')
    }
    return entry.notes
  })

  // Feeding — prefilled from entry in edit mode (C7 unlocks feeding edit).
  // For breast entries that carry per-side seconds (created by
  // BreastfeedingPage in Phase 2), we render a 2-input L/R form instead
  // of the legacy single duration_minutes input. usesBreastPerSide
  // captures which branch we're in.
  const [feedingType, setFeedingType] = useState<'breast' | 'bottle' | 'solid'>(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.feeding_type === 'breast' || fd?.feeding_type === 'bottle' || fd?.feeding_type === 'solid') return fd.feeding_type
    }
    return presetFeedingType ?? 'breast'
  })
  const [breastSide, setBreastSide] = useState<'left' | 'right' | 'both'>(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.breast_side === 'left' || fd?.breast_side === 'right' || fd?.breast_side === 'both') return fd.breast_side
    }
    return 'right'
  })
  const [durationMins, setDurationMins] = useState(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.duration_minutes != null) return String(fd.duration_minutes)
    }
    return ''
  })
  const [amountMl, setAmountMl] = useState(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.amount_ml != null) return String(fd.amount_ml)
    }
    return ''
  })
  const [milkType, setMilkType] = useState<'pumped' | 'formula' | null>(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.milk_type === 'pumped' || fd?.milk_type === 'formula') return fd.milk_type
    }
    return null
  })
  // Per-side breast inputs — only used when the entry being edited has
  // per-side seconds populated. Default to empty for create flow.
  const [leftMins, setLeftMins] = useState(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.left_duration_seconds != null && fd.left_duration_seconds > 0) {
        return String(Math.round(fd.left_duration_seconds / 60 * 10) / 10)
      }
    }
    return ''
  })
  const [rightMins, setRightMins] = useState(() => {
    if (entry?.entry_type === 'feeding') {
      const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
      if (fd?.right_duration_seconds != null && fd.right_duration_seconds > 0) {
        return String(Math.round(fd.right_duration_seconds / 60 * 10) / 10)
      }
    }
    return ''
  })
  // True only when editing a breast entry that ALREADY has per-side
  // data. The 2-input L/R form preserves that structured data; the
  // legacy single-input form is used for everything else.
  const usesBreastPerSide = (() => {
    if (!entry || entry.entry_type !== 'feeding') return false
    const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
    if (fd?.feeding_type !== 'breast') return false
    return (fd.left_duration_seconds ?? 0) > 0 || (fd.right_duration_seconds ?? 0) > 0
  })()

  // Tummy time — duration parsed out of notes for edit mode.
  const [tummyDuration, setTummyDuration] = useState(() => {
    if (entry?.entry_type === 'tummy_time' && entry.notes) {
      const m = entry.notes.match(/^משך:\s*(\d+(?:\.\d+)?)\s*דקות/)
      if (m) return m[1]
    }
    return ''
  })

  // Sleep — manual entry uses start/end time pair (more intuitive than minutes
  // when logging retroactively). duration_minutes is computed at save time.
  // sleep_type is auto-derived from the start time (silent rule, no toggle).
  const [sleepEndTime, setSleepEndTime] = useState(() => {
    if (entry?.entry_type !== 'sleep') return ''
    const sd = firstOf<SleepDetail>(entry.sleep_details as SleepDetail | SleepDetail[] | null)
    if (sd?.duration_minutes == null || !entry.entry_time) return ''
    const [sh, sm] = entry.entry_time.slice(0, 5).split(':').map(Number)
    const totalMin = ((sh * 60 + sm) + Math.round(sd.duration_minutes)) % 1440
    const eh = Math.floor(totalMin / 60)
    const em = totalMin % 60
    return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  })
  const [sleepQuality, setSleepQuality] = useState<'good' | 'fair' | 'poor'>(() => {
    if (entry?.entry_type === 'sleep') {
      const sd = firstOf<SleepDetail>(entry.sleep_details as SleepDetail | SleepDetail[] | null)
      if (sd?.quality === 'good' || sd?.quality === 'fair' || sd?.quality === 'poor') return sd.quality
    }
    return 'good'
  })

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

  // Diaper — 'dry' added in C3 (Phase 2 migration 20260601130000) and
  // surfaced in the dedicated DiaperPage. Edit mode in C7 needs to
  // round-trip it too.
  const [diaperType, setDiaperType] = useState<'wet' | 'dirty' | 'both' | 'dry'>(() => {
    if (entry?.entry_type === 'diaper') {
      const dd = firstOf<DiaperDetail>(entry.diaper_details as DiaperDetail | DiaperDetail[] | null)
      if (dd?.diaper_type === 'wet' || dd?.diaper_type === 'dirty' || dd?.diaper_type === 'both' || dd?.diaper_type === 'dry') return dd.diaper_type
    }
    return 'wet'
  })
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

  // Delete the entry currently being edited. Cascades to detail rows
  // via ON DELETE CASCADE on the FK. Confirms via native confirm — same
  // pattern as the dedicated action pages.
  async function handleDelete() {
    if (!entry || savingRef.current) return
    if (!window.confirm('למחוק את הרשומה? לא ניתן לשחזר.')) return
    savingRef.current = true
    if (saveButtonRef.current) saveButtonRef.current.disabled = true
    setSaving(true)
    setSaveError(null)
    try {
      const { error } = await supabase.from('daily_log_entries').delete().eq('id', entry.id)
      if (error) throw error
      onSaved()
      onClose()
    } catch (err) {
      setSaving(false)
      savingRef.current = false
      if (saveButtonRef.current) saveButtonRef.current.disabled = false
      setSaveError(err instanceof Error ? err.message : 'שגיאה במחיקה')
    }
  }

  // Build the final notes string. Tummy-time entries fold the duration
  // into notes as "משך: N דקות —" prefix (legacy contract that the
  // timeline + summary parse back out).
  function composeNotes(): string | null {
    if (effectiveEntryType !== 'tummy_time') return notes || null
    if (!tummyDuration) return notes || null
    return notes
      ? `משך: ${tummyDuration} דקות — ${notes}`
      : `משך: ${tummyDuration} דקות`
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
      const finalNotes = composeNotes()
      const entryTimeValue = time || formatTime(now)

      if (isEdit && entry) {
        // ── EDIT: UPDATE daily_log_entries + the relevant detail row ──
        const { error } = await supabase
          .from('daily_log_entries')
          .update({
            entry_time: entryTimeValue,
            notes: finalNotes,
          })
          .eq('id', entry.id)
        if (error) throw error

        if (effectiveEntryType === 'sleep') {
          const sd = firstOf<SleepDetail>(entry.sleep_details as SleepDetail | SleepDetail[] | null)
          const startDate = new Date(`${effectiveDate}T${entryTimeValue}:00`)
          const sleepPayload = {
            sleep_type: sleepTypeFromStartTime(startDate),
            duration_minutes: computeSleepDurationMins(),
            quality: sleepQuality,
          }
          if (sd) {
            await supabase.from('sleep_details').update(sleepPayload).eq('id', sd.id)
          } else {
            // Defensive: insert if a sleep entry somehow lacks its detail row.
            await supabase.from('sleep_details').insert({ log_entry_id: entry.id, ...sleepPayload })
          }
        } else if (effectiveEntryType === 'feeding') {
          // C7: unlock feeding edit (breast/bottle/solid). Per-side
          // breast entries from Phase 2 round-trip through the L/R
          // input pair below; legacy single-duration entries fall
          // through to the standard payload.
          const fd = firstOf<FeedingDetail>(entry.feeding_details as FeedingDetail | FeedingDetail[] | null)
          const payload: Record<string, unknown> = {
            feeding_type: feedingType,
            breast_side: feedingType === 'breast' ? breastSide : null,
            duration_minutes: durationMins ? parseFloat(durationMins) : null,
            amount_ml: feedingType === 'bottle' && amountMl ? parseInt(amountMl) : null,
            milk_type: feedingType === 'bottle' ? milkType : null,
          }
          // Per-side branch: when the user is editing a breast entry
          // that already carried per-side seconds, save back to those
          // columns AND recompute the legacy duration_minutes +
          // breast_side aggregates so older readers still work.
          if (usesBreastPerSide && feedingType === 'breast') {
            const lMins = parseFloat(leftMins) || 0
            const rMins = parseFloat(rightMins) || 0
            payload.left_duration_seconds = Math.round(lMins * 60)
            payload.right_duration_seconds = Math.round(rMins * 60)
            payload.duration_minutes = parseFloat((lMins + rMins).toFixed(2))
            payload.breast_side =
              lMins > 0 && rMins > 0 ? 'both' :
              lMins > 0 ? 'left' :
              rMins > 0 ? 'right' : null
          } else if (feedingType !== 'breast') {
            // Non-breast feeds shouldn't carry per-side data. Null
            // them out so a feeding-type switch (breast → bottle)
            // doesn't leave stale per-side values.
            payload.left_duration_seconds = null
            payload.right_duration_seconds = null
          }
          if (fd) {
            await supabase.from('feeding_details').update(payload).eq('id', fd.id)
          } else {
            await supabase.from('feeding_details').insert({ log_entry_id: entry.id, ...payload })
          }
        } else if (effectiveEntryType === 'diaper') {
          const dd = firstOf<DiaperDetail>(entry.diaper_details as DiaperDetail | DiaperDetail[] | null)
          const diaperPayload = {
            diaper_type: diaperType,
            notes: notes || null,
          }
          if (dd) {
            await supabase.from('diaper_details').update(diaperPayload).eq('id', dd.id)
          } else {
            await supabase.from('diaper_details').insert({ log_entry_id: entry.id, ...diaperPayload })
          }
          // Photo intentionally NOT edited in v1 — existing diaper photo
          // preserved as-is (the daily_log_entries.photo_url field is
          // not touched by this UPDATE).
        }
        // tummy_time + note + doctor_visit + milestone: no detail
        // update needed beyond the daily_log_entries.notes UPDATE
        // already done above. Tummy duration lives in notes; milestone
        // chip/custom + extra also live in notes; medical_details is
        // intentionally not edited from this modal.

        onSaved()
        onClose()
        return
      }

      // ── CREATE: INSERT daily_log_entries + the relevant detail row ──
      const { data: created, error } = await supabase
        .from('daily_log_entries')
        .insert({
          user_id: user.id,
          child_id: selectedChild?.id ?? null,
          entry_date: effectiveDate,
          entry_time: entryTimeValue,
          entry_type: effectiveEntryType,
          notes: finalNotes,
        })
        .select()
        .single()

      if (error || !created) throw error ?? new Error('שגיאה בשמירה')

      if (effectiveEntryType === 'feeding') {
        await supabase.from('feeding_details').insert({
          log_entry_id: created.id,
          feeding_type: feedingType,
          breast_side: feedingType === 'breast' ? breastSide : null,
          duration_minutes: durationMins ? parseFloat(durationMins) : null,
          amount_ml: amountMl ? parseInt(amountMl) : null,
        })
      } else if (effectiveEntryType === 'sleep') {
        // sleep_type derived from the start time on the entry's date.
        // Combined into a local Date so the hour reflects the user's input.
        const startDate = new Date(`${effectiveDate}T${time || '00:00'}:00`)
        await supabase.from('sleep_details').insert({
          log_entry_id: created.id,
          sleep_type: sleepTypeFromStartTime(startDate),
          duration_minutes: computeSleepDurationMins(),
          quality: sleepQuality,
        })
      } else if (effectiveEntryType === 'diaper') {
        await supabase.from('diaper_details').insert({
          log_entry_id: created.id,
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
            await supabase.from('daily_log_entries').update({ photo_url: path }).eq('id', created.id)
          }
        }
      } else if (effectiveEntryType === 'milestone' && milestoneMedia) {
        const ext = milestoneIsVideo ? 'mp4' : 'jpg'
        const contentType = milestoneIsVideo ? 'video/mp4' : 'image/jpeg'
        const childSegment = selectedChild?.id ?? user.id
        const path = `${user.id}/${childSegment}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('milestone-media')
          .upload(path, milestoneMedia, { contentType })
        if (!uploadErr) {
          await supabase.from('daily_log_entries').update({ photo_url: path }).eq('id', created.id)
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
          <h2 className="text-lg font-bold text-sand-800">{isEdit ? 'עריכת' : 'הוספת'} {TYPE_LABELS[effectiveEntryType]}</h2>
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
          {effectiveEntryType === 'feeding' && (
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
              {/* Breast with per-side data (Phase 2 BreastfeedingPage entries):
                  L/R 2-input form preserves the structured per-side seconds.
                  Legacy single-duration entries fall through to the single
                  input below. */}
              {feedingType === 'breast' && usesBreastPerSide && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-sand-600 mb-1">שמאל (דקות)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={leftMins}
                      onChange={e => setLeftMins(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-sand-600 mb-1">ימין (דקות)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={rightMins}
                      onChange={e => setRightMins(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-sand-200 rounded-2xl focus:outline-none focus:border-mustard-500"
                    />
                  </div>
                </div>
              )}
              {feedingType === 'breast' && !usesBreastPerSide && (
                <div>
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
              )}
              {feedingType === 'bottle' && (
                <>
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
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-sand-600 mb-2">סוג חלב</label>
                    <div className="flex gap-2">
                      {([['pumped', 'חלב אם שאוב'], ['formula', 'תמ"ל']] as const).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setMilkType(milkType === k ? null : k)}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                            milkType === k
                              ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                              : 'border-sand-200 text-sand-600 hover:border-sand-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
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
          {effectiveEntryType === 'sleep' && (
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
          {effectiveEntryType === 'diaper' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-sand-600 mb-2">סוג חיתול</label>
                {/* 2x2 grid — DiaperPage uses the same layout for its 4
                    types so the 480px width stays readable. */}
                <div className="grid grid-cols-2 gap-2">
                  {(['wet', 'dirty', 'both', 'dry'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setDiaperType(t)}
                      className={`py-2 rounded-xl text-sm font-medium transition-all border-2 ${
                        diaperType === t
                          ? 'border-mustard-500 bg-mustard-50 text-mustard-700'
                          : 'border-sand-200 text-sand-600'
                      }`}
                    >
                      {t === 'wet' ? 'פיפי' : t === 'dirty' ? 'קקי' : t === 'both' ? 'שניהם' : 'יבש'}
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
          {effectiveEntryType === 'tummy_time' && (
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
          {effectiveEntryType === 'milestone' && (
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
          {(['milestone', 'doctor_visit', 'note', 'tummy_time'].includes(effectiveEntryType) ||
            (effectiveEntryType === 'feeding' && feedingType === 'bottle')) && (
            <div>
              <label className="block text-xs font-semibold text-sand-600 mb-1">
                {effectiveEntryType === 'note' ? 'הערה' :
                 effectiveEntryType === 'milestone' ? 'אם בא לך לכתוב משהו' :
                 effectiveEntryType === 'feeding' ? 'הערות (אופציונלי)' :
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

        {/* Sticky save button (+ delete link in edit mode) */}
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
            {saving ? 'שומרת...' : isEdit ? 'עדכון ✓' : 'שמירה ✓'}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="block mx-auto text-xs text-sand-400 hover:text-red-500 underline underline-offset-2 transition-colors pt-1"
            >
              מחיקת רשומה
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
