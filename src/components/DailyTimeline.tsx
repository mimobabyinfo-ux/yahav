import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { DailyLogEntryWithDetails } from '../lib/supabase'
import { entryTypeLabel, entryTypeEmoji, formatDuration } from '../utils/dateUtils'
import { supabase } from '../lib/supabase'
import DiaperPhotoThumbnail from './DiaperPhotoThumbnail'

type Props = {
  entries: DailyLogEntryWithDetails[]
  onRefresh: () => void
}

// Color scheme per entry type
export const ENTRY_COLORS: Record<string, { bg: string; border: string; dot: string; label: string }> = {
  feeding:      { bg: '#EFF6FF', border: '#93C5FD', dot: '#3B82F6', label: '#1D4ED8' },
  sleep:        { bg: '#FEF2F2', border: '#FCA5A5', dot: '#EF4444', label: '#B91C1C' },
  diaper:       { bg: '#F0FDF4', border: '#86EFAC', dot: '#22C55E', label: '#15803D' },
  tummy_time:   { bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316', label: '#C2410C' },
  pumping:      { bg: '#F5F3FF', border: '#C4B5FD', dot: '#8B5CF6', label: '#6D28D9' },
  milestone:    { bg: '#FFFBEB', border: '#FCD34D', dot: '#F59E0B', label: '#B45309' },
  doctor_visit: { bg: '#F0FDFA', border: '#5EEAD4', dot: '#14B8A6', label: '#0F766E' },
  note:         { bg: '#F9FAFB', border: '#D1D5DB', dot: '#6B7280', label: '#374151' },
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
    if (dd.diaper_type === 'wet') return 'פיפי 💧'
    if (dd.diaper_type === 'dirty') return 'קקי 💩'
    if (dd.diaper_type === 'both') return 'פיפי וקקי'
  }
  return ''
}

export default function DailyTimeline({ entries, onRefresh }: Props) {
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
      <h3 className="text-sm font-semibold text-musgo-600 px-1">ציר זמן</h3>
      {entries.map((entry, idx) => {
        const colors = ENTRY_COLORS[entry.entry_type] ?? ENTRY_COLORS.note
        const subtitle = entrySubtitle(entry)
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

            {/* Card */}
            <div
              className="flex-1 rounded-2xl p-3 mb-1 transition-shadow group-hover:shadow-md"
              style={{ background: colors.bg, border: `1.5px solid ${colors.border}` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{entryTypeEmoji(entry.entry_type)}</span>
                    <span className="text-sm font-bold" style={{ color: colors.label }}>
                      {entryTypeLabel(entry.entry_type)}
                    </span>
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
                  onClick={() => deleteEntry(entry.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-sand-300 hover:text-red-400 transition-all flex-shrink-0"
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
