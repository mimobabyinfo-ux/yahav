import { useState } from 'react'
import { Pencil, Trash2, Baby, Milk, Utensils, Moon, Droplets, Shapes, Stethoscope, Star, StickyNote, type LucideIcon } from 'lucide-react'
import type { DailyLogEntryWithDetails } from '../lib/supabase'
import { entryTypeLabel, formatDuration } from '../utils/dateUtils'
import { supabase } from '../lib/supabase'
import DiaperPhotoThumbnail from './DiaperPhotoThumbnail'

// Phase 3 / C7: tap-to-edit is wired for every standard log type. Feeding
// (incl. per-side breast), diaper (with 'dry'), and milestone joined in C7
// — LogEntryModal now round-trips their data. Photos/videos on diaper +
// milestone entries are preserved as-is; the modal doesn't expose a
// re-upload UI yet (deferred — out of scope for v1 edit).
const EDITABLE_TYPES: ReadonlySet<string> = new Set([
  'sleep', 'tummy_time', 'note', 'doctor_visit', 'feeding', 'diaper', 'milestone',
])

type Props = {
  entries: DailyLogEntryWithDetails[]
  onRefresh: () => void
  /** Tap-to-edit dispatch. Fires only for entry types in EDITABLE_TYPES. */
  onEditEntry?: (entry: DailyLogEntryWithDetails) => void
  /** When true, suppress the "ציר זמן" section header. ListView sets this
   *  because each date group already carries its own date header above. */
  hideHeading?: boolean
}

// Color scheme per entry type. Used by DailyTimeline, DailySummary, and the
// JournalPage week/month legends — those iterate this object, so feeding
// subtypes (breast/bottle/solid) live in FEEDING_SUBTYPE_COLORS below
// instead of polluting this map.
export const ENTRY_COLORS: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  // Mimo brand palette mapping — amarillo=feeding, celeste=sleep,
  // arena=diaper, musgo=tummy, rojo tierra=medical, rosa polvo=milestone.
  feeding:      { bg: '#FBF3E0', border: '#EBD8AE', dot: '#D9A94F', label: '#7A5A26' },
  sleep:        { bg: '#EAF0F3', border: '#C3CDD2', dot: '#8FA5B1', label: '#47606D' },
  diaper:       { bg: '#F1EEE2', border: '#C6BDA0', dot: '#A2966F', label: '#5F5741' },
  tummy_time:   { bg: '#EBECDF', border: '#B9BAA4', dot: '#818267', label: '#4C4D3B' },
  pumping:      { bg: '#F3EBDE', border: '#D9C8A8', dot: '#B3915A', label: '#6E5836' },
  milestone:    { bg: '#F7EFF0', border: '#E3CBCF', dot: '#C99BA4', label: '#85555E' },
  doctor_visit: { bg: '#F6EAE3', border: '#D8B5A3', dot: '#A35C3D', label: '#7C452D' },
  note:         { bg: '#F4F1EC', border: '#DCD4C8', dot: '#A79E90', label: '#5F574B' },
}

// Per-subtype palette for feeding entries — shown in the timeline only.
// Aggregate views (DailySummary chart, week/month per-day stripes, legends)
// keep using ENTRY_COLORS.feeding so they don't fragment the eye.
const FEEDING_SUBTYPE_COLORS: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  breast: { bg: '#FBF3E0', border: '#EBD8AE', dot: '#D9A94F', label: '#7A5A26' }, // amarillo
  bottle: { bg: '#F3EBDE', border: '#D9C8A8', dot: '#B3915A', label: '#6E5836' }, // bronze
  solid:  { bg: '#F1EEE2', border: '#C6BDA0', dot: '#A2966F', label: '#5F5741' }, // arena
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  feeding: Milk,
  sleep: Moon,
  diaper: Droplets,
  tummy_time: Shapes,
  pumping: Milk,
  milestone: Star,
  doctor_visit: Stethoscope,
  note: StickyNote,
}

const FEEDING_SUBTYPE_ICONS: Record<string, LucideIcon> = {
  breast: Baby,
  bottle: Milk,
  solid:  Utensils,
}

function entryColors(entry: DailyLogEntryWithDetails) {
  if (entry.entry_type === 'feeding') {
    const fd = pick(entry.feeding_details)
    if (fd?.feeding_type && FEEDING_SUBTYPE_COLORS[fd.feeding_type]) {
      return FEEDING_SUBTYPE_COLORS[fd.feeding_type]
    }
  }
  return ENTRY_COLORS[entry.entry_type] ?? ENTRY_COLORS.note
}

function entryIcon(entry: DailyLogEntryWithDetails): LucideIcon {
  if (entry.entry_type === 'feeding') {
    const fd = pick(entry.feeding_details)
    if (fd?.feeding_type && FEEDING_SUBTYPE_ICONS[fd.feeding_type]) {
      return FEEDING_SUBTYPE_ICONS[fd.feeding_type]
    }
  }
  return TYPE_ICONS[entry.entry_type] ?? StickyNote
}

// PostgREST returns one-to-many embedded relations as arrays at runtime,
// even though the TypeScript types declare them as single objects.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(val: unknown): any {
  if (!val) return null
  return Array.isArray(val) ? val[0] ?? null : val
}

