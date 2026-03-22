import { Trash2 } from 'lucide-react'
import type { DailyLogEntryWithDetails } from '../lib/supabase'
import { entryTypeLabel, entryTypeEmoji, formatDuration } from '../utils/dateUtils'
import { supabase } from '../lib/supabase'

type Props = {
  entries: DailyLogEntryWithDetails[]
  onRefresh: () => void
}

function entrySubtitle(entry: DailyLogEntryWithDetails): string {
  if (entry.entry_type === 'feeding' && entry.feeding_details) {
    const fd = entry.feeding_details
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
  if (entry.entry_type === 'sleep' && entry.sleep_details) {
    const sd = entry.sleep_details
    const parts: string[] = []
    if (sd.sleep_type === 'nap') parts.push('שנת צהריים')
    else if (sd.sleep_type === 'night') parts.push('שנת לילה')
    if (sd.duration_minutes) parts.push(formatDuration(sd.duration_minutes))
    return parts.join(' · ')
  }
  if (entry.entry_type === 'diaper' && entry.diaper_details) {
    const dd = entry.diaper_details
    if (dd.diaper_type === 'wet') return 'רטוב'
    if (dd.diaper_type === 'dirty') return 'מלוכלך'
    if (dd.diaper_type === 'both') return 'רטוב ומלוכלך'
  }
  return entry.notes ?? ''
}

export default function DailyTimeline({ entries, onRefresh }: Props) {
  async function deleteEntry(id: string) {
    await supabase.from('daily_log_entries').delete().eq('id', id)
    onRefresh()
  }

  if (entries.length === 0) return null

  return (
    <div className="space-y-2">
      {entries.map((entry, idx) => (
        <div key={entry.id} className="flex gap-3 items-start group">
          {/* Timeline line */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className="w-8 h-8 rounded-2xl bg-mustard-50 flex items-center justify-center text-base flex-shrink-0">
              {entryTypeEmoji(entry.entry_type)}
            </div>
            {idx < entries.length - 1 && (
              <div className="w-px h-4 bg-sand-200" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 bg-white rounded-2xl p-3 shadow-sm group-hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-sand-800">
                    {entryTypeLabel(entry.entry_type)}
                  </span>
                  <span className="text-xs text-sand-400">{entry.entry_time?.slice(0, 5)}</span>
                </div>
                {entrySubtitle(entry) && (
                  <p className="text-xs text-sand-500 mt-0.5">{entrySubtitle(entry)}</p>
                )}
                {entry.notes && entry.entry_type !== 'note' && (
                  <p className="text-xs text-sand-400 mt-0.5 italic">{entry.notes}</p>
                )}
                {entry.entry_type === 'note' && entry.notes && (
                  <p className="text-xs text-sand-600 mt-0.5">{entry.notes}</p>
                )}
              </div>
              <button
                onClick={() => deleteEntry(entry.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-sand-300 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