function entrySubtitle(entry: DailyLogEntryWithDetails): string {
  if (entry.entry_type === 'feeding') {
    const fd = pick(entry.feeding_details)
    if (!fd) return entry.notes ?? ''
    const parts: string[] = []
    if (fd.feeding_type === 'breast') parts.push('הנקה')
    else if (fd.feeding_type === 'bottle') parts.push('בקבוק')
    else if (fd.feeding_type === 'solid') parts.push('מוצק')
    if (fd.breast_side === 'left') parts.push('שמאל')
    else if (fd.breast_side === 'right') parts.push('ימין')
    else if (fd.breast_side === 'both') parts.push('שניהם')
    if (fd.duration_minutes) parts.push(formatDuration(fd.duration_minutes))
    if (fd.amount_ml) parts.push(`${fd.amount_ml} מ"ל`)
    return parts.join(' · ')
  }
  if (entry.entry_type === 'sleep') {
    const sd = pick(entry.sleep_details)
    if (!sd) return entry.notes ?? ''
    const parts: string[] = []
    if (sd.sleep_type === 'nap') parts.push('שנת צהריים')
    else if (sd.sleep_type === 'night') parts.push('שנת לילה')
    if (sd.duration_minutes) parts.push(formatDuration(sd.duration_minutes))
    return parts.join(' · ')
  }
  if (entry.entry_type === 'diaper') {
    const dd = pick(entry.diaper_details)
    if (!dd) return entry.notes ?? ''
    if (dd.diaper_type === 'wet') return 'פיפי'
    if (dd.diaper_type === 'dirty') return 'קקי'
    if (dd.diaper_type === 'both') return 'פיפי וקקי'
  }
  return ''
}

export default function DailyTimeline({ entries, onRefresh, onEditEntry, hideHeading }: Props) {
  const [photoDeletedIds, setPhotoDeletedIds] = useState<Set<string>>(new Set())

  async function deleteEntry(id: string) {
    await supabase.from('daily_log_entries').delete().eq('id', id)
    onRefresh()
  }

  function markPhotoDeleted(id: string) {
    setPhotoDeletedIds(prev => new Set(prev).add(id))
  }

  if (entries.length === 0) return null

  return (
    <div className="space-y-1.5">
      {!hideHeading && <h3 className="text-sm font-semibold text-musgo-600 px-1">ציר זמן</h3>}
      {entries.map((entry, idx) => {
        const colors = entryColors(entry)
        const subtitle = entrySubtitle(entry)
        const editable = !!onEditEntry && EDITABLE_TYPES.has(entry.entry_type)
        const cardTap = editable ? () => onEditEntry!(entry) : undefined
        return (
          <div key={entry.id} className="flex gap-2 items-start group">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center flex-shrink-0 pt-2.5">
              <div
                className="w-3 h-3 rounded-full border-2 border-white shadow"
                style={{ background: colors.dot }}
              />
              {idx < entries.length - 1 && (
                <div className="w-0.5 h-7 mt-1" style={{ background: colors.dot + '30' }} />
              )}
            </div>

            {/* Time */}
            <div className="pt-1 w-10 flex-shrink-0 text-right">
              <span className="text-[10px] font-bold text-sand-400">
                {entry.entry_time?.slice(0, 5)}
              </span>
            </div>

            {/* Card — tappable to edit when entry_type is in EDITABLE_TYPES.
                Other types render with cursor-default + no pencil icon. */}
            <div
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
              onClick={cardTap}
              onKeyDown={editable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cardTap?.() } } : undefined}
              className={`flex-1 rounded-2xl p-3 mb-1 transition-shadow ${editable ? 'cursor-pointer group-hover:shadow-md' : 'cursor-default'}`}
              style={{ background: colors.bg, border: `1.5px solid ${colors.border}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {(() => { const Glyph = entryIcon(entry); return <Glyph className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.label }} strokeWidth={2.2} /> })()}
                    <span className="text-sm font-bold" style={{ color: colors.label }}>
                      {entryTypeLabel(entry.entry_type)}
                    </span>
                    {editable && (
                      <Pencil
                        className="w-3 h-3 ml-auto opacity-50"
                        style={{ color: colors.label }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  {subtitle && (
                    <p className="text-xs mt-0.5" style={{ color: colors.label + 'BB' }}>
                      {subtitle}
                    </p>
                  )}
                  {entry.notes && entry.entry_type !== 'note' && (
                    <p className="text-xs text-sand-400 mt-0.5 italic">{entry.notes}</p>
                  )}
                  {entry.entry_type === 'note' && entry.notes && (
                    <p className="text-xs text-sand-600 mt-0.5">{entry.notes}</p>
                  )}
                </div>
                {entry.entry_type === 'diaper' && entry.photo_url && !photoDeletedIds.has(entry.id) && (
                  <DiaperPhotoThumbnail
                    storagePath={entry.photo_url}
                    entryId={entry.id}
                    onDeleted={() => markPhotoDeleted(entry.id)}
                  />
                )}
                {entry.entry_type === 'milestone' && entry.photo_url && !photoDeletedIds.has(entry.id) && (
                  <DiaperPhotoThumbnail
                    storagePath={entry.photo_url}
                    entryId={entry.id}
                    onDeleted={() => markPhotoDeleted(entry.id)}
                    bucket="milestone-media"
                    isVideo={entry.photo_url.endsWith('.mp4') || entry.photo_url.endsWith('.webm') || entry.photo_url.endsWith('.mov')}
                  />
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteEntry(entry.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-sand-300 hover:text-red-400 transition-all flex-shrink-0"
                  aria-label="מחיקה"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
